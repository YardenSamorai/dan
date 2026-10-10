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

function fresh(): MockDatabase {
  return { version: SEED_VERSION, seededOn: todayISO(), ...buildDemoDatabase() };
}

function load(): MockDatabase {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDatabase;
      if (parsed.version === SEED_VERSION) return rebase(parsed);
    }
  } catch {
    /* corrupted or unavailable storage — fall through to a fresh seed */
  }
  return fresh();
}

let db: MockDatabase = load();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* storage full / private mode: keep working in memory */
  }
}
persist();

const emit = () => listeners.forEach((l) => l());

// ── Session (mock: a user id in localStorage, no credentials) ─────────

function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    return s && db.users.some((u) => u.id === s.userId) ? s : null;
  } catch {
    return null;
  }
}

let session: Session | null = readSession();

export function setSession(next: Session | null) {
  session = next;
  if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
  else localStorage.removeItem(SESSION_KEY);
  emit();
}

if (typeof window !== 'undefined') {
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
}

export const getDb = () => db;
export const getSession = () => session;

export function mutateDb(update: (d: MockDatabase) => MockDatabase) {
  db = update(db);
  persist();
  emit();
}

/** Replace one tenant's data. Tenant scoping is enforced by the callers (the mock adapters). */
export function mutateTenant(businessId: BusinessId, update: (t: TenantData) => TenantData) {
  mutateDb((d) => {
    const t = d.tenants[businessId];
    if (!t) throw new Error('tenant_not_found');
    return { ...d, tenants: { ...d.tenants, [businessId]: update(t) } };
  });
}

/** Restore the demo tenants and accounts. Businesses created in this browser are kept. */
export function resetDemoData() {
  const seed = fresh();
  const own = Object.fromEntries(Object.entries(db.tenants).filter(([id]) => !DEMO_BUSINESS_IDS.includes(id)));
  const demoUserIds = new Set(seed.users.map((u) => u.id));
  db = {
    ...seed,
    users: [...seed.users, ...db.users.filter((u) => !demoUserIds.has(u.id))],
    members: [...seed.members, ...db.members.filter((m) => !DEMO_BUSINESS_IDS.includes(m.businessId))],
    tenants: { ...seed.tenants, ...own },
  };
  persist();
  emit();
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

export const latency = (ms = 300) => new Promise((r) => setTimeout(r, ms));
export const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
