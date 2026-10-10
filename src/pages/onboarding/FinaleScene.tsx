import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { FinaleScene as Scene, FinaleText } from './finaleStage';

/** The 3D picture on the last screen: a first booking on the owner's own page, landing in their calendar. Decorative. */
export function FinaleScene({ text, onUnavailable }: { text: FinaleText; onUnavailable: () => void }) {
  const { dir } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const fail = useRef(onUnavailable);
  fail.current = onUnavailable;
  const [ready, setReady] = useState(false);
  const textKey = JSON.stringify(text);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let scene: Scene | null = null;
    void import('./finaleStage')
      .then(({ createFinaleScene }) => {
        if (cancelled) return;
        const css = getComputedStyle(el);
        scene = createFinaleScene(el, {
          text: JSON.parse(textKey) as FinaleText,
          rtl: dir === 'rtl',
          accent: css.getPropertyValue('--accent').trim() || '#0f6b66',
          font: css.fontFamily,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) fail.current();
      });
    return () => {
      cancelled = true;
      scene?.dispose();
    };
  }, [textKey, dir]);

  return <div ref={host} className="onb-scene__canvas" data-ready={ready || undefined} />;
}
