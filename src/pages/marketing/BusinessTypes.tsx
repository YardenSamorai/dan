import { useEffect, useRef, useState } from 'react';
import { BUSINESS_TYPES, SERVICE_TEMPLATES } from '../../domain/defaults';
import type { AccentKey, BusinessType } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { useReducedMotion } from '../../lib/useReducedMotion';

const TYPES: BusinessType[] = BUSINESS_TYPES.filter((x) => x !== 'other');
const ACCENT: Partial<Record<BusinessType, AccentKey>> = {
  nails: 'rose',
  lashes_brows: 'plum',
  hair: 'ink',
  makeup: 'fig',
  skin: 'clay',
  massage: 'sage',
  fitness: 'gold',
  therapy: 'ocean',
  tutoring: 'clay',
};
const CYCLE_MS = 3800;

/**
 * Who it's for: pick a field and see a booking page for it, with the starter services
 * onboarding suggests and the one capability that matters most there. Cycles on its own
 * while on screen until someone picks a field.
 */
export function BusinessTypes() {
  const { t, tx, fmt } = useI18n();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [type, setType] = useState<BusinessType>(TYPES[0]);
  const [auto, setAuto] = useState(!reduced);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!auto || !visible) return;
    const id = window.setTimeout(() => setType((cur) => TYPES[(TYPES.indexOf(cur) + 1) % TYPES.length]), CYCLE_MS);
    return () => window.clearTimeout(id);
  }, [auto, visible, type]);

  // On small screens the chips scroll sideways; keep the current one in view.
  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return;
    const r = row.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    row.scrollBy({ left: c.left + c.width / 2 - (r.left + r.width / 2), behavior: reduced ? 'auto' : 'smooth' });
  }, [type, reduced]);

  const pick = (x: BusinessType) => {
    setAuto(false);
    setType(x);
  };

  const k = (s: string) => t(`marketing.types.${s}` as MessageKey);
  const biz = k(`biz.${type}`);

  return (
    <section ref={ref} className="section container" aria-labelledby="types-title">
      <div className="mk-types">
        <div className="mk-types__intro">
          <div className="section-head">
            <p className="eyebrow">{t('marketing.types.eyebrow')}</p>
            <h2 id="types-title" className="display display-md">
              {t('marketing.types.title')}
            </h2>
            <p className="muted">{t('marketing.types.solo')}</p>
          </div>
          <div className="mk-types__chips" ref={chipsRef} role="tablist" aria-label={k('pick')}>
            {TYPES.map((x) => (
              <button
                key={x}
                type="button"
                role="tab"
                id={`type-tab-${x}`}
                aria-selected={type === x}
                aria-controls="type-panel"
                onClick={() => pick(x)}
              >
                {t(`businessType.${x}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="mk-types__panel" id="type-panel" role="tabpanel" aria-labelledby={`type-tab-${type}`}>
          <div className="mk-types__page" data-accent={ACCENT[type]} key={type}>
            <div className="mk-types__head">
              <span className="mk-types__mark" aria-hidden="true">
                {[...biz][0]}
              </span>
              <span>
                <b>{biz}</b>
                <small>{t(`businessType.${type}`)}</small>
              </span>
            </div>
            <p className="mk-types__label">{t('tenant.services.title')}</p>
            <ul className="mk-types__svcs">
              {SERVICE_TEMPLATES[type].map((s) => (
                <li key={s.name.en}>
                  <span>
                    <b>{tx(s.name)}</b>
                    <small>{fmt.duration(s.duration)}</small>
                  </span>
                  <em>{t('tenant.services.book')}</em>
                </li>
              ))}
            </ul>
          </div>
          <div className="mk-types__fit" key={`fit-${type}`}>
            <small>{k('fitLabel')}</small>
            <b>{k(`fit.${type}.title`)}</b>
            <p>{k(`fit.${type}.body`)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
