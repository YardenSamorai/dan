import type { Locale, LText } from '../i18n/config';
import type { BusinessMember, Role, User } from '../domain/platform';
import type { Conflict, Slot } from '../domain/scheduling';
import type { JoinBlock } from '../domain/classes';
import type {
  AccentKey,
  AddOn,
  Appointment,
  AppointmentStatus,
  Block,
  BookingPolicies,
  Branding,
  Business,
  BusinessType,
  Channel,
  ClassSession,
  Customer,
  Invite,
  ISODate,
  Minutes,
  PageConfig,
  ScheduleException,
  Service,
  ServiceCategory,
  Staff,
  TenantData,
  TimeOff,
  Weekday,
  WeeklySchedule,
} from '../domain/types';

/**
 * DATA CONTRACTS. The UI depends only on these shapes. Today they are
 * implemented by mock adapters over localStorage (./mock/*); a real backend
 * implements the same contracts over HTTP.
 *
 * Security model the backend MUST enforce (the mock only imitates it):
 *  • Every workspace call is scoped to ctx.businessId and the server checks
 *    the caller is a member of that business, with a role allowed to act.
 *  • Records are always loaded by (businessId, id), never by id alone.
 *  • Public booking endpoints are addressed by slug and only ever return the
 *    public projection below plus computed availability — never customers,
 *    other appointments, notes or staff schedules beyond working days.
 *  • Managing a booking from the customer side requires a booking token
 *    (here: the appointment id; in production a signed, expiring token).
 */

export type ApiErrorCode =
  | 'slot_taken'
  | 'not_found'
  | 'policy'
  | 'blocked'
  | 'invalid'
  | 'forbidden'
  | 'unauthenticated'
  | 'slug_taken'
  | 'too_large'
  | 'rate_limited'
  | 'exists'
  | 'network'
  | 'server';

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    public conflict?: Conflict,
  ) {
    super(code);
  }
}

// ── Auth & platform ──────────────────────────────────────────────────

export interface Membership extends BusinessMember {
  business: Pick<Business, 'id' | 'slug' | 'name' | 'type' | 'status' | 'branding'>;
}

export interface SessionInfo {
  user: User;
  memberships: Membership[];
  /** The workspace currently open in /app. */
  active: Membership | null;
}

export interface AuthService {
  /** Resolves once the stored session is known; render after it so signed-in people aren't bounced to sign-in. */
  ready(): Promise<void>;
  useSession(): SessionInfo | null;
  /**
   * How people sign in. `email`: type an address and you're in (demo and local
   * development only). `password`: email + password (plus Google, if enabled).
   */
  readonly method: 'email' | 'password';
  readonly providers: { google: boolean };
  /** `email` method only. */
  signIn(email: string): Promise<SessionInfo>;
  /** `email` method only. */
  signUp(input: { name: string; email: string; locale: Locale }): Promise<SessionInfo>;
  /** `password` method. Throws `invalid` for a wrong email/password pair, `rate_limited` after too many tries. */
  signInWithPassword(input: { email: string; password: string }): Promise<SessionInfo>;
  /** `password` method. The account is ready at once (no confirmation email). Throws `exists` for a taken email, `invalid` for a weak password. */
  signUpWithPassword(input: { name: string; email: string; password: string; locale: Locale }): Promise<SessionInfo>;
  /** `password` method with Google enabled: leaves the page for Google and comes back to `next`. */
  signInWithGoogle(next: string): Promise<void>;
  /** `password` method. Emails a one-time code; says nothing about whether the address has an account. Throws `rate_limited`. */
  requestPasswordReset(email: string): Promise<void>;
  /** `password` method. Checks the emailed code, sets the new password and signs in. Throws `invalid` for a wrong or expired code, `policy` for a rejected password (too weak, or the same as before). */
  resetPassword(input: { email: string; code: string; password: string }): Promise<SessionInfo>;
  signOut(): Promise<void>;
  switchBusiness(businessId: string): Promise<void>;
  /** Demo accounts available for one-click sign-in (mock only; empty with a real backend). */
  demoAccounts(): { user: User; label: { role: Role; businessName: LText; staffCount: number } }[];
}

export interface NewBusinessInput {
  name: string;
  slug: string;
  type: BusinessType;
  locale: Locale;
  timezone: string;
  currency: string;
  phone: string;
  address: string;
  service: { name: string; duration: Minutes; price: number };
  hours: WeeklySchedule;
  solo: boolean;
  /** Extra team members (names only); the owner is always bookable unless they opt out later. */
  team: string[];
  policies: Pick<BookingPolicies, 'leadTimeMinutes' | 'cancelWindowHours' | 'confirmationMode'>;
  accent?: AccentKey;
  publish: boolean;
}

export interface BusinessDirectory {
  /** May answer from cache; call `useSlugChecks()` in the component so it re-renders when the real answer arrives. */
  isSlugAvailable(slug: string): boolean;
  useSlugChecks(): void;
  createBusiness(input: NewBusinessInput): Promise<{ businessId: string; slug: string }>;
}

// ── Public booking (anonymous, by slug) ──────────────────────────────

export type PublicService = Pick<
  Service,
  'id' | 'categoryId' | 'name' | 'description' | 'duration' | 'price' | 'bufferBefore' | 'bufferAfter' | 'staffIds' | 'staffTerms' | 'imageUrl' | 'capacity'
>;

/** A class session as the booking page sees it: counts only, never who joined. */
export interface PublicSession {
  id: string;
  serviceId: string;
  staffId: string;
  date: ISODate;
  start: Minutes;
  duration: Minutes;
  price: number;
  capacity: number;
  seatsLeft: number;
  /** People on the waitlist. */
  waiting: number;
  /** Why it can't be joined online right now, if it can't. */
  block: JoinBlock | null;
}

export interface SessionJoinInput {
  sessionId: string;
  customer: PublicBookingInput['customer'];
}

export interface WaitlistResult {
  sessionId: string;
  /** 1 = first in line. */
  position: number;
}
export type PublicStaff = Pick<Staff, 'id' | 'name' | 'role' | 'bio' | 'color' | 'avatarUrl'> & { workingDays: Weekday[] };
export type PublicPolicies = Pick<
  BookingPolicies,
  | 'slotInterval'
  | 'leadTimeMinutes'
  | 'maxAdvanceDays'
  | 'cancelWindowHours'
  | 'rescheduleWindowHours'
  | 'customerCanCancel'
  | 'customerCanReschedule'
  | 'allowAnyStaff'
  | 'requireEmail'
  | 'confirmationMode'
>;

export interface PublicBusiness {
  id: string;
  slug: string;
  type: BusinessType;
  status: Business['status'];
  name: LText;
  tagline: LText;
  description: LText;
  timezone: string;
  currency: string;
  defaultLocale: Locale;
  address: LText;
  phone: string;
  email: string;
  social: Business['social'];
  branding: Business['branding'];
  /** Always resolved: the saved layout or the default one. */
  page: PageConfig;
  hours: WeeklySchedule;
  /** Upcoming business-wide closures and special hours. */
  specialDays: Pick<ScheduleException, 'date' | 'closed' | 'ranges' | 'label'>[];
  policies: PublicPolicies;
  reminderHoursBefore: number | null;
  categories: Pick<ServiceCategory, 'id' | 'name'>[];
  services: PublicService[];
  addOns: Pick<AddOn, 'id' | 'name' | 'duration' | 'price'>[];
  staff: PublicStaff[];
}

/** What the customer who made a booking can see about it. */
export interface PublicBooking {
  id: string;
  code: string;
  serviceId: string;
  addOnIds: string[];
  staffId: string;
  anyStaff: boolean;
  date: ISODate;
  start: Minutes;
  duration: Minutes;
  price: number;
  status: AppointmentStatus;
  customerFirstName: string;
  contactPhone: string;
  cancellation?: Appointment['cancellation'];
  /** A seat in a class session. */
  sessionId?: string;
}

export interface AvailabilityQuery {
  serviceId: string;
  addOnIds?: string[];
  staffId: string | 'any';
  /** When moving an existing booking, its own time doesn't block itself. */
  excludeBookingId?: string;
}

export interface PublicBookingInput {
  serviceId: string;
  addOnIds: string[];
  staffId: string | 'any';
  date: ISODate;
  start: Minutes;
  customer: { name: string; phone: string; email?: string; note?: string; locale: Locale };
}

export interface PublicBookingApi {
  /** null = still loading; undefined = not found or not visible. `preview` = unpublished, shown only to its members. */
  useBusiness(slug: string): { business: PublicBusiness; preview: boolean } | null | undefined;
  slots(slug: string, q: AvailabilityQuery & { date: ISODate }): Slot[];
  firstAvailable(slug: string, q: AvailabilityQuery, from: ISODate): ISODate | null;
  /** "Today" in the business's timezone. */
  today(slug: string): ISODate;
  createBooking(slug: string, input: PublicBookingInput): Promise<PublicBooking>;
  /** null = still loading; undefined = no such booking. */
  useBooking(slug: string, token: string): PublicBooking | null | undefined;
  /**
   * Bookings for a mobile number, proven by the customer's first name (every
   * upcoming booking) or a booking ref (that booking). Empty when nothing
   * matches; throws `rate_limited` after repeated misses for the same number.
   */
  findBookings(slug: string, phone: string, proof: string): Promise<PublicBooking[]>;
  cancelBooking(slug: string, token: string): Promise<PublicBooking>;
  rescheduleBooking(slug: string, token: string, to: { date: ISODate; start: Minutes }): Promise<PublicBooking>;
  /** Sessions of a class from `from` for `days` days, including full ones. */
  sessions(slug: string, q: { serviceId: string; from: ISODate; days: number }): PublicSession[];
  /** Takes a seat. Throws `slot_taken` when the session filled up, `policy` past the sign-up cutoff, `exists` when this phone already has a seat. */
  joinSession(slug: string, input: SessionJoinInput): Promise<PublicBooking>;
  /** Only for a full session that's otherwise open; joining twice keeps the first place. */
  joinWaitlist(slug: string, input: SessionJoinInput): Promise<WaitlistResult>;
}

// ── Workspace (authenticated member of one business) ─────────────────

export interface TenantContext {
  businessId: string;
  userId: string;
  role: Role;
  /** The member's own bookable profile, if any. */
  staffId: string | null;
}

export interface CustomerInput {
  name: string;
  phone: string;
  email?: string;
  note?: string;
  locale: Locale;
}

export interface CustomerImportResult {
  added: number;
  updated: number;
  unchanged: number;
  /** Rows the server refused (no name, no usable phone). */
  invalid: number;
}

export interface StudioBookingInput {
  serviceId: string;
  addOnIds: string[];
  staffId: string | 'any';
  date: ISODate;
  start: Minutes;
  customer: CustomerInput;
  customerId?: string;
  /** Allow booking outside the usual shift (never over another appointment). */
  force?: boolean;
}

export interface RepeatInput {
  everyWeeks: number;
  /** Total appointments, the first one included. */
  count: number;
}

export const REPEAT_LIMITS = { everyWeeks: 8, count: 26 } as const;

export interface SeriesResult {
  created: Appointment[];
  /** Dates that could not be booked; the rest of the series still was. */
  skipped: { date: ISODate; conflict: Conflict }[];
}

export interface SessionInput {
  serviceId: string;
  staffId: string;
  date: ISODate;
  start: Minutes;
  /** Defaults to the service's capacity. */
  capacity?: number;
  note?: string;
  /** Allow it outside the usual shift (never over another appointment). */
  force?: boolean;
}

export interface SessionSeriesResult {
  created: ClassSession[];
  skipped: { date: ISODate; conflict: Conflict }[];
}

export interface SessionPatch {
  date?: ISODate;
  start?: Minutes;
  staffId?: string;
  capacity?: number;
  note?: string;
  force?: boolean;
}

export const CAPACITY_LIMIT = 200;

export interface RescheduleInput {
  date: ISODate;
  start: Minutes;
  staffId?: string;
  force?: boolean;
}

/** Everything the page editor saves, in one go. */
export interface PageSaveInput {
  page: PageConfig;
  branding: Branding;
  tagline: LText;
  description: LText;
  /** Changed photos by id; null removes the photo. */
  servicePhotos: Record<string, string | null>;
  staffPhotos: Record<string, string | null>;
}

/** Commands for one tenant. Implementations must authorize every call against ctx. */
export interface WorkspaceApi {
  readonly ctx: TenantContext;
  createAppointment(input: StudioBookingInput): Promise<Appointment>;
  /** The first date must be free; later dates that aren't are skipped and reported. */
  createAppointmentSeries(input: StudioBookingInput, repeat: RepeatInput): Promise<SeriesResult>;
  rescheduleAppointment(id: string, input: RescheduleInput): Promise<Appointment>;
  cancelAppointment(id: string, reason?: string): Promise<Appointment>;
  setAppointmentStatus(id: string, status: AppointmentStatus): Promise<Appointment>;
  updateAppointmentNotes(id: string, internalNote: string): Promise<Appointment>;
  /** Opens a class session, or a weekly series of them (`repeat`): the first date must be free, later busy dates are skipped. */
  createSessions(input: SessionInput, repeat?: RepeatInput): Promise<SessionSeriesResult>;
  /** Moving a session moves everyone in it and tells them. Capacity can't go below the seats taken. */
  updateSession(id: string, patch: SessionPatch): Promise<ClassSession>;
  /** Cancels this session, or it and the rest of its series (`following`), and everyone's seats in them. Returns how many sessions. */
  cancelSessions(id: string, scope: 'one' | 'following', reason?: string): Promise<number>;
  /** The team adds someone; works past the online cutoff, never over capacity. */
  addParticipant(sessionId: string, customer: CustomerInput, customerId?: string): Promise<Appointment>;
  removeFromWaitlist(sessionId: string, entryId: string): Promise<void>;
  createCustomer(input: CustomerInput): Promise<Customer>;
  saveCustomer(c: Customer): Promise<Customer>;
  /**
   * Adds many customers at once (a spreadsheet import), up to IMPORT_LIMIT.
   * Someone already on file (same phone) keeps their name; missing email and new notes are added.
   */
  importCustomers(rows: CustomerInput[]): Promise<CustomerImportResult>;
  saveService(s: Service): Promise<Service>;
  saveAddOn(a: AddOn): Promise<AddOn>;
  saveCategory(c: ServiceCategory): Promise<ServiceCategory>;
  saveStaff(s: Staff): Promise<Staff>;
  addTimeOff(t: Omit<TimeOff, 'id' | 'businessId'>): Promise<TimeOff>;
  removeTimeOff(id: string): Promise<void>;
  addBlock(b: Omit<Block, 'id' | 'businessId'>): Promise<Block>;
  removeBlock(id: string): Promise<void>;
  saveException(e: Omit<ScheduleException, 'id' | 'businessId'> & { id?: string }): Promise<ScheduleException>;
  removeException(id: string): Promise<void>;
  updateBusiness(patch: Partial<Omit<Business, 'id' | 'subscription' | 'createdAt'>>): Promise<Business>;
  setPublished(published: boolean): Promise<Business>;
  /** Throws `too_large` when the photos don't fit in storage; nothing is saved then. */
  savePage(input: PageSaveInput): Promise<Business>;
  /**
   * The secret key of a calendar subscription link; created on first use.
   * `rotate` replaces it, so the old link stops working. Staff may only ask for their own.
   */
  calendarFeed(staffId: string | null, rotate?: boolean): Promise<string>;
  /**
   * A single-use join link token, valid for INVITE_DAYS. The staff role needs a staff
   * profile nobody signs in as yet; a manager may optionally have one.
   */
  createInvite(input: { role: Invite['role']; staffId: string | null }): Promise<string>;
  revokeInvite(token: string): Promise<void>;
  /** Takes away someone's access. Nobody can remove the owner or themselves; only the owner removes managers. */
  removeMember(memberId: string): Promise<void>;
  /** Owner only. Permanently removes the business, its data and everyone's access. `confirmSlug` must match. */
  deleteBusiness(confirmSlug: string): Promise<void>;
  /** This browser gets push notifications about what customers do online (staff: about their own appointments). */
  savePushDevice(device: PushDeviceInput): Promise<void>;
  removePushDevice(endpoint: string): Promise<void>;
  resetDemo(): Promise<void>;
}

/** A browser's push subscription: its address and keys, base64url. */
export interface PushDeviceInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** A person with sign-in access to the workspace. */
export interface MemberInfo {
  id: string;
  role: Role;
  staffId: string | null;
  user: Pick<User, 'id' | 'name' | 'email'>;
}

export interface WorkspaceData {
  /** The tenant's data as this member is allowed to see it (staff see their own schedule). */
  useTenant(ctx: TenantContext): TenantData | undefined;
  /** Members of the workspace; empty unless ctx may manage the team. */
  useMembers(ctx: TenantContext): MemberInfo[];
  api(ctx: TenantContext): WorkspaceApi;
}

export interface PlatformInfo {
  /** Message channels that really deliver. Messages on other channels are kept, not sent. */
  channels: Channel[];
  /** The server's public key for push notifications; missing when push isn't set up. */
  pushKey?: string;
}

export interface PlatformService {
  /** null while loading. */
  useInfo(): PlatformInfo | null;
}

export const INVITE_DAYS = 7;

/** What someone opening a join link sees before accepting. */
export interface InvitePreview {
  businessName: LText;
  branding: Branding;
  role: Invite['role'];
  staffName: LText | null;
}

export interface InviteService {
  /** null when the link is wrong, used, revoked or expired. */
  peek(slug: string, token: string): Promise<InvitePreview | null>;
  /** Signed-in callers only. Joins the business (or does nothing if already a member) and returns its id. Throws `not_found` for a dead link. */
  accept(slug: string, token: string): Promise<string>;
}
