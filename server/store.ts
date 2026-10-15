import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { reviveDatabase, type MockDatabase } from '../src/data/mock/db';
import { nextMessageAt } from '../src/domain/notifications';
import type { User } from '../src/domain/platform';
import type { Channel } from '../src/domain/types';

/** What a request may need loaded. A store may load more; never less. */
export interface Hint {
  /** Load named businesses only, while retaining memberships for authorization. */
  namedBusinessesOnly?: boolean;
  userId?: string | null;
  businessId?: string;
  slugs?: string[];
}

export class Conflict extends Error {
  constructor() {
    super('conflict');
  }
}

/**
 * Persistence for the server. `snapshot` returns plain data the adapters can
 * mutate immutably; `commit` writes whatever changed between the two values
 * and throws `Conflict` when someone else changed the same records first.
 */
export interface Store {
  snapshot(hint: Hint): Promise<MockDatabase>;
  commit(before: MockDatabase, after: MockDatabase): Promise<void>;
  /** Create the profile row for someone signing in for the first time (identity-provider setups). */
  ensureUser?(u: Pick<User, 'id' | 'email' | 'name' | 'locale'>): Promise<void>;
  /** Store an uploaded image and return its public URL. Without it, images stay inline as data URLs. */
  putImage?(businessId: string, dataUrl: string): Promise<string>;
  /** Businesses with a message due by `now` on one of `channels`, soonest first. */
  dueBusinesses?(now: string, channels: readonly Channel[], limit: number): Promise<string[]>;
}

/**
 * Development store: the whole database in one JSON file. Records are compared
 * by reference, so a commit based on a stale snapshot is rejected.
 */
export class FileStore implements Store {
  private db: MockDatabase;

  constructor(private path: string) {
    let parsed: MockDatabase | null = null;
    try {
      parsed = JSON.parse(readFileSync(path, 'utf8')) as MockDatabase;
    } catch {
      /* first run: seed */
    }
    this.db = reviveDatabase(parsed);
    this.flush();
  }

  async snapshot(): Promise<MockDatabase> {
    return this.db;
  }

  async dueBusinesses(now: string, channels: readonly Channel[], limit: number) {
    return Object.entries(this.db.tenants)
      .map(([id, t]) => [id, nextMessageAt(t, channels)] as const)
      .filter((x): x is readonly [string, string] => !!x[1] && x[1] <= now)
      .sort((a, b) => a[1].localeCompare(b[1]))
      .slice(0, limit)
      .map(([id]) => id);
  }

  async commit(before: MockDatabase, after: MockDatabase) {
    const cur = this.db;
    for (const id of new Set([...Object.keys(before.tenants), ...Object.keys(after.tenants)])) {
      if (before.tenants[id] !== after.tenants[id] && cur.tenants[id] !== before.tenants[id]) throw new Conflict();
    }
    if ((before.users !== after.users && cur.users !== before.users) || (before.members !== after.members && cur.members !== before.members)) throw new Conflict();
    const tenants = { ...cur.tenants, ...changedTenants(before, after) };
    for (const id of removedTenants(before, after)) delete tenants[id];
    this.db = {
      ...cur,
      users: after.users === before.users ? cur.users : after.users,
      members: after.members === before.members ? cur.members : after.members,
      tenants,
    };
    this.flush();
  }

  private flush() {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db));
    renameSync(tmp, this.path);
  }
}

export function changedTenants(before: MockDatabase, after: MockDatabase): MockDatabase['tenants'] {
  return Object.fromEntries(Object.entries(after.tenants).filter(([id, t]) => before.tenants[id] !== t));
}

export const removedTenants = (before: MockDatabase, after: MockDatabase) => Object.keys(before.tenants).filter((id) => !(id in after.tenants));
