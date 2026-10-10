import type { Locale, LText } from '../i18n/config';
import type { BusinessMember, Role, User } from '../domain/platform';
import type { Conflict, Slot } from '../domain/scheduling';
import type {
  AddOn,
  Appointment,
  AppointmentStatus,
  Block,
  BookingPolicies,
  Business,
  BusinessType,
  Customer,
  ISODate,
  Minutes,
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

export type ApiErrorCode = 'slot_taken' | 'not_found' | 'policy' | 'invalid' | 'forbidden' | 'unauthenticated' | 'slug_taken';

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
  useSession(): SessionInfo | null;
  /** Mock: sign in by email only. A real adapter uses a password / magic link / OAuth. */
  signIn(email: string): Promise<SessionInfo>;
  signUp(input: { name: string; email: string; locale: Locale }): Promise<SessionInfo>;
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
  publish: boolean;
}

export interface BusinessDirectory {
  isSlugAvailable(slug: string): boolean;
  createBusiness(input: NewBusinessInput): Promise<{ businessId: string; slug: string }>;
}

// ── Public booking (anonymous, by slug) ──────────────────────────────

export type PublicService = Pick<
  Service,
  'id' | 'categoryId' | 'name' | 'description' | 'duration' | 'price' | 'bufferBefore' | 'bufferAfter' | 'staffIds' | 'imageUrl'
>;
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
  /** undefined = not found or not visible. `preview` = unpublished, shown only to its members. */
  useBusiness(slug: string): { business: PublicBusiness; preview: boolean } | undefined;
  slots(slug: string, q: AvailabilityQuery & { date: ISODate }): Slot[];
  firstAvailable(slug: string, q: AvailabilityQuery, from: ISODate): ISODate | null;
  /** "Today" in the business's timezone. */
  today(slug: string): ISODate;
  createBooking(slug: string, input: PublicBookingInput): Promise<PublicBooking>;
  useBooking(slug: string, token: string): PublicBooking | undefined;
  findBooking(slug: string, code: string, phone: string): Promise<PublicBooking | null>;
  cancelBooking(slug: string, token: string): Promise<PublicBooking>;
  rescheduleBooking(slug: string, token: string, to: { date: ISODate; start: Minutes }): Promise<PublicBooking>;
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

export interface RescheduleInput {
  date: ISODate;
  start: Minutes;
  staffId?: string;
  force?: boolean;
}

/** Commands for one tenant. Implementations must authorize every call against ctx. */
export interface WorkspaceApi {
  readonly ctx: TenantContext;
  createAppointment(input: StudioBookingInput): Promise<Appointment>;
  rescheduleAppointment(id: string, input: RescheduleInput): Promise<Appointment>;
  cancelAppointment(id: string, reason?: string): Promise<Appointment>;
  setAppointmentStatus(id: string, status: AppointmentStatus): Promise<Appointment>;
  updateAppointmentNotes(id: string, internalNote: string): Promise<Appointment>;
  createCustomer(input: CustomerInput): Promise<Customer>;
  saveCustomer(c: Customer): Promise<Customer>;
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
  resetDemo(): Promise<void>;
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
