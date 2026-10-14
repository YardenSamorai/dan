import { useEffect, useSyncExternalStore } from 'react';
import { storageKey } from '../config/product';
import { isNativeApp } from './native';

/**
 * Light or dark for the business app, or whatever the device is set to. Saved
 * per device. Only the app itself changes: booking pages are each business's
 * own design and stay as they are.
 */
export type ThemePref = 'light' | 'dark' | 'system';
export const THEME_PREFS: ThemePref[] = ['light', 'dark', 'system'];

const KEY = storageKey('theme');
const listeners = new Set<() => void>();
const media = typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-color-scheme: dark)');

function read(): ThemePref {
  const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  // The iPhone app follows the phone by default; the website stays light unless chosen.
  return v === 'light' || v === 'dark' || v === 'system' ? v : isNativeApp ? 'system' : 'light';
}

let pref = read();
let systemDark = !!media?.matches;
media?.addEventListener('change', (e) => {
  systemDark = e.matches;
  listeners.forEach((l) => l());
});

export function setThemePref(p: ThemePref) {
  pref = p;
  localStorage.setItem(KEY, p);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export const useThemePref = () => useSyncExternalStore(subscribe, () => pref);
const useDark = () => useSyncExternalStore(subscribe, () => pref === 'dark' || (pref === 'system' && systemDark));

/** Before the first paint, so the app doesn't open light and then turn dark. */
export function primeTheme() {
  if (location.pathname.startsWith('/app') && (pref === 'dark' || (pref === 'system' && systemDark))) document.documentElement.dataset.theme = 'dark';
}

const LIGHT_BAR = '#F6F6F4';
const DARK_BAR = '#000000';

/** While mounted (the business app), the page takes the chosen theme, status bar included. */
export function useAppTheme() {
  const dark = useDark();
  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const scheme = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
    root.dataset.theme = dark ? 'dark' : 'light';
    meta?.setAttribute('content', dark ? DARK_BAR : LIGHT_BAR);
    scheme?.setAttribute('content', dark ? 'dark' : 'light');
    if (isNativeApp) void import('@capacitor/status-bar').then(({ StatusBar, Style }) => StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }));
    return () => {
      delete root.dataset.theme;
      meta?.setAttribute('content', LIGHT_BAR);
      scheme?.setAttribute('content', 'light');
      if (isNativeApp) void import('@capacitor/status-bar').then(({ StatusBar, Style }) => StatusBar.setStyle({ style: Style.Light }));
    };
  }, [dark]);
}
