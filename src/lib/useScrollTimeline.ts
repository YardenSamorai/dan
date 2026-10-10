import { useEffect, useRef, type RefObject } from 'react';
import { clamp } from './math';

/**
 * Maps native scroll through a tall section to progress 0..1 and calls
 * `onFrame` with a gently smoothed value. Never intercepts scrolling:
 * it only listens, and the rAF loop sleeps once it has caught up.
 */
export function useScrollTimeline(
  sectionRef: RefObject<HTMLElement>,
  onFrame: (p: number) => void,
  { enabled = true, smoothing = 9 }: { enabled?: boolean; smoothing?: number } = {},
) {
  const cb = useRef(onFrame);
  cb.current = onFrame;

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || !enabled) return;

    let top = 0;
    let span = 1;
    let target = 0;
    let current = -1;
    let raf = 0;
    let last = 0;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      top = rect.top + window.scrollY;
      span = Math.max(1, el.offsetHeight - window.innerHeight);
    };
    const read = () => {
      target = clamp((window.scrollY - top) / span);
    };

    const tick = (now: number) => {
      const dt = Math.min(64, now - (last || now)) / 1000;
      last = now;
      if (current < 0) current = target;
      const k = 1 - Math.exp(-smoothing * dt);
      current += (target - current) * k;
      if (Math.abs(target - current) < 0.0004) current = target;
      cb.current(current);
      raf = current === target ? 0 : requestAnimationFrame(tick);
      if (!raf) last = 0;
    };
    const wake = () => {
      read();
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onResize = () => {
      measure();
      wake();
    };

    measure();
    read();
    current = target;
    cb.current(current);

    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(document.body);

    return () => {
      window.removeEventListener('scroll', wake);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [sectionRef, enabled, smoothing]);
}
