import { useSyncExternalStore } from 'react';
import { storageKey } from '../../config/product';
import type { BusinessMember, Session, User } from '../../domain/platform';
import { addDays, diffDays, todayISO } from '../../domain/time';
import type { BusinessId, TenantData } from '../../domain/types';
import { buildDemoDatabase, DEMO_BUSINESS_IDS, SEED_VERSION } from '../demo/seed';

/**
 * MOCK PERSISTENCE. The whole "database" lives in this browser's localStorage.
 * It is not secure, not shared between devices and trivially editable — it
 * exists so the product can be explored without a backend. Only the mock
 * adapters in this folder may import it; UI code goes through ../index.ts.
 */
export interface MockDatabase {
  version: number;
  seededOn: string;
  users: User[];
  members: BusinessMember[];
  tenants: Record<BusinessId, TenantData>;
}

const KEY = storageKey('db');
const SESSION_KEY = storageKey('session');
const listeners = new Set<() => void>();

/** Demo tenants are generated relative to "today"; slide them forward so they never go stale. */
function rebaseTenant(t: TenantData, delta: number): TenantData {
  const shiftISO = (iso: string) => new Date(new Date(iso).getTime() + delta * 86_400_000).toISOString();
  return {
    ...t,
    appointments: t.appointments.map((a) => ({
      ...a,
      date: addDays(a.date, delta),
      createdAt: shiftISO(a.createdAt),
      updatedAt: shiftISO(a.updatedAt),
      history: a.history.map((h) => ({ ...h, at: shiftISO(h.at) })),
      cancellation: a.cancellation && { ...a.cancellation, at: shiftISO(a.cancellation.at) },
    })),
    timeOff: t.timeOff.map((x) => ({ ...x, from: addDays(x.from, delta), to: addDays(x.to, delta) })),
    blocks: t.blocks.map((b) => ({ ...b, date: addDays(b.date, delta) })),
    exceptions: t.exceptions.map((e) => ({ ...e, date: addDays(e.date, delta) })),
    outbox: t.outbox.map((m) => ({ ...m, at: shiftISO(m.at) })),
  };
}

function rebase(db: MockDatabase): MockDatabase {
  const today = todayISO();
  const delta = diffDays(today, db.seededOn);
  if (delta === 0) return db;
  const tenants = { ...db.tenants };
  for (const id of DEMO_BUSINESS_IDS) if (tenants[id]) tenants[id] = rebaseTenant(tenants[id], delta);
  return { ...db, seededOn: today, tenants };
}

/** Production snapshots need the envelope, never the generated demo records. */
export function emptyDatabase(): MockDatabase {
  return { version: SEED_VERSION, seededOn: todayISO(), users: [], members: [], tenants: {} };
}

export function freshDatabase(): MockDatabase {
  return { ...emptyDatabase(), ...buildDemoDatabase() };
}

/** Slide a stored database's demo tenants to today, or reseed when the seed format changed. */
export function reviveDatabase(parsed: MockDatabase | null): MockDatabase {
  return parsed?.version === SEED_VERSION ? rebase(parsed) : freshDatabase();
}

/**
 * Where the adapters read and write. The browser driver keeps everything in
 * localStorage (demo mode); the server installs one that is scoped to a
 * single request and backed by the real database.
 */
export interface DbDriver {
  getDb(): MockDatabase;
  /** Commit a new database value; returns false when it can't be stored (nothing changes then). */
  setDb(next: MockDatabase, opts?: { mustFit?: boolean }): boolean;
  getSession(): Session | null;
  setSession(next: Session | null): void;
  /** Imitate network delay (browser demo only). */
  simulateLatency: boolean;
}

const emit = () => listeners.forEach((l) => l());

function browserDriver(): DbDriver {
  const read = (): MockDatabase | null => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as MockDatabase) : null;
    } catch {
      return null;
    }
  };
  let db = reviveDatabase(read());
  const write = (next: MockDatabase) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  };
  write(db);

  const readSession = (): Session | null => {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
      return s && db.users.some((u) => u.id === s.userId) ? s : null;
    } catch {
      return null;
    }
  };
  let session = readSession();

  window.addEventListener('storage', (e) => {
    try {
      if (e.key === KEY && e.newValue) db = JSON.parse(e.newValue) as MockDatabase;
      else if (e.key === SESSION_KEY) session = readSession();
      else return;
      emit();
    } catch {
      /* ignore */
    }
  });

  return {
    getDb: () => db,
    setDb(next, opts) {
      // Storage full / private mode: keep working in memory unless the caller needs it saved.
      if (!write(next) && opts?.mustFit) return false;
      db = next;
      emit();
      return true;
    },
    getSession: () => session,
    setSession(next) {
      session = next;
      if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else localStorage.removeItem(SESSION_KEY);
      emit();
    },
    simulateLatency: true,
  };
}

let driver: DbDriver | null = null;
const current = () => (driver ??= browserDriver());

/** Server only: route all adapter reads and writes through `next`. */
export function installDbDriver(next: DbDriver) {
  driver = next;
}

export const getDb = () => current().getDb();
export const getSession = () => current().getSession();
export const setSession = (next: Session | null) => current().setSession(next);

export function mutateDb(update: (d: MockDatabase) => MockDatabase) {
  current().setDb(update(getDb()));
}

/** Replace one tenant's data. Tenant scoping is enforced by the callers (the mock adapters). */
export function mutateTenant(businessId: BusinessId, update: (t: TenantData) => TenantData) {
  mutateDb((d) => {
    const t = d.tenants[businessId];
    if (!t) throw new Error('tenant_not_found');
    return { ...d, tenants: { ...d.tenants, [businessId]: update(t) } };
  });
}

/** Like mutateTenant, but only commits if the result can be stored. Returns false (and changes nothing) otherwise. */
export function mutateTenantIfStored(businessId: BusinessId, update: (t: TenantData) => TenantData): boolean {
  const db = getDb();
  const t = db.tenants[businessId];
  if (!t) throw new Error('tenant_not_found');
  return current().setDb({ ...db, tenants: { ...db.tenants, [businessId]: update(t) } }, { mustFit: true });
}

/** Restore the demo tenants and accounts. Businesses created by people are kept. */
export function resetDemoData() {
  const db = getDb();
  const seed = freshDatabase();
  const own = Object.fromEntries(Object.entries(db.tenants).filter(([id]) => !DEMO_BUSINESS_IDS.includes(id)));
  const demoUserIds = new Set(seed.users.map((u) => u.id));
  current().setDb({
    ...seed,
    users: [...seed.users, ...db.users.filter((u) => !demoUserIds.has(u.id))],
    members: [...seed.members, ...db.members.filter((m) => !DEMO_BUSINESS_IDS.includes(m.businessId))],
    tenants: { ...seed.tenants, ...own },
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useMockDb(): MockDatabase {
  return useSyncExternalStore(subscribe, getDb, getDb);
}

export function useMockSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, getSession);
}

export const latency = (ms = 300) => (current().simulateLatency ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
export const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10).padEnd(8, '0')}`;
