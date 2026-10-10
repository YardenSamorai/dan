import type { Role } from './platform';

/**
 * Coarse role permissions. The client uses these only to shape the UI; a real
 * backend must evaluate the same rules on every request.
 */
export type Permission =
  | 'calendar.all' // see and manage every staff member's calendar (else: own only)
  | 'appointments.manage'
  | 'customers.view'
  | 'customers.edit'
  | 'services.manage'
  | 'staff.manage'
  | 'availability.all' // edit anyone's hours / time off (else: own only)
  | 'business.settings'
  | 'insights.view' // revenue and team performance
  | 'billing.manage'
  | 'demo.reset';

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    'calendar.all',
    'appointments.manage',
    'customers.view',
    'customers.edit',
    'services.manage',
    'staff.manage',
    'availability.all',
    'business.settings',
    'insights.view',
    'billing.manage',
    'demo.reset',
  ]),
  manager: new Set<Permission>([
    'calendar.all',
    'appointments.manage',
    'customers.view',
    'customers.edit',
    'services.manage',
    'staff.manage',
    'availability.all',
    'business.settings',
    'insights.view',
  ]),
  staff: new Set<Permission>(['appointments.manage', 'customers.view']),
};

export const can = (role: Role, permission: Permission) => ROLE_PERMISSIONS[role].has(permission);
