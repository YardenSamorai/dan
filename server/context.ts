import { AsyncLocalStorage } from 'node:async_hooks';
import { installDbDriver, type MockDatabase } from '../src/data/mock/db';
import type { Session } from '../src/domain/platform';

/**
 * The adapters in src/data/mock read and write through a db driver. On the
 * server every request gets its own copy of the data it may touch and its own
 * session, so concurrent requests never see each other's half-done work.
 */
interface RequestScope {
  db: MockDatabase;
  session: Session | null;
}

const scope = new AsyncLocalStorage<RequestScope>();

const active = () => {
  const s = scope.getStore();
  if (!s) throw new Error('db access outside a request scope');
  return s;
};

installDbDriver({
  getDb: () => active().db,
  setDb(next) {
    active().db = next;
    return true;
  },
  getSession: () => active().session,
  setSession(next) {
    active().session = next;
  },
  simulateLatency: false,
});

/** Run `fn` against `db` as `userId`; resolves with its result and the database it left behind. */
export async function inScope<T>(db: MockDatabase, userId: string | null, fn: () => Promise<T> | T): Promise<{ result: T; db: MockDatabase }> {
  const s: RequestScope = { db, session: userId ? { userId, activeBusinessId: null } : null };
  const result = await scope.run(s, fn);
  return { result, db: s.db };
}
