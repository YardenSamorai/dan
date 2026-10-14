import { Capacitor } from '@capacitor/core';
import { PUBLIC_SITE } from '../config/product';

/** Running inside the iPhone app (Capacitor) rather than a browser. */
export const isNativeApp = Capacitor.isNativePlatform();

/**
 * The public site. In a browser it's wherever the page came from; the app's
 * own pages are served from the device, so the API and the links people share
 * point at the live site.
 */
export const SITE_ORIGIN: string = isNativeApp || typeof location === 'undefined' ? PUBLIC_SITE : location.origin;

export const SITE_HOST = SITE_ORIGIN.replace(/^https?:\/\//, '');

/**
 * Opens a link outside the app: pages of the site (a path, or a link to it) in
 * a browser sheet over the app, anything else (WhatsApp, Google Calendar) in
 * the app that handles it.
 */
export async function openOutside(href: string) {
  const url = new URL(href, location.href);
  const own = url.origin === location.origin;
  const target = own ? SITE_ORIGIN + url.pathname + url.search + url.hash : url.href;
  if (!isNativeApp) return void window.open(target, '_blank', 'noopener');
  if (own || url.origin === SITE_ORIGIN) {
    const { Browser } = await import('@capacitor/browser');
    return Browser.open({ url: target });
  }
  const { AppLauncher } = await import('@capacitor/app-launcher');
  await AppLauncher.openUrl({ url: target });
}

/** The app's start-up: links meant for a new tab leave the app, then the splash screen goes. */
export async function startNativeShell() {
  if (!isNativeApp) return;
  document.documentElement.classList.add('native-app');
  document.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href]');
    if (!(a instanceof HTMLAnchorElement)) return;
    const external = a.target === '_blank' || !/^(https?:|\/|#|$)/.test(a.getAttribute('href') ?? '') || (a.origin !== location.origin && /^https?:/.test(a.protocol));
    if (!external || e.defaultPrevented) return;
    e.preventDefault();
    void openOutside(a.href);
  });
  // Safari shows :active (the press highlight) only on pages that listen for touches.
  document.addEventListener('touchstart', () => {}, { passive: true });
  addHaptics();
  void followTextSize();
  const { SplashScreen } = await import('@capacitor/splash-screen');
  requestAnimationFrame(() => void SplashScreen.hide({ fadeOutDuration: 200 }));
}

/** A light tap under the finger for switches, choices and main buttons, as in iPhone apps. */
function addHaptics() {
  const haptics = import('@capacitor/haptics');
  document.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.type === 'checkbox' || el.type === 'radio') void haptics.then(({ Haptics }) => Haptics.selectionChanged());
  });
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('button, a');
    if (!el || (el as HTMLButtonElement).disabled) return;
    if (el.matches('[aria-pressed], .segmented button, .locale-switch button')) void haptics.then(({ Haptics }) => Haptics.selectionChanged());
    else if (el.matches('.btn--primary, .btn--ink, .btn--danger')) void haptics.then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }));
  });
}

/** The iPhone's text size (Settings › Display › Text Size), capped where the layout still holds. */
async function followTextSize() {
  const [{ TextZoom }, { App }] = await Promise.all([import('@capacitor/text-zoom'), import('@capacitor/app')]);
  const apply = async () => {
    const { value } = await TextZoom.getPreferred();
    await TextZoom.set({ value: Math.min(Math.max(value, 0.85), 1.35) });
  };
  await apply();
  void App.addListener('resume', () => void apply());
}
