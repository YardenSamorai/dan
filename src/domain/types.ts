import type { Locale, LText } from '../i18n/config';

/** ISO calendar date in the business's timezone, e.g. "2026-10-07". */
export type ISODate = string;
/** Minutes after local midnight in the business's timezone (540 = 09:00). */
export type Minutes = number;
/** 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Every tenant-owned record carries the tenant it belongs to. */
export type BusinessId = string;
interface Owned {
  businessId: BusinessId;
}

export interface TimeRange {
  start: Minutes;
  end: Minutes;
}

export interface DayHours {
  /** Empty = closed / not working. */
  ranges: TimeRange[];
  /** Recurring breaks inside the working ranges (e.g. lunch). */
  breaks: TimeRange[];
}

export type WeeklySchedule = Record<Weekday, DayHours>;

export type Channel = 'sms' | 'email' | 'whatsapp';

// ── Business (tenant) ────────────────────────────────────────────────

export type BusinessType = 'nails' | 'lashes_brows' | 'hair' | 'makeup' | 'skin' | 'massage' | 'fitness' | 'therapy' | 'tutoring' | 'other';

export interface BookingPolicies {
  /** Granularity of offered start times. */
  slotInterval: number;
  /** Minimum notice for online bookings. */
  leadTimeMinutes: number;
  maxAdvanceDays: number;
  /** Customers may cancel online up to this many hours before. */
  cancelWindowHours: number;
  rescheduleWindowHours: number;
  customerCanCancel: boolean;
  customerCanReschedule: boolean;
  allowAnyStaff: boolean;
  requireEmail: boolean;
  /** auto: online bookings are confirmed immediately. manual: they wait as "pending". */
  confirmationMode: 'auto' | 'manual';
}

export type TemplateKind = 'confirmation' | 'reminder' | 'reschedule' | 'cancellation' | 'rebook';

/** Stored settings may predate newer kinds; read them through `notificationsOf`. */
export interface NotificationSettings {
  confirmation: { enabled: boolean; channels: Channel[] };
  reminder: { enabled: boolean; hoursBefore: number; channels: Channel[] };
  reschedule: { enabled: boolean; channels: Channel[] };
  cancellation: { enabled: boolean; channels: Channel[] };
  /** "Time to book again", `Service.rebookAfterDays` after a visit. */
  rebook: { enabled: boolean; channels: Channel[] };
  templates: Record<TemplateKind, LText>;
}

/** Curated accents only, so every booking page stays inside the design system. */
export type AccentKey = 'fig' | 'rose' | 'clay' | 'sage' | 'ocean' | 'plum' | 'ink' | 'gold';

export interface Branding {
  accent: AccentKey;
  /** Any colour the owner picked; shown darkened if needed so white text on it stays readable. Overrides `accent`. */
  customAccent?: string;
  /** Small square logo. Mock adapter stores a data URL; a real backend stores an upload URL. */
  logoUrl?: string;
  /** Leaves the logo (or monogram) off the public pages; the name alone stands in. */
  hideLogo?: boolean;
  coverUrl?: string;
}

// ── Booking page layout ──────────────────────────────────────────────

/** Whole-page looks: typeface, shapes and surface treatment. Colour is chosen separately. */
export type ThemeKey = 'clean' | 'soft' | 'editorial' | 'night';
export type SectionKind = 'hero' | 'services' | 'gallery' | 'about' | 'team' | 'reviews' | 'faq' | 'info';
export type HeroLayout = 'centered' | 'split' | 'cover';
export type ServicesLayout = 'list' | 'cards' | 'tiles' | 'menu' | 'feature' | 'carousel';
/** `strip` scrolls by hand; `marquee` runs on its own in `flow` direction. */
export type GalleryLayout = 'grid' | 'masonry' | 'strip' | 'marquee';
export type GalleryFlow = 'left' | 'right';

/** A review (title = who, body = what they said) or a question (title = question, body = answer). */
export interface PageItem {
  id: string;
  title: LText;
  body: LText;
}

export interface PageSection {
  id: string;
  kind: SectionKind;
  visible: boolean;
  /** Replaces the default heading when set. */
  title?: LText;
  layout?: HeroLayout | ServicesLayout | GalleryLayout;
  /** About text. */
  body?: LText;
  /** About picture. */
  imageUrl?: string;
  /** Gallery pictures, in order. */
  images?: string[];
  /** Which way a marquee gallery runs. */
  flow?: GalleryFlow;
  /** Reviews or questions. */
  items?: PageItem[];
}

export interface PageConfig {
  theme: ThemeKey;
  /** Rendered top to bottom. The hero always stays first. */
  sections: PageSection[];
}

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
  whatsapp?: string;
}

export type SubscriptionStatus = 'not_configured' | 'trialing' | 'active' | 'past_due' | 'canceled';

/** Placeholder for the billing system. No plans exist yet; nothing here is charged. */
export interface SubscriptionRef {
  status: SubscriptionStatus;
  planId: string | null;
  currentPeriodEnd?: string;
}

export interface Business {
  id: BusinessId;
  /** Public booking URL: /book/{slug}. Unique across the platform. */
  slug: string;
  type: BusinessType;
  status: 'draft' | 'published';
  createdAt: string;
  publishedAt?: string;
  name: LText;
  tagline: LText;
  description: LText;
  timezone: string;
  currency: string;
  defaultLocale: Locale;
  address: LText;
  phone: string;
  email: string;
  social: SocialLinks;
  branding: Branding;
  /** Booking page layout. Missing until the owner first edits it; see `pageOf`. */
  page?: PageConfig;
  hours: WeeklySchedule;
  policies: BookingPolicies;
  notifications: NotificationSettings;
  /** Missing = email alerts for everything (see `alertsOf`). */
  alerts?: OwnerAlerts;
  subscription: SubscriptionRef;
  /** Secret calendar subscription links (ICS). Staff see only their own. */
  calendarFeeds?: CalendarFeed[];
  /** Open invite links for the team. Only people who manage the team see them. */
  invites?: Invite[];
  /** Getting-started checklist: steps the owner ticked by hand, and whether it's hidden. */
  setup?: { done: SetupStep[]; dismissed?: boolean };
  /** Messages sent, by month in the business's timezone ("2026-10"). Written only by the server's dispatcher. */
  usage?: Record<string, UsageCounts>;
}

export type SetupStep = 'page' | 'photos' | 'team' | 'publish' | 'calendar' | 'share' | 'firstBooking';

export interface CalendarFeed {
  /** Unguessable; part of the feed URL. Replacing it revokes the old link. */
  key: string;
  /** null = everyone's appointments. */
  staffId: string | null;
}

/** A single-use link that lets someone join the business. The link itself is the credential. */
export interface Invite {
  /** Unguessable; part of the link. */
  token: string;
  role: 'manager' | 'staff';
  /** The staff profile the person will work as; required for the staff role. */
  staffId: string | null;
  createdAt: string;
  expiresAt: string;
}

// ── Catalogue ────────────────────────────────────────────────────────

export interface ServiceCategory extends Owned {
  id: string;
  name: LText;
}

export interface StaffTerms {
  duration?: Minutes;
  price?: number;
}

export interface Service extends Owned {
  id: string;
  categoryId: string | null;
  name: LText;
  description: LText;
  duration: Minutes;
  price: number;
  /** Prep held before the appointment. */
  bufferBefore: Minutes;
  /** Cleanup held after the appointment. */
  bufferAfter: Minutes;
  /** Staff who perform it. */
  staffIds: string[];
  /** Per-person duration and price, keyed by staff id. Missing fields fall back to the service's own. */
  staffTerms?: Record<string, StaffTerms>;
  active: boolean;
  onlineBookable: boolean;
  /** Takes the whole place (e.g. one shared room): while booked, nobody else can be booked, and it needs everyone free. */
  blocksAll?: boolean;
  imageUrl?: string;
  /** Invite the customer to book again this many days after the visit (unless they already have). */
  rebookAfterDays?: number;
}

export interface AddOn extends Owned {
  id: string;
  name: LText;
  duration: Minutes;
  price: number;
  active: boolean;
}

// ── People & time ────────────────────────────────────────────────────

/** A bookable person. A solo business has exactly one, usually linked to the owner's user. */
export interface Staff extends Owned {
  id: string;
  name: LText;
  role: LText;
  bio: LText;
  /** Calendar accent. */
  color: string;
  avatarUrl?: string;
  active: boolean;
  onlineBookable: boolean;
  schedule: WeeklySchedule;
  /** The platform user who signs in as this person, if any. */
  userId?: string;
}

export type TimeOffKind = 'vacation' | 'sick' | 'personal' | 'training' | 'other';

export interface TimeOff extends Owned {
  id: string;
  staffId: string;
  from: ISODate;
  /** Inclusive. */
  to: ISODate;
  kind: TimeOffKind;
  note?: string;
}

export type BlockKind = 'blocked' | 'break' | 'personal';

/** One-off unavailable time on a single day. */
export interface Block extends Owned {
  id: string;
  /** null = whole business. */
  staffId: string | null;
  date: ISODate;
  start: Minutes;
  end: Minutes;
  kind: BlockKind;
  label: string;
}

/** Replaces the weekly schedule for one date: a holiday, special hours, a one-off shift. */
export interface ScheduleException extends Owned {
  id: string;
  /** null = the business's opening hours. */
  staffId: string | null;
  date: ISODate;
  closed: boolean;
  ranges: TimeRange[];
  breaks: TimeRange[];
  label: string;
}

export interface Customer extends Owned {
  id: string;
  name: string;
  phone: string;
  email?: string;
  locale: Locale;
  note?: string;
  createdAt: string;
  /** Can't book or reschedule online (matched by phone or email). Staff can still book them by hand. */
  blocked?: boolean;
}

// ── Appointments ─────────────────────────────────────────────────────

export type AppointmentStatus = 'pending' | 'confirmed' | 'arrived' | 'completed' | 'cancelled' | 'no_show';
export type Actor = 'customer' | 'staff' | 'system';

export interface AppointmentEvent {
  at: string;
  type: 'created' | 'rescheduled' | 'cancelled' | 'status' | 'note';
  by: Actor;
  detail?: string;
}

export interface Appointment extends Owned {
  id: string;
  /** Short human reference, e.g. "T7K4Q". */
  code: string;
  customerId: string;
  staffId: string;
  serviceId: string;
  addOnIds: string[];
  date: ISODate;
  start: Minutes;
  duration: Minutes;
  price: number;
  status: AppointmentStatus;
  source: 'online' | 'studio';
  /** Customer chose "any available". */
  anyStaff: boolean;
  /** Shared by appointments booked together as a repeating series. */
  seriesId?: string;
  note?: string;
  internalNote?: string;
  cancellation?: { at: string; by: Actor; reason?: string };
  createdAt: string;
  updatedAt: string;
  history: AppointmentEvent[];
}

/**
 * A message the system generated for a customer. Without a messaging provider
 * these are only queued — never delivered — and the UI says so.
 */
export interface OutboxMessage extends Owned {
  id: string;
  appointmentId: string;
  kind: MessageKind;
  /** Missing = the customer. `owner` = the business's own contact details (alerts). */
  to?: 'owner';
  channel: Channel;
  locale: Locale;
  body: string;
  /** When it is (or was) due. */
  at: string;
  /**
   * queued/scheduled: waiting (scheduled = due later). sent: handed to the provider.
   * failed: gave up after retries. skipped: too late to be useful, or nobody to send it to.
   */
  state: 'queued' | 'scheduled' | 'sent' | 'failed' | 'skipped';
  attempts?: number;
  /** When it was sent, failed or skipped. */
  doneAt?: string;
  /** Short reason for failed / skipped. */
  error?: string;
  /** The provider's id for the sent message (WhatsApp), to match its delivery reports. */
  providerId?: string;
  /** What the provider reported after sending (WhatsApp). */
  delivery?: 'delivered' | 'read';
  /** This SMS stands in for a WhatsApp message that couldn't be delivered: that message's id. */
  fallbackFor?: string;
}

/** What went out in one month. WhatsApp marketing (book-again invitations) costs several times more than appointment messages. */
export interface UsageCounts {
  whatsapp?: number;
  whatsappMarketing?: number;
  sms?: number;
  /** Gateway credits: a long SMS takes more than one. */
  smsCredits?: number;
  email?: number;
}

/** Messages to the customer use the owner's templates; alerts to the business use fixed wording. */
export type MessageKind = TemplateKind | OwnerAlertKind;
export type OwnerAlertKind = 'ownerBooked' | 'ownerCancelled' | 'ownerRescheduled';

/** What the business hears about online activity, and how. Sent to the business's email / phone. */
export interface OwnerAlerts {
  channels: ('email' | 'sms')[];
  booked: boolean;
  /** Cancelled or moved by the customer. */
  changed: boolean;
}

/** Everything one tenant owns. The scheduling engine operates on a single tenant at a time. */
export interface TenantData {
  business: Business;
  categories: ServiceCategory[];
  services: Service[];
  addOns: AddOn[];
  staff: Staff[];
  timeOff: TimeOff[];
  blocks: Block[];
  exceptions: ScheduleException[];
  customers: Customer[];
  appointments: Appointment[];
  outbox: OutboxMessage[];
}
