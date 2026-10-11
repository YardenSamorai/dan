import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { useReducedMotion } from '../../lib/useReducedMotion';

const STEPS = ['setup', 'share', 'manage'] as const;
type Step = (typeof STEPS)[number];
/** Must match the progress bar's animation in marketing.css. */
const STEP_MS = 5600;

/**
 * The three steps from sign-up to running the day. While the section is on screen the steps
 * play in turn, each acting out its step on a small slice of the real interface. Every
 * illustration's resting state is its final frame, so nothing is lost without motion.
 */
export function HowItWorks() {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => {
      setActive((a) => (a + 1) % STEPS.length);
      setRun((r) => r + 1);
    }, STEP_MS);
    return () => window.clearTimeout(id);
  }, [visible, run]);

  const pick = (i: number) => {
    setActive(i);
    setRun((r) => r + 1);
  };

  const playing = visible && !reduced;

  return (
    <section ref={ref} className="section how" id="how" aria-labelledby="how-title">
      <div className="container">
        <div className="section-head">
          <p className="eyebrow">{t('marketing.how.eyebrow')}</p>
          <h2 id="how-title" className="display display-md">
            {t('marketing.how.title')}
          </h2>
        </div>
        <ol className="mk-how">
          {STEPS.map((s, i) => {
            const state = !playing ? 'rest' : i === active ? 'active' : i < active ? 'done' : 'next';
            return (
              <li key={s} className="mk-how__step" data-state={state}>
                <button type="button" className="mk-how__head" onClick={() => pick(i)} aria-pressed={playing ? i === active : undefined}>
                  <span className="mk-how__bar">
                    <i key={state === 'active' ? run : state} />
                  </span>
                  <span className="mk-how__num">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{t(`marketing.how.steps.${s}.title`)}</h3>
                </button>
                <div className="mk-how__art" aria-hidden="true">
                  <Art step={s} key={state === 'active' ? `run-${run}` : 'rest'} play={state === 'active'} />
                </div>
                <p className="mk-how__body">{t(`marketing.how.steps.${s}.body`)}</p>
                <ul className="mk-how__points">
                  {[1, 2, 3].map((n) => (
                    <li key={n}>{t(`marketing.how.steps.${s}.p${n}` as MessageKey)}</li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function Art({ step, play }: { step: Step; play: boolean }) {
  const { t } = useI18n();
  const k = (s: string) => t(`marketing.how.art.${s}` as MessageKey);
  const days = k('days').split('|');

  if (step === 'setup')
    return (
      <div className="how-setup" data-play={play || undefined}>
        <span className="how-setup__label">{k('newService')}</span>
        <div className="how-field how-field--name">
          <span className="how-type">{k('service')}</span>
        </div>
        <div className="how-setup__row">
          <div className="how-field how-field--d">{k('duration')}</div>
          <div className="how-field how-field--p ltr">{k('price')}</div>
        </div>
        <span className="how-setup__label">{k('hours')}</span>
        <div className="how-days">
          {days.map((d, i) => (
            <span key={d} data-on={i < 5 || undefined} style={{ '--i': i } as CSSProperties}>
              {d}
            </span>
          ))}
        </div>
        <span className="how-saved">{k('saved')}</span>
      </div>
    );

  if (step === 'share')
    return (
      <div className="how-share" data-play={play || undefined}>
        <div className="how-link">
          <span className="ltr">{`${typeof window === 'undefined' ? '' : window.location.host}/book/noga`}</span>
          <b data-a={k('copy')} data-b={k('copied')} />
        </div>
        <div className="how-chat">
          <div className="how-bubble how-bubble--out">
            <span className="how-preview">
              <i>{[...k('business')][0]}</i>
              <span>
                <b>{k('business')}</b>
                <small>{k('bookOnline')}</small>
              </span>
            </span>
            {k('message')}
          </div>
          <div className="how-bubble how-bubble--in">{k('reply')}</div>
        </div>
      </div>
    );

  return (
    <div className="how-manage" data-play={play || undefined}>
      <div className="how-manage__next">
        <span>{k('next')}</span>
        <b>{k('nextValue')}</b>
      </div>
      <div className="how-day">
        {['09:00', '10:00', '11:00', '12:00'].map((h, i) => (
          <span key={h} className="how-day__hour" style={{ top: `${i * 25}%` }}>
            <span className="ltr">{h}</span>
          </span>
        ))}
        <span className="how-appt" style={{ top: '0%', height: '22%' }}>
          {k('a1')}
        </span>
        <span className="how-appt how-appt--move" style={{ top: '75%', height: '22%' }}>
          {k('a2')}
        </span>
        <span className="how-appt how-appt--new" style={{ top: '25%', height: '22%' }}>
          {k('a3')} <em>{t('marketing.hero.calendar.isNew')}</em>
        </span>
      </div>
    </div>
  );
}
