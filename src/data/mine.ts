import { useSyncExternalStore } from 'react';
import { storageKey } from '../config/product';

/**
 * Bookings this device has made or looked up, per business, and the pass a
 * mobile number proved with a one-time code. The ids act as booking tokens.
 */
const KEY = storageKey('my-bookings');
const PASS_KEY = storageKey('phone-pass');
const listeners = new Set<() => void>();
type Store = Record<string, string[]>;
export interface PhonePassInfo {
  pass: string;
  phone: string;
}

function read<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, T>;
  } catch {
    return {};
  }
}

let store: Store = read(KEY);
let passes: Record<string, PhonePassInfo> = read(PASS_KEY);
const EMPTY: string[] = [];
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function rememberBooking(slug: string, id: string) {
  const ids = store[slug] ?? [];
  if (ids.includes(id)) return;
  store = { ...store, [slug]: [...ids, id] };
  localStorage.setItem(KEY, JSON.stringify(store));
  notify();
}

export function useMyBookingIds(slug: string): string[] {
  return useSyncExternalStore(subscribe, () => store[slug] ?? EMPTY);
}

export function savePhonePass(slug: string, info: PhonePassInfo | null) {
  const { [slug]: _, ...rest } = passes;
  passes = info ? { ...rest, [slug]: info } : rest;
  localStorage.setItem(PASS_KEY, JSON.stringify(passes));
  notify();
}

export function usePhonePass(slug: string): PhonePassInfo | undefined {
  return useSyncExternalStore(subscribe, () => passes[slug]);
}

/** Leaves nothing of this business on the device: its bookings list and its pass. */
export function forgetMyBookings(slug: string) {
  const { [slug]: _, ...rest } = store;
  store = rest;
  localStorage.setItem(KEY, JSON.stringify(store));
  savePhonePass(slug, null);
}
