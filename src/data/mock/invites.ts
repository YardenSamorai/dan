import type { BusinessMember } from '../../domain/platform';
import type { Invite, TenantData } from '../../domain/types';
import { ApiError, type InviteService } from '../contracts';
import { getDb, getSession, latency, mutateDb, setSession, uid, type MockDatabase } from './db';
import { bySlug } from './public';

/** The live invite behind a link, if any. Tokens are compared whole; expired ones count as gone. */
function findInvite(db: MockDatabase, slug: string, token: string): { t: TenantData; invite: Invite } | null {
  const t = bySlug(db, slug);
  const invite = t?.business.invites?.find((i) => i.token === token && i.expiresAt > new Date().toISOString());
  return t && invite ? { t, invite } : null;
}

export const mockInvites: InviteService = {
  async peek(slug, token) {
    await latency(150);
    const hit = findInvite(getDb(), slug, token);
    if (!hit) return null;
    const { t, invite } = hit;
    const staff = invite.staffId ? t.staff.find((s) => s.id === invite.staffId) : undefined;
    return { businessName: t.business.name, branding: t.business.branding, role: invite.role, staffName: staff?.name ?? null };
  },

  async accept(slug, token) {
    await latency(300);
    const s = getSession();
    if (!s) throw new ApiError('unauthenticated');
    const db = getDb();
    const hit = findInvite(db, slug, token);
    if (!hit) throw new ApiError('not_found');
    const { t, invite } = hit;
    const B = t.business.id;
    const already = db.members.some((m) => m.businessId === B && m.userId === s.userId);
    const staff = invite.staffId ? t.staff.find((x) => x.id === invite.staffId) : undefined;
    if (!already && invite.staffId && (!staff || (staff.userId && staff.userId !== s.userId))) throw new ApiError('not_found');
    const member: BusinessMember = { id: uid('m'), businessId: B, userId: s.userId, role: invite.role, staffId: staff?.id ?? null };
    mutateDb((d) => {
      const cur = d.tenants[B];
      const business = { ...cur.business, invites: (cur.business.invites ?? []).filter((i) => i.token !== token) };
      return {
        ...d,
        members: already ? d.members : [...d.members, member],
        tenants: {
          ...d.tenants,
          [B]: { ...cur, business, staff: already || !staff ? cur.staff : cur.staff.map((x) => (x.id === staff.id ? { ...x, userId: s.userId } : x)) },
        },
      };
    });
    setSession({ ...s, activeBusinessId: B });
    return B;
  },
};
