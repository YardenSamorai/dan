import { useMemo } from 'react';
import { DEFAULT_POLICIES, defaultNotifications, emptyTenant, SLUG_PATTERN, STAFF_COLORS, WEEKDAYS } from '../../domain/defaults';
import type { BusinessMember, User } from '../../domain/platform';
import type { Business, Staff, TenantData } from '../../domain/types';
import { ApiError, type AuthService, type BusinessDirectory, type Membership, type SessionInfo } from '../contracts';
import { DEMO_BUSINESS_IDS } from '../demo/seed';
import { getDb, getSession, latency, mutateDb, setSession, uid, useMockDb, useMockSession, type MockDatabase } from './db';

/**
 * MOCK AUTH. Signing in only records a user id in this browser — there are no
 * passwords, tokens or server sessions, and anyone with this device can open
 * any account. It exists so the product can be explored.
 */

export function sessionInfo(db: MockDatabase, userId: string, activeBusinessId: string | null): SessionInfo | null {
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  const memberships: Membership[] = db.members
    .filter((m) => m.userId === userId && db.tenants[m.businessId])
    .map((m) => {
      const b = db.tenants[m.businessId].business;
      return { ...m, business: { id: b.id, slug: b.slug, name: b.name, type: b.type, status: b.status, branding: b.branding } };
    });
  const active = memberships.find((m) => m.businessId === activeBusinessId) ?? memberships[0] ?? null;
  return { user, memberships, active };
}

const current = () => {
  const s = getSession();
  return s ? sessionInfo(getDb(), s.userId, s.activeBusinessId) : null;
};

export const mockAuth: AuthService = {
  ready: () => Promise.resolve(),
  method: 'email',
  providers: { google: false },
  signInWithPassword: () => Promise.reject(new ApiError('invalid')),
  signUpWithPassword: () => Promise.reject(new ApiError('invalid')),
  signInWithGoogle: () => Promise.reject(new ApiError('invalid')),

  useSession() {
    const db = useMockDb();
    const s = useMockSession();
    return useMemo(() => (s ? sessionInfo(db, s.userId, s.activeBusinessId) : null), [db, s]);
  },

  async signIn(email) {
    await latency(400);
    const db = getDb();
    const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) throw new ApiError('not_found');
    const first = db.members.find((m) => m.userId === user.id);
    setSession({ userId: user.id, activeBusinessId: first?.businessId ?? null });
    return current()!;
  },

  async signUp({ name, email, locale }) {
    await latency(500);
    const clean = email.trim().toLowerCase();
    if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new ApiError('invalid');
    if (getDb().users.some((u) => u.email.toLowerCase() === clean)) throw new ApiError('invalid');
    const user: User = { id: uid('u'), name: name.trim(), email: clean, locale, createdAt: new Date().toISOString() };
    mutateDb((d) => ({ ...d, users: [...d.users, user] }));
    setSession({ userId: user.id, activeBusinessId: null });
    return current()!;
  },

  async signOut() {
    await latency(150);
    setSession(null);
  },

  async switchBusiness(businessId) {
    const s = getSession();
    if (!s) throw new ApiError('unauthenticated');
    if (!getDb().members.some((m) => m.userId === s.userId && m.businessId === businessId)) throw new ApiError('forbidden');
    setSession({ ...s, activeBusinessId: businessId });
  },

  demoAccounts() {
    const db = getDb();
    return db.members
      .filter((m) => DEMO_BUSINESS_IDS.includes(m.businessId))
      .map((m) => {
        const t = db.tenants[m.businessId];
        return {
          user: db.users.find((u) => u.id === m.userId)!,
          label: { role: m.role, businessName: t.business.name, staffCount: t.staff.filter((s) => s.active).length },
        };
      })
      .filter((x) => x.user);
  },
};

export const mockDirectory: BusinessDirectory = {
  useSlugChecks() {},

  isSlugAvailable(slug) {
    return SLUG_PATTERN.test(slug) && !Object.values(getDb().tenants).some((t) => t.business.slug === slug);
  },

  async createBusiness(input) {
    await latency(600);
    const s = getSession();
    if (!s) throw new ApiError('unauthenticated');
    const user = getDb().users.find((u) => u.id === s.userId)!;
    if (!mockDirectory.isSlugAvailable(input.slug)) throw new ApiError('slug_taken');
    if (!input.name.trim() || !input.service.name.trim() || input.service.duration <= 0) throw new ApiError('invalid');

    const id = uid('biz_');
    const now = new Date().toISOString();
    const text = (v: string) => ({ en: v, [input.locale]: v }) as { en: string };
    const business: Business = {
      id,
      slug: input.slug,
      type: input.type,
      status: input.publish ? 'published' : 'draft',
      createdAt: now,
      publishedAt: input.publish ? now : undefined,
      name: text(input.name.trim()),
      tagline: { en: '' },
      description: { en: '' },
      timezone: input.timezone,
      currency: input.currency,
      defaultLocale: input.locale,
      address: text(input.address.trim()),
      phone: input.phone.trim(),
      email: user.email,
      social: {},
      branding: { accent: input.accent ?? 'fig' },
      hours: input.hours,
      policies: { ...DEFAULT_POLICIES, ...input.policies, allowAnyStaff: !input.solo },
      notifications: defaultNotifications(),
      subscription: { status: 'not_configured', planId: null },
    };
    const person = (sid: string, name: string, i: number, userId?: string): Staff => ({
      businessId: id,
      id: sid,
      name: text(name),
      role: { en: '' },
      bio: { en: '' },
      color: STAFF_COLORS[i % STAFF_COLORS.length],
      active: true,
      onlineBookable: true,
      schedule: Object.fromEntries(WEEKDAYS.map((d) => [d, { ranges: [...input.hours[d].ranges], breaks: [...input.hours[d].breaks] }])) as Staff['schedule'],
      userId,
    });
    const ownerStaffId = uid('st');
    const staff = [person(ownerStaffId, user.name, 0, user.id), ...(input.solo ? [] : input.team.filter((n) => n.trim()).map((n, i) => person(uid('st'), n.trim(), i + 1)))];
    const tenant: TenantData = {
      ...emptyTenant(business),
      staff,
      services: [
        {
          businessId: id,
          id: uid('svc'),
          categoryId: null,
          name: text(input.service.name.trim()),
          description: { en: '' },
          duration: input.service.duration,
          price: input.service.price,
          bufferBefore: 0,
          bufferAfter: 0,
          staffIds: staff.map((x) => x.id),
          active: true,
          onlineBookable: true,
        },
      ],
    };
    const member: BusinessMember = { id: uid('m'), businessId: id, userId: user.id, role: 'owner', staffId: ownerStaffId };
    mutateDb((d) => ({ ...d, members: [...d.members, member], tenants: { ...d.tenants, [id]: tenant } }));
    setSession({ userId: user.id, activeBusinessId: id });
    return { businessId: id, slug: input.slug };
  },
};
