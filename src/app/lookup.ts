import { useMemo } from 'react';
import type { AddOn, Customer, Service, Staff, TenantData } from '../domain/types';
import { useWorkspace } from './workspace';

export interface Lookup {
  state: TenantData;
  staff: Map<string, Staff>;
  services: Map<string, Service>;
  customers: Map<string, Customer>;
  addOns: Map<string, AddOn>;
}

/** Id → entity maps over the current tenant, rebuilt only when it changes. */
export function useLookup(): Lookup {
  const { tenant: state } = useWorkspace();
  return useMemo(
    () => ({
      state,
      staff: new Map(state.staff.map((s) => [s.id, s])),
      services: new Map(state.services.map((s) => [s.id, s])),
      customers: new Map(state.customers.map((c) => [c.id, c])),
      addOns: new Map(state.addOns.map((a) => [a.id, a])),
    }),
    [state],
  );
}
