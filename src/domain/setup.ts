import type { SetupStep, TenantData } from './types';

export const SETUP_STEPS: SetupStep[] = ['page', 'photos', 'team', 'publish', 'calendar', 'share', 'firstBooking'];

/** Steps the owner can tick themselves; the rest complete only when the thing really happened. */
export const MANUAL_STEPS: ReadonlySet<SetupStep> = new Set(['team', 'share']);

/** What the data already shows as done, plus anything ticked by hand. */
export function setupProgress(t: TenantData): Record<SetupStep, boolean> {
  const b = t.business;
  const ticked = new Set(b.setup?.done ?? []);
  const auto: Record<SetupStep, boolean> = {
    page: !!b.page,
    photos: !!(b.branding.logoUrl || b.branding.coverUrl || t.services.some((s) => s.imageUrl) || t.staff.some((s) => s.avatarUrl)),
    team: t.staff.filter((s) => s.active).length > 1,
    publish: b.status === 'published',
    calendar: !!b.calendarFeeds?.length,
    share: false,
    firstBooking: t.appointments.some((a) => a.source === 'online'),
  };
  return Object.fromEntries(SETUP_STEPS.map((s) => [s, auto[s] || (MANUAL_STEPS.has(s) && ticked.has(s))])) as Record<SetupStep, boolean>;
}
