import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { workspace, type Membership, type SessionInfo, type TenantContext, type WorkspaceApi } from '../data';
import { can as roleCan, type Permission } from '../domain/permissions';
import type { Role } from '../domain/platform';
import type { Staff, TenantData } from '../domain/types';
import { FormatScope } from '../i18n/I18nProvider';

export interface Workspace {
  session: SessionInfo;
  membership: Membership;
  ctx: TenantContext;
  role: Role;
  can: (p: Permission) => boolean;
  /** Role-scoped tenant data (staff members only receive their own schedule). */
  tenant: TenantData;
  api: WorkspaceApi;
  /** The signed-in member's own bookable profile. */
  me: Staff | undefined;
  /** One active bookable person — hide team-oriented UI. */
  solo: boolean;
}

const Ctx = createContext<Workspace | null>(null);

export function WorkspaceProvider({ session, membership, fallback, children }: { session: SessionInfo; membership: Membership; fallback: ReactNode; children: ReactNode }) {
  const ctx = useMemo<TenantContext>(
    () => ({ businessId: membership.businessId, userId: session.user.id, role: membership.role, staffId: membership.staffId }),
    [membership.businessId, membership.role, membership.staffId, session.user.id],
  );
  const tenant = workspace.useTenant(ctx);
  const api = useMemo(() => workspace.api(ctx), [ctx]);

  const value = useMemo<Workspace | null>(() => {
    if (!tenant) return null;
    return {
      session,
      membership,
      ctx,
      role: ctx.role,
      can: (p) => roleCan(ctx.role, p),
      tenant,
      api,
      me: tenant.staff.find((s) => s.id === ctx.staffId),
      solo: tenant.staff.filter((s) => s.active).length <= 1,
    };
  }, [session, membership, ctx, tenant, api]);

  if (!value) return <>{fallback}</>;
  return (
    <Ctx.Provider value={value}>
      <FormatScope currency={value.tenant.business.currency} timeZone={value.tenant.business.timezone}>
        {children}
      </FormatScope>
    </Ctx.Provider>
  );
}

export function useWorkspace(): Workspace {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkspace outside WorkspaceProvider');
  return v;
}
