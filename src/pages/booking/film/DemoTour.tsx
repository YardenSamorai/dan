import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, StaffAvatar } from '../../../components/ui/bits';
import { ArrowDownIcon, ArrowIcon, CalendarIcon, CheckIcon, ClockIcon, DownloadIcon, GlobeIcon, LockIcon, TagIcon, UploadIcon } from '../../../components/ui/Icons';
import { PRODUCT } from '../../../config/product';
import { BUSINESS_TYPES } from '../../../domain/defaults';
import { termsRange } from '../../../domain/scheduling';
import { useI18n } from '../../../i18n/I18nProvider';
import { usePublicTenant } from '../TenantContext';
import './tour.css';

/** The anchor the film's skip link and its last scene point at: the start of the live page. */
export const LIVE_ID = 'demo-live';

/** True once the element has been on screen; CSS plays the entrance off it. */
function useSeen<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setSeen(true);
        io.disconnect();
      },
      { threshold },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [threshold]);
  return { ref, seen };
}

const firstName = (s: string) => s.split(' ')[0];

/** The staff the copy names, from the business itself so the story matches the page. */
function usePeople() {
  const { tx } = useI18n();
  const { business } = usePublicTenant();
  const staff = business.staff;
  const name = (i: number, fallback: string) => firstName(tx(staff[i]?.name) || fallback);
  return { staff, owner: name(0, 'Noa'), booked: name(staff.length - 1, 'Dana'), member: name(Math.min(2, staff.length - 1), 'Lior') };
}

/**
 * What the demo page tells after its film: the system behind the page, a day
 * with it, who it's for, and then the live page itself. `overlap` slides the
 * first panel up over the film's last frame.
 */
export function DemoTour({ overlap }: { overlap?: boolean }) {
  return (
    <div className="demo-tour" data-overlap={overlap || undefined}>
      <SystemPanel />
      <DayStory />
      <Trust />
      <Bridge />
    </div>
  );
}

// ── The system behind the page ───────────────────────────────────────

function SystemPanel() {
  const { t } = useI18n();
  const map = useSeen<HTMLDivElement>(0.25);
  const points = [
    ['free', ClockIcon],
    ['terms', TagIcon],
    ['roles', LockIcon],
  ] as const;
  return (
    <section className="dt-system" aria-labelledby="dt-system-title">
      <div className="dt-wrap">
        <header className="dt-system__head">
          <h2 id="dt-system-title" className="dt-display">
            {t('tour.system.title')}
          </h2>
          <p className="dt-lede">{t('tour.system.body', { product: PRODUCT.name })}</p>
        </header>

        <div ref={map.ref} className="dt-map" data-seen={map.seen || undefined}>
          <svg className="dt-map__lines" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden>
            <path d="M500 300 C 400 300 330 150 220 150" />
            <path d="M500 300 C 600 300 670 150 780 150" />
            <path d="M500 300 C 400 300 330 450 220 450" />
            <path d="M500 300 C 600 300 670 450 780 450" />
          </svg>
          <Node area="cal" i={0} label={t('tour.system.calendar')}>
            <MiniCalendar />
          </Node>
          <Node area="rules" i={1} label={t('tour.system.rules')}>
            <MiniRules />
          </Node>
          <figure className="dt-map__page">
            <MiniPage />
            <figcaption>{t('tour.system.page')}</figcaption>
          </figure>
          <Node area="customer" i={2} label={t('tour.system.customer')}>
            <MiniCustomer />
          </Node>
          <Node area="insights" i={3} label={t('tour.system.insights')}>
            <MiniInsights />
          </Node>
        </div>

        <ul className="dt-points">
          {points.map(([k, Icon]) => (
            <li key={k}>
              <span className="dt-points__icon" aria-hidden>
                <Icon size={18} />
              </span>
              <h3>{t(`tour.points.${k}.title`)}</h3>
              <p>{t(`tour.points.${k}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Node({ area, i, label, children }: { area: string; i: number; label: string; children: ReactNode }) {
  return (
    <figure className={`dt-node dt-node--${area}`} style={{ '--i': i } as CSSProperties}>
      <div className="dt-node__card" aria-hidden>
        {children}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/** The business's own page, small: the same name, colour and services the film just built. */
function MiniPage() {
  const { t, tx, fmt } = useI18n();
  const { business } = usePublicTenant();
  const name = tx(business.name);
  const cover = business.branding.coverUrl;
  return (
    <div className="dt-phone" aria-hidden>
      <div className="dt-phone__screen">
        <div className="dt-phone__cover" data-img={cover ? '' : undefined}>
          {cover && <img src={cover} alt="" loading="lazy" />}
        </div>
        <div className="dt-phone__body">
          <span className="dt-phone__mark">{[...name][0]}</span>
          <b className="dt-phone__name">{name}</b>
          {tx(business.tagline) && <small className="dt-phone__tagline">{tx(business.tagline)}</small>}
          <span className="dt-phone__book">{t('common.book')}</span>
          <span className="dt-phone__next">
            <i /> {t('tour.mini.next')}
          </span>
          <ul className="dt-phone__svcs">
            {business.services.slice(0, 3).map((s) => (
              <li key={s.id}>
                <span>{tx(s.name)}</span>
                <small className="tabular">{fmt.moneyRange(termsRange(s).price)}</small>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const CAL_BLOCKS: { col: number; at: number; len: number; tone: 'mint' | 'amber' | 'violet' | 'blue' }[] = [
  { col: 0, at: 0, len: 1.2, tone: 'mint' },
  { col: 0, at: 1.6, len: 1, tone: 'violet' },
  { col: 1, at: 0.5, len: 1, tone: 'amber' },
  { col: 1, at: 2, len: 1.1, tone: 'blue' },
  { col: 2, at: 0.2, len: 0.9, tone: 'mint' },
  { col: 2, at: 1.3, len: 1.4, tone: 'mint' },
];

function MiniCalendar() {
  const { t, tx } = useI18n();
  const { staff } = usePeople();
  const cols = staff.slice(0, 3);
  return (
    <div className="dt-cal">
      <div className="dt-cal__top">
        <CalendarIcon size={13} />
        <b>{t('tour.mini.today')}</b>
      </div>
      <div className="dt-cal__heads">
        {cols.map((s) => (
          <span key={s.id}>
            <StaffAvatar staff={s} size="sm" />
            {firstName(tx(s.name))}
          </span>
        ))}
      </div>
      <div className="dt-cal__body" style={{ '--cols': Math.max(cols.length, 1) } as CSSProperties}>
        {CAL_BLOCKS.filter((b) => b.col < Math.max(cols.length, 1)).map((b, i) => (
          <i key={i} data-tone={b.tone} style={{ '--col': b.col, '--at': b.at, '--len': b.len } as CSSProperties} />
        ))}
        <span className="dt-cal__now" />
      </div>
    </div>
  );
}

function MiniRules() {
  const { t } = useI18n();
  const rows = [
    [t('tour.mini.prep'), t('tour.mini.prepValue'), true],
    [t('tour.mini.cancel'), t('tour.mini.cancelValue'), true],
    [t('tour.mini.ahead'), t('tour.mini.aheadValue'), true],
    [t('tour.mini.approval'), '', false],
  ] as const;
  return (
    <ul className="dt-rules">
      {rows.map(([label, value, on]) => (
        <li key={label}>
          <span>
            {label}
            {value && <b>{value}</b>}
          </span>
          <i className="dt-switch" data-on={on || undefined} />
        </li>
      ))}
    </ul>
  );
}

function MiniCustomer() {
  const { t } = useI18n();
  return (
    <div className="dt-person">
      <div className="dt-person__head">
        <Avatar name={t('tour.mini.customer')} color="#8b7dff" />
        <span>
          <b>{t('tour.mini.customer')}</b>
          <small>{t('tour.mini.since')}</small>
        </span>
      </div>
      <dl className="dt-person__stats">
        <div>
          <dt>{t('tour.mini.visits')}</dt>
          <dd className="tabular">14</dd>
        </div>
        <div>
          <dt>{t('tour.mini.noShows')}</dt>
          <dd className="tabular">0</dd>
        </div>
      </dl>
      <p className="dt-person__note">{t('tour.mini.note')}</p>
      <p className="dt-person__next">{t('tour.mini.nextAppt')}</p>
    </div>
  );
}

const WEEK = [52, 64, 48, 71, 86, 93, 40];

function MiniInsights() {
  const { t, fmt } = useI18n();
  return (
    <div className="dt-ins">
      <small>{t('tour.mini.week')}</small>
      <div className="dt-ins__row">
        <span>
          <b className="tabular">78%</b>
          <small>{t('tour.mini.occupancy')}</small>
        </span>
        <em>
          <span className="ltr">+12%</span> {t('tour.mini.delta')}
        </em>
      </div>
      <div className="dt-ins__bars">
        {WEEK.map((v, i) => (
          <i key={i} data-peak={i === 5 || undefined} style={{ '--h': v, '--i': i } as CSSProperties} title={fmt.weekday(i, 'short')} />
        ))}
      </div>
    </div>
  );
}

// ── One day with it ──────────────────────────────────────────────────

type Moment = { id: 'booking' | 'move' | 'breaks' | 'team' | 'close'; at: number; tone: 'blue' | 'mint' | 'amber' | 'violet' | 'ink' };

const MOMENTS: Moment[] = [
  { id: 'booking', at: 6 * 60 + 40, tone: 'blue' },
  { id: 'move', at: 9 * 60 + 15, tone: 'mint' },
  { id: 'breaks', at: 12 * 60 + 30, tone: 'amber' },
  { id: 'team', at: 15 * 60, tone: 'violet' },
  { id: 'close', at: 20 * 60, tone: 'ink' },
];

function DayStory() {
  const { t, fmt } = useI18n();
  const people = usePeople();
  const vars = { staff: people.booked, owner: people.owner };
  return (
    <section className="dt-day" aria-labelledby="dt-day-title">
      <div className="dt-wrap dt-day__grid">
        <header className="dt-day__head">
          <h2 id="dt-day-title" className="dt-display dt-display--sm">
            {t('tour.day.title')}
          </h2>
          <p className="dt-lede">{t('tour.day.body')}</p>
        </header>
        <ol className="dt-day__list">
          {MOMENTS.map((m) => (
            <li key={m.id} className="dt-moment" data-tone={m.tone}>
              <time className="dt-moment__time tabular">{fmt.time(m.at)}</time>
              <div className="dt-moment__text">
                <h3>{t(`tour.day.${m.id}.title`)}</h3>
                <p>{t(`tour.day.${m.id}.body`, m.id === 'team' ? { staff: people.member, owner: people.owner } : vars)}</p>
                <span className="dt-tag">{t(`tour.day.${m.id}.tag`)}</span>
              </div>
              <div className="dt-moment__ui" aria-hidden>
                <MomentUi id={m.id} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function MomentUi({ id }: { id: Moment['id'] }) {
  const { t, fmt } = useI18n();
  const { staff } = usePeople();
  if (id === 'booking')
    return (
      <div className="dt-ui dt-ui--toast">
        <span className="dt-ui__check">
          <CheckIcon size={14} />
        </span>
        <span>
          <b>{t('tour.day.booking.ui')}</b>
          <small>{t('tour.day.booking.uiLine')}</small>
        </span>
      </div>
    );
  if (id === 'move')
    return (
      <div className="dt-ui dt-ui--move">
        <span className="dt-ui__old tabular">{fmt.time(10 * 60)}</span>
        <ArrowIcon size={14} />
        <span className="dt-ui__new tabular">{fmt.time(16 * 60)}</span>
        <small>{t('tour.day.move.ui')}</small>
      </div>
    );
  if (id === 'breaks')
    return (
      <div className="dt-ui dt-ui--strip">
        <i data-kind="appt" />
        <i data-kind="prep">{t('tour.day.breaks.prep')}</i>
        <i data-kind="appt" />
        <i data-kind="break">{t('tour.day.breaks.break')}</i>
        <i data-kind="appt" />
      </div>
    );
  if (id === 'team')
    return (
      <div className="dt-ui dt-ui--team">
        <span className="dt-ui__seg">
          <b>{t('tour.day.team.mine')}</b>
          <span>{t('tour.day.team.all')}</span>
        </span>
        <span className="dt-ui__faces">
          {staff.slice(0, 4).map((s) => (
            <StaffAvatar key={s.id} staff={s} size="sm" />
          ))}
        </span>
      </div>
    );
  return (
    <dl className="dt-ui dt-ui--stats">
      <div>
        <dt>{t('tour.day.close.revenue')}</dt>
        <dd className="tabular">{fmt.money(2840)}</dd>
      </div>
      <div>
        <dt>{t('tour.day.close.occupancy')}</dt>
        <dd className="tabular">86%</dd>
      </div>
      <div>
        <dt>{t('tour.day.close.returning')}</dt>
        <dd className="tabular">71%</dd>
      </div>
    </dl>
  );
}

// ── Who it's for ─────────────────────────────────────────────────────

const FACTS = [
  ['bilingual', GlobeIcon],
  ['import', UploadIcon],
  ['sync', CalendarIcon],
  ['export', DownloadIcon],
] as const;

function Trust() {
  const { t } = useI18n();
  return (
    <section className="dt-trust" aria-labelledby="dt-trust-title">
      <div className="dt-wrap">
        <div className="dt-trust__head">
          <h2 id="dt-trust-title" className="dt-display dt-display--sm">
            {t('tour.trust.title')}
          </h2>
          <p className="dt-lede">{t('tour.trust.body')}</p>
        </div>
        <ul className="dt-types">
          {BUSINESS_TYPES.filter((x) => x !== 'other').map((x) => (
            <li key={x}>{t(`businessType.${x}`)}</li>
          ))}
        </ul>
        <ul className="dt-facts">
          {FACTS.map(([k, Icon]) => (
            <li key={k}>
              <Icon size={18} />
              <h3>{t(`tour.trust.${k}.title`)}</h3>
              <p>{t(`tour.trust.${k}.body`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Bridge() {
  const { t, tx } = useI18n();
  const { business } = usePublicTenant();
  return (
    <div id={LIVE_ID} className="dt-bridge">
      <p className="dt-bridge__title">{t('tour.bridge.title')}</p>
      <p className="dt-bridge__body">{t('tour.bridge.body', { business: tx(business.name) })}</p>
      <span className="dt-bridge__arrow" aria-hidden>
        <ArrowDownIcon size={16} />
      </span>
    </div>
  );
}

// ── The last word, after the live page ──────────────────────────────

/** A week of slots filling up, drawn like the product mark. 0 stays open; the rest fill in the listed order. */
const SLOTS = [1, 0, 3, 1, 0, 1, 2, 1, 1, 0, 1, 4, 0, 1, 1, 5, 1, 0, 1, 0, 1, 1, 3, 1];
const SLOT_ORDER = [6, 0, 13, 3, 20, 8, 15, 22, 2, 10, 17, 5, 11, 23, 14, 18, 7, 21, 1, 9, 16, 4, 12, 19];

export function DemoClosing() {
  const { t } = useI18n();
  const art = useSeen<HTMLDivElement>(0.4);
  return (
    <section className="dt-close" aria-labelledby="dt-close-title">
      <div className="dt-close__panel">
        <div className="dt-close__text">
          <h2 id="dt-close-title" className="dt-display">
            {t('tour.close.title')}
          </h2>
          <p className="dt-lede">{t('tour.close.body')}</p>
          <div className="dt-close__actions">
            <Link to="/sign-up" className="btn btn--light btn--lg">
              {t('marketing.cta.primary')}
            </Link>
            <Link to="/#features" className="dt-close__more">
              {t('tour.close.more', { product: PRODUCT.name })} <ArrowIcon size={14} />
            </Link>
          </div>
        </div>
        <div ref={art.ref} className="dt-slots" data-seen={art.seen || undefined} aria-hidden>
          {SLOTS.map((v, i) => (
            <i key={i} data-fill={v || undefined} style={{ '--i': SLOT_ORDER.indexOf(i) } as CSSProperties} />
          ))}
        </div>
      </div>
    </section>
  );
}
