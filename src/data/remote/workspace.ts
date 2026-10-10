import { useEffect, useSyncExternalStore } from 'react';
import type { TenantData } from '../../domain/types';
import type { MemberInfo, TenantContext, WorkspaceApi, WorkspaceData } from '../contracts';
import { refreshSession } from './auth';
import { Resource, rpc } from './client';

/** How often an open workspace checks for bookings made elsewhere. */
const POLL_MS = 20_000;

const tenants = new Resource<TenantData>((id) => rpc<TenantData>('workspace.tenant', id));
const members = new Resource<MemberInfo[]>((id) => rpc<MemberInfo[]>('workspace.members', id));
const NO_MEMBERS: MemberInfo[] = [];

function usePolling(businessId: string) {
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') void tenants.refresh(businessId);
    };
    const id = window.setInterval(tick, POLL_MS);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', tick);
    };
  }, [businessId]);
}

function createApi(ctx: TenantContext): WorkspaceApi {
  const call =
    (method: keyof WorkspaceApi) =>
    async (...args: unknown[]) => {
      const out = await rpc<{ result: unknown; tenant?: TenantData }>('workspace.call', ctx.businessId, method, args);
      if (out.tenant) tenants.set(ctx.businessId, out.tenant);
      if (method === 'saveStaff') void members.refresh(ctx.businessId);
      if (method === 'deleteBusiness') await refreshSession();
      return out.result;
    };
  return new Proxy({ ctx } as WorkspaceApi, {
    get: (target, prop) => (prop === 'ctx' ? target.ctx : typeof prop === 'string' ? call(prop as keyof WorkspaceApi) : undefined),
  });
}

export const remoteWorkspace: WorkspaceData = {
  useTenant(ctx) {
    usePolling(ctx.businessId);
    return useSyncExternalStore(tenants.subscribe, () => tenants.read(ctx.businessId));
  },
  useMembers(ctx) {
    return useSyncExternalStore(members.subscribe, () => members.read(ctx.businessId)) ?? NO_MEMBERS;
  },
  api: createApi,
};

export function clearWorkspaceCache() {
  tenants.clear();
  members.clear();
}
