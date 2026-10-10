import type { CSSProperties, ReactNode } from 'react';
import { Avatar, StatusBadge } from '../../components/ui/bits';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';

/**
 * Editorial product chapters. Each pairs one idea with a faithful, static slice
 * of the real interface (same tokens, same calendar and booking language).
 */
export function Showcase() {
  const { t } = useI18n();
  return (
    <div className="showcase">
      <Chapter id="bookingPage" visual={<BookingVignette />} />
      <Chapter id="calendar" visual={<CalendarVignette />} flip />
      <Chapter id="customers" visual={<CustomerVignette />} />
      <div className="showcase__more">
        <h3 className="showcase__more-title">{t('marketing.showcase.more')}</h3>
        <ul>
          {(['availability', 'mobile', 'bilingual'] as const).map((k) => (
            <li key={k}>
              <h4>{t(`marketing.features.${k}.title` as MessageKey)}</h4>
              <p>{t(`marketing.features.${k}.body` as MessageKey)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Chapter({ id, visual, flip }: { id: 'bookingPage' | 'calendar' | 'customers'; visual: ReactNode; flip?: boolean }) {
  const { t } = useI18n();
  return (
    <article className="chapter" data-flip={flip || undefined}>
      <div className="chapter__text mk-rise">
        <h3 className="chapter__title">{t(`marketing.features.${id}.title` as MessageKey)}</h3>
        <p className="chapter__body">{t(`marketing.features.${id}.body` as MessageKey)}</p>
      </div>
      <div className="chapter__stage mk-rise" aria-hidden>
        {visual}
      </div>
    </article>
  );
}

/* ── Booking page on a phone, painted with a tenant's own accent ──── */
function BookingVignette() {
  const { t, fmt } = useI18n();
  const k = (s: string) => t(`marketing.showcase.booking.${s}` as MessageKey);
  const days = [5, 6, 7, 8, 9, 10, 11];
  return (
    <div className="vig-phone" data-accent="clay">
      <div className="vig-phone__bar">
        <span className="vig-phone__mark">{[...k('business')][0]}</span>
        <span className="vig-phone__biz">{k('business')}</span>
      </div>
      <div className="vig-phone__progress">
        <span>{k('step')}</span>
        <i>
          <b />
        </i>
      </div>
      <p className="vig-phone__title">{k('title')}</p>
      <div className="vig-days">
        {days.map((d, i) => (
          <span key={d} className="vig-day" data-on={d === 9 || undefined} data-off={i === 6 || undefined}>
            <small>{fmt.weekday(i, 'short')}</small>
            <b>{fmt.number(d)}</b>
          </span>
        ))}
      </div>
      <p className="vig-phone__day">{k('day')}</p>
      <p className="vig-phone__label">{k('morning')}</p>
      <div className="vig-slots">
        <span>08:30</span>
        <span>09:20</span>
        <span data-taken>10:10</span>
      </div>
      <p className="vig-phone__label">{k('afternoon')}</p>
      <div className="vig-slots">
        <span>16:00</span>
        <span data-on>16:50</span>
        <span>17:40</span>
      </div>
      <div className="vig-phone__foot">
        <span>
          <b>{k('service')}</b>
          <small>{k('meta')}</small>
        </span>
        <span className="vig-phone__cta">{k('cta')}</span>
      </div>
    </div>
  );
}

/* ── A day in the calendar ─────────────────────────────────────── */
const DAY_FROM = 9 * 60;
const DAY_LEN = 5 * 60;
type VBlock = { col: number; start: number; len: number; kind: 'appt' | 'break' | 'blocked' | 'off'; label?: string; client?: string; status?: 'pending' | 'arrived' | 'completed' };
const VBLOCKS: VBlock[] = [
  { col: 0, start: 540, len: 60, kind: 'appt', label: 'a1', client: 'c1', status: 'completed' },
  { col: 0, start: 615, len: 45, kind: 'appt', label: 'a2', client: 'c2', status: 'completed' },
  { col: 0, start: 720, len: 30, kind: 'break' },
  { col: 0, start: 780, len: 60, kind: 'appt', label: 'a1', client: 'c3' },
  { col: 1, start: 570, len: 60, kind: 'appt', label: 'a3', client: 'c3', status: 'completed' },
  { col: 1, start: 660, len: 30, kind: 'appt', label: 'a5', client: 'c4', status: 'pending' },
  { col: 1, start: 750, len: 60, kind: 'blocked', label: 'blocked' },
  { col: 2, start: 540, len: 45, kind: 'appt', label: 'a4', client: 'c2', status: 'completed' },
  { col: 2, start: 600, len: 75, kind: 'appt', label: 'a6', client: 'c1', status: 'arrived' },
  { col: 2, start: 690, len: 30, kind: 'break' },
  { col: 2, start: 780, len: 60, kind: 'off' },
];
const VTONES = ['#2e7bb8', '#c8862a', '#7d62c4'];
const NOW = 11 * 60 + 20;

function CalendarVignette() {
  const { t } = useI18n();
  const k = (s: string) => t(`marketing.showcase.calendar.${s}` as MessageKey);
  const pct = (m: number) => `${((m - DAY_FROM) / DAY_LEN) * 100}%`;
  const staff = ['staffA', 'staffB', 'staffC'];
  return (
    <div className="vig-cal">
      <div className="vig-cal__top">
        <b>{k('day')}</b>
      </div>
      <div className="vig-cal__heads">
        <span />
        {staff.map((s, i) => (
          <span key={s} style={{ '--tone': VTONES[i] } as CSSProperties}>
            <i />
            {k(s)}
          </span>
        ))}
      </div>
      <div className="vig-cal__body">
        <div className="vig-cal__gutter">
          {[9, 10, 11, 12, 13].map((h) => (
            <span key={h} style={{ top: pct(h * 60) }}>
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {staff.map((s, col) => (
          <div key={s} className="vig-cal__col" style={{ '--tone': VTONES[col] } as CSSProperties}>
            {VBLOCKS.filter((b) => b.col === col).map((b, i) => (
              <span
                key={i}
                className={`vig-b vig-b--${b.kind}`}
                data-status={b.status}
                style={{ top: pct(b.start), height: `calc(${(b.len / DAY_LEN) * 100}% - 2px)` }}
              >
                {b.kind === 'appt' && (
                  <>
                    <small className="ltr">
                      {String(Math.floor(b.start / 60)).padStart(2, '0')}:{String(b.start % 60).padStart(2, '0')}
                    </small>
                    <b>{k(b.client!)}</b>
                    {b.len >= 45 && <em>{b.status === 'pending' ? k('pending') : k(b.label!)}</em>}
                  </>
                )}
                {b.kind === 'break' && k('break')}
                {b.kind === 'blocked' && k('blocked')}
              </span>
            ))}
          </div>
        ))}
        <span className="vig-cal__now" style={{ top: pct(NOW) }} />
      </div>
    </div>
  );
}

/* ── A customer, remembered ────────────────────────────────────── */
function CustomerVignette() {
  const { t } = useI18n();
  const k = (s: string) => t(`marketing.showcase.customer.${s}` as MessageKey);
  return (
    <div className="vig-person">
      <div className="vig-person__head">
        <Avatar name={k('name')} size="lg" />
        <div>
          <b>{k('name')}</b>
          <small>{k('since')}</small>
        </div>
      </div>
      <dl className="vig-person__stats">
        <div>
          <dt>{k('visits')}</dt>
          <dd>14</dd>
        </div>
        <div>
          <dt>{k('noShows')}</dt>
          <dd>0</dd>
        </div>
        <div>
          <dt>{k('spent')}</dt>
          <dd>{k('spentValue')}</dd>
        </div>
      </dl>
      <div className="vig-person__next">
        <small>{k('next')}</small>
        <b>{k('nextValue')}</b>
      </div>
      <p className="vig-person__note">{k('note')}</p>
      <p className="vig-person__label">{k('history')}</p>
      <ul className="vig-person__history">
        {([
          ['h1', 'completed'],
          ['h2', 'completed'],
          ['h3', 'cancelled'],
        ] as const).map(([h, s]) => (
          <li key={h}>
            <span>{k(h)}</span>
            <small>{k(`${h}d`)}</small>
            <StatusBadge status={s} />
          </li>
        ))}
      </ul>
    </div>
  );
}
