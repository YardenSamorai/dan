import { useEffect } from 'react';
import type { PublicBusiness } from '../../../data';
import type { SectionKind } from '../../../domain/types';

/** How long the camera takes to settle; the browser's own smooth scroll is too quick and restarts on every new item. */
const SETTLE_MS = 420;

/** Inside the film's frame: keeps the section being built in view, following its newest item. */
export function FilmCamera({ focus, business }: { focus: SectionKind; business: PublicBusiness }) {
  const grown = [
    business.page.sections.length,
    business.services.length,
    business.staff.length,
    ...business.page.sections.map((s) => (s.images?.length ?? 0) + (s.items?.length ?? 0)),
  ].join();

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const aim = () => {
      const el = focus === 'hero' ? null : document.getElementById(focus);
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const top = window.scrollY + r.top;
      const target = r.height < vh * 0.8 ? top - (vh - r.height) / 2 : top + r.height - vh + 32;
      return Math.min(Math.max(0, target), document.documentElement.scrollHeight - vh);
    };
    let at = window.scrollY;
    const step = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      const target = aim();
      const gap = target - at;
      at = Math.abs(gap) < 0.5 ? target : at + gap * (1 - Math.exp(-dt / (SETTLE_MS / 3)));
      window.scrollTo({ top: at, behavior: 'instant' });
      if (at !== target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [focus, grown]);

  return null;
}
