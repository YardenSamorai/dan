import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { WelcomeScene as Scene } from './welcomeStage';

/** The 3D picture beside the welcome text. Decorative: the same information is in the list next to it. */
export function WelcomeScene({ focus }: { focus: number | null }) {
  const { t, dir } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    void import('./welcomeStage')
      .then(({ createWelcomeScene }) => {
        if (cancelled) return;
        const css = getComputedStyle(el);
        scene.current = createWelcomeScene(el, {
          rtl: dir === 'rtl',
          accent: css.getPropertyValue('--accent').trim() || '#1c1c1e',
          font: css.fontFamily,
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          text: {
            business: t('onboarding.welcome.scene.business'),
            tagline: t('onboarding.welcome.scene.tagline'),
            pickService: t('onboarding.welcome.scene.pickService'),
            services: [
              [t('onboarding.welcome.scene.service'), t('onboarding.welcome.scene.duration')],
              [t('onboarding.welcome.scene.service2'), t('onboarding.welcome.scene.duration2')],
              [t('onboarding.welcome.scene.service3'), t('onboarding.welcome.scene.duration3')],
            ],
            pickTime: t('onboarding.welcome.scene.pickTime'),
            slots: ['09:30', '10:30', '11:00', '12:15', '14:00', '16:30'],
            service: t('onboarding.welcome.scene.service'),
            duration: t('onboarding.welcome.scene.duration'),
            booked: t('onboarding.welcome.scene.booked'),
            bookedWhen: t('onboarding.welcome.scene.bookedWhen'),
            cta: t('onboarding.welcome.scene.cta'),
          },
        });
        setReady(true);
      })
      .catch(() => {
        /* No WebGL: the stage stays as a quiet backdrop. */
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [t, dir]);

  useEffect(() => {
    scene.current?.focus(focus);
  }, [focus, ready]);

  return <div ref={host} className="onb-scene__canvas" data-ready={ready || undefined} />;
}
