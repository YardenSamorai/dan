import { useSyncExternalStore } from 'react';
import { storageKey } from '../config/product';

/**
 * Bookings this device has made or looked up, per business. Stands in for a
 * customer session / magic link until there is an auth backend. The ids act
 * as booking tokens in the mock; production uses signed, expiring tokens.
 */
const KEY = storageKey('my-bookings');
const listeners = new Set<() => void>();
type Store = Record<string, string[]>;

function read(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}

let store = read();
const EMPTY: string[] = [];

export function rememberBooking(slug: string, id: string) {
  const ids = store[slug] ?? [];
  if (ids.includes(id)) return;
  store = { ...store, [slug]: [...ids, id] };
  localStorage.setItem(KEY, JSON.stringify(store));
  listeners.forEach((l) => l());
}

export function useMyBookingIds(slug: string): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => store[slug] ?? EMPTY,
  );
}
