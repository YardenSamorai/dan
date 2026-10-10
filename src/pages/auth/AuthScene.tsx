import { useEffect, useRef, useState } from 'react';
import { toISODate } from '../../domain/time';
import { useI18n } from '../../i18n/I18nProvider';
import type { AuthScene as Scene, AuthSceneText } from './authStage';

/** The 3D calendar beside the sign-in and sign-up forms. Decorative. */
export function AuthScene({ variant }: { variant: 'signIn' | 'signUp' }) {
  const { t, fmt, dir } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  const text: AuthSceneText = {
    day: fmt.date(toISODate(new Date()), 'long'),
    title: t('auth.scene.title'),
    staff: [t('auth.scene.staffA'), t('auth.scene.staffB')],
    firstHour: 9 * 60,
    items: [
      { col: 0, start: 9 * 60, end: 10 * 60, customer: t('auth.scene.c1'), service: t('auth.scene.s1') },
      { col: 1, start: 9 * 60 + 30, end: 10 * 60 + 15, customer: t('auth.scene.c2'), service: t('auth.scene.s2') },
      { col: 0, start: 10 * 60 + 30, end: 11 * 60 + 45, customer: t('auth.scene.c3'), service: t('auth.scene.s3') },
      { col: 1, start: 11 * 60, end: 12 * 60, customer: t('auth.scene.c4'), service: t('auth.scene.s4') },
    ],
    toastTitle: t(variant === 'signUp' ? 'auth.scene.toastFirst' : 'auth.scene.toastNew'),
    toastSub: t('auth.scene.toastSub', { name: t('auth.scene.c4'), time: '11:00' }),
  };
  const key = JSON.stringify(text);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let scene: Scene | null = null;
    let cancelled = false;
    void import('./authStage')
      .then(({ createAuthScene }) => {
        if (cancelled) return;
        const css = getComputedStyle(el);
        scene = createAuthScene(el, {
          text: JSON.parse(key) as AuthSceneText,
          rtl: dir === 'rtl',
          accent: css.getPropertyValue('--accent').trim() || '#0f6b66',
          font: css.fontFamily,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        });
        setReady(true);
      })
      .catch(() => {
        /* No WebGL: the stage keeps its gradient. */
      });
    return () => {
      cancelled = true;
      scene?.dispose();
    };
  }, [key, dir]);

  return <div ref={host} className="auth__canvas" data-ready={ready || undefined} />;
}
