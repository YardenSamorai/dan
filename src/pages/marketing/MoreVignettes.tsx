import { Fragment, useEffect, useState, type CSSProperties } from 'react';
import { ACCENT_KEYS, ACCENTS, loadThemeFont } from '../../components/ui/accents';
import { THEMES } from '../../domain/page';
import type { AccentKey, ThemeKey } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { useLoop } from './useLoop';

/* ── The booking page, restyled live: the same choices the page editor offers ── */
const DESIGN_SECTIONS = ['gallery', 'reviews', 'faq'] as const;
type DesignSection = (typeof DESIGN_SECTIONS)[number];
const DESIGN_SERVICES = ['s1', 's2', 's3'] as const;
/** What the designer shows off on its own until the visitor takes over. */
const DESIGN_DEMO: { theme: ThemeKey; accent: AccentKey; faq: boolean }[] = [
  { theme: 'clean', accent: 'rose', faq: false },
  { theme: 'soft', accent: 'sage', faq: false },
  { theme: 'editorial', accent: 'clay', faq: true },
  { theme: 'night', accent: 'gold', faq: true },
];

export function DesignVignette() {
  const { t } = useI18n();
  const k = (s: string) => t(`marketing.showcase.design.${s}` as MessageKey);
  const [theme, setTheme] = useState<ThemeKey>('clean');
  const [accent, setAccent] = useState<AccentKey>('rose');
  const [shown, setShown] = useState<Record<DesignSection, boolean>>({ gallery: true, reviews: true, faq: false });
  const [touched, setTouched] = useState(false);
  const demo = useLoop<HTMLDivElement>(touched ? undefined : 2600);

  useEffect(() => {
    if (!demo.play) return;
    const step = DESIGN_DEMO[(demo.run - 1) % DESIGN_DEMO.length];
    loadThemeFont(step.theme);
    setTheme(step.theme);
    setAccent(step.accent);
    setShown((v) => ({ ...v, faq: step.faq }));
  }, [demo.play, demo.run]);

  const pickTheme = (th: ThemeKey) => {
    setTouched(true);
    loadThemeFont(th);
    setTheme(th);
  };

  return (
    <div className="vig-design" ref={demo.ref} data-demo={demo.play || undefined}>
      <div className="vig-design__controls">
        <fieldset>
          <legend>{t('pageEditor.theme.label')}</legend>
          <div className="vig-design__chips">
            {THEMES.map((th) => (
              <button key={th} type="button" aria-pressed={theme === th} onClick={() => pickTheme(th)}>
                {t(`pageEditor.theme.names.${th}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{t('pageEditor.color.label')}</legend>
          <div className="vig-design__swatches">
            {ACCENT_KEYS.map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={accent === a}
                aria-label={t(`onboarding.review.colorName.${a}`)}
                title={t(`onboarding.review.colorName.${a}`)}
                style={{ '--c': ACCENTS[a] } as CSSProperties}
                onClick={() => {
                  setTouched(true);
                  setAccent(a);
                }}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>{k('sections')}</legend>
          <div className="vig-design__chips">
            {DESIGN_SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={shown[s]}
                onClick={() => {
                  setTouched(true);
                  setShown((v) => ({ ...v, [s]: !v[s] }));
                }}
              >
                {t(`pageEditor.kinds.${s}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="vig-design__hint">{k('hint')}</p>
      </div>

      <div className="vig-site" data-theme={theme} data-accent={accent} aria-hidden="true">
        <div className="vig-site__hero">
          <span className="vig-site__mark">{[...k('business')][0]}</span>
          <b className="vig-site__name">{k('business')}</b>
          <span className="vig-site__tagline">{k('tagline')}</span>
          <span className="vig-site__btn">{k('book')}</span>
        </div>
        {shown.gallery && (
          <div className="vig-site__gallery">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} style={{ '--i': i } as CSSProperties} />
            ))}
          </div>
        )}
        <div className="vig-site__block">
          <b className="vig-site__h">{k('services')}</b>
          {DESIGN_SERVICES.map((s) => (
            <div key={s} className="vig-site__svc">
              <span>
                <b>{k(s)}</b>
                <small>{k(`${s}m`)}</small>
              </span>
              <em>{t('tenant.services.book')}</em>
            </div>
          ))}
        </div>
        {shown.reviews && (
          <div className="vig-site__block vig-site__review">
            <p>{k('review')}</p>
            <small>{k('reviewBy')}</small>
          </div>
        )}
        {shown.faq && (
          <div className="vig-site__block vig-site__faq">
            <span>{k('faq')}</span>
            <i>+</i>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── A customer's own appointment, with the controls your policy allows ── */
export function SelfServeVignette() {
  const { t } = useI18n();
  const k = (s: string) => t(`marketing.showcase.selfServe.${s}` as MessageKey);
  return (
    <div className="vig-phone vig-self" data-accent="rose">
      <div className="vig-phone__bar">
        <span className="vig-phone__mark">{[...k('business')][0]}</span>
        <span className="vig-phone__biz">{k('business')}</span>
      </div>
      <p className="vig-phone__title">{k('title')}</p>
      <div className="vig-self__card">
        <b>{k('service')}</b>
        <span>{k('when')}</span>
        <small>
          {k('ref')} <span className="ltr">{k('refValue')}</span>
        </small>
      </div>
      <p className="vig-self__deadline">{k('deadline')}</p>
      <div className="vig-self__actions">
        <span className="vig-phone__cta" style={{ '--i': 0 } as CSSProperties}>
          {k('reschedule')}
        </span>
        <span className="vig-self__ghost" style={{ '--i': 1 } as CSSProperties}>
          {k('addToCalendar')}
        </span>
        <span className="vig-self__danger" style={{ '--i': 2 } as CSSProperties}>
          {k('cancel')}
        </span>
      </div>
    </div>
  );
}

/* ── The insights screen, condensed ── */
const BARS = [42, 55, 38, 61, 74, 88, 30, 47, 58, 44, 69, 81, 92, 35];

export function InsightsVignette() {
  const { t } = useI18n();
  const k = (s: string) => t(`marketing.showcase.insights.${s}` as MessageKey);
  const max = Math.max(...BARS);
  return (
    <div className="vig-ins">
      <small className="vig-ins__period">{k('title')}</small>
      <div className="vig-ins__revenue">
        <span>{k('revenue')}</span>
        <b className="ltr">{k('revenueValue')}</b>
        <em>{k('delta')}</em>
      </div>
      <div className="vig-ins__chart">
        {BARS.map((v, i) => (
          <i key={i} data-peak={v === max || undefined} style={{ height: `${(v / max) * 100}%`, '--i': i } as CSSProperties} />
        ))}
      </div>
      <dl className="vig-ins__kpis">
        <div>
          <dt>{k('occupancy')}</dt>
          <dd>78%</dd>
          <span className="vig-ins__meter">
            <i style={{ width: '78%' }} />
          </span>
        </div>
        <div>
          <dt>{k('customers')}</dt>
          <dd>61</dd>
          <small>{k('customersSub')}</small>
        </div>
      </dl>
      <p className="vig-ins__lost">{k('lost')}</p>
      <p className="vig-ins__busy">{k('busy')}</p>
    </div>
  );
}

/* ── Moving over: import, calendar feed, export ── */
const SWITCH = ['import', 'sync', 'export'] as const;

export function Switching() {
  const { t } = useI18n();
  const { ref, play, run } = useLoop<HTMLUListElement>(5200);
  return (
    <section className="section container" aria-labelledby="switch-title">
      <div className="section-head">
        <p className="eyebrow">{t('marketing.switch.eyebrow')}</p>
        <h2 id="switch-title" className="display display-md">
          {t('marketing.switch.title')}
        </h2>
      </div>
      <ul className="mk-switch" ref={ref} data-play={play || undefined}>
        {SWITCH.map((s) => (
          <li key={s} className="mk-switch__item mk-rise">
            <Fragment key={play ? run : 'rest'}>
              <SwitchArt kind={s} />
            </Fragment>
            <h3>{t(`marketing.switch.${s}.title`)}</h3>
            <p>{t(`marketing.switch.${s}.body`)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SwitchArt({ kind }: { kind: (typeof SWITCH)[number] }) {
  if (kind === 'import')
    return (
      <div className="mk-switch__art" aria-hidden="true">
        <span className="mk-file">
          <b>xlsx</b>
        </span>
        <span className="mk-arrow" />
        <span className="mk-rows">
          {[0, 1, 2].map((i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </span>
      </div>
    );
  if (kind === 'sync')
    return (
      <div className="mk-switch__art" aria-hidden="true">
        <span className="mk-cal">
          <b>14</b>
        </span>
        <span className="mk-sync" />
        <span className="mk-cal mk-cal--g">
          <i style={{ '--i': 0 } as CSSProperties} />
          <i style={{ '--i': 1 } as CSSProperties} />
        </span>
      </div>
    );
  return (
    <div className="mk-switch__art" aria-hidden="true">
      <span className="mk-file mk-file--csv">
        <b>csv</b>
      </span>
      <span className="mk-file mk-file--json">
        <b>json</b>
      </span>
    </div>
  );
}
