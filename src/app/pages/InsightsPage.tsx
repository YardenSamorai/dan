import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownIcon, ArrowUpIcon, CalendarIcon, ChartIcon, ChevronRight, ExternalIcon, PlusIcon, StarIcon } from '../../components/ui/Icons';
import { Avatar, StaffAvatar } from '../../components/ui/bits';
import { change, insights, outlook, PERIODS, spanDays, type Bucket, type DateSpan, type Heatmap, type Insights, type Outlook, type PeriodKey } from '../../domain/insights';
import { businessNow } from '../../domain/scheduling';
import { weekdayOf } from '../../domain/time';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n/messages';
import { useAppUI } from '../AppUI';
import { useLookup } from '../lookup';
import { PageHeader } from '../shared';
import { useWorkspace } from '../workspace';
import './insights.css';

const PERIOD_KEY: Record<PeriodKey, MessageKey> = {
  '7d': 'insights.periods.d7',
  '30d': 'insights.periods.d30',
  '90d': 'insights.periods.d90',
  month: 'insights.periods.month',
  lastMonth: 'insights.periods.lastMonth',
};

const hours = (min: number) => Math.round(min / 60);
const pct = (part: number, whole: number) => (whole ? part / whole : 0);

export default function InsightsPage() {
  const { state } = useLookup();
  const { t, fmt } = useI18n();
  const { solo } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const asked = params.get('period') as PeriodKey | null;
  const period: PeriodKey = asked && PERIODS.includes(asked) ? asked : '30d';
  const now = businessNow(state);
  const data = useMemo(() => insights(state, period, now), [state, period, now.date]);
  const ahead = useMemo(() => outlook(state, now), [state, now.date]);
  const range = (s: DateSpan) => t('units.range', { from: fmt.date(s.from, 'short'), to: fmt.date(s.to, 'short') });

  const pick = (p: PeriodKey) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (p === '30d') next.delete('period');
        else next.set('period', p);
        return next;
      },
      { replace: true },
    );

  if (!data.hasHistory) return <EmptyInsights />;

  return (
    <div className="page ins">
      <PageHeader
        eyebrow={range(data.span)}
        title={t('insights.title')}
        lede={data.comparable ? t('insights.compared', { range: range(data.previousSpan) }) : t('insights.noCompare')}
        actions={
          <div className="segmented ins-periods" role="group" aria-label={t('insights.period')}>
            {PERIODS.map((p) => (
              <button key={p} type="button" aria-pressed={p === period} onClick={() => pick(p)}>
                {t(PERIOD_KEY[p])}
              </button>
            ))}
          </div>
        }
      />

      <RevenueHero key={period} data={data} />
      <Kpis data={data} />

      <div className="ins-grid">
        {!solo && <TeamBoard data={data} />}
        <ServicesBoard data={data} />
        <CustomersBoard data={data} />
        <BusyTimes heat={data.heat} />
      </div>

      <WeekAhead ahead={ahead} />
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────

/** Change against the previous period. Relative for amounts, percentage points for rates. */
function Delta({ cur, prev, points, good = 'up', show }: { cur: number; prev: number; points?: boolean; good?: 'up' | 'down'; show: boolean }) {
  const { t, fmt } = useI18n();
  if (!show) return null;
  const v = points ? cur - prev : change(cur, prev);
  if (v === null) return null;
  const rounded = Math.round(v * 100);
  if (rounded === 0)
    return (
      <span className="ins-delta" data-tone="flat">
        {t('insights.delta.same')}
      </span>
    );
  const up = rounded > 0;
  const text = points ? t('insights.delta.points', { n: Math.abs(rounded) }) : fmt.percent(Math.abs(v));
  return (
    <span className="ins-delta" data-tone={up === (good === 'up') ? 'good' : 'bad'} role="img" aria-label={t(up ? 'insights.delta.up' : 'insights.delta.down', { value: text })}>
      {up ? <ArrowUpIcon size={11} /> : <ArrowDownIcon size={11} />}
      <span className="ltr">{text}</span>
    </span>
  );
}

function Section({ id, title, link, children, className }: { id: string; title: string; link?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`sec${className ? ` ${className}` : ''}`} aria-labelledby={id}>
      <div className="sec__head">
        <h2 className="sec__title" id={id}>
          {title}
        </h2>
        {link}
      </div>
      {children}
    </section>
  );
}

/** A thin horizontal measure; `value` is 0..1. */
function Meter({ value, tone }: { value: number; tone?: 'accent' | 'soft' }) {
  return (
    <span className="ins-meter" data-tone={tone} aria-hidden>
      <span style={{ inlineSize: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </span>
  );
}

function RevenueHero({ data }: { data: Insights }) {
  const { t, fmt } = useI18n();
  const { current: c, previous: p } = data;
  return (
    <section className="panel ins-hero" aria-labelledby="ins-revenue">
      <div className="ins-hero__top">
        <div className="ins-hero__figure">
          <h2 className="ins-hero__label" id="ins-revenue">
            {t('insights.revenue')}
          </h2>
          <p className="ins-hero__value tabular">{fmt.money(Math.round(c.revenue))}</p>
          <p className="ins-hero__line">
            <Delta cur={c.revenue} prev={p.revenue} show={data.comparable} />
            <span>{t('insights.revenueLine', { appointments: t('units.appointments', { count: c.booked }), avg: fmt.money(Math.round(c.avgTicket)) })}</span>
          </p>
        </div>
        <div className="ins-hero__aside">
          {c.lost > 0 && <p className="ins-hero__lost">{t('insights.lost', { amount: fmt.money(Math.round(c.lost)) })}</p>}
          <p className="ins-hero__hint">{t('insights.revenueHint')}</p>
        </div>
      </div>
      <TrendChart buckets={data.series} weekly={spanDays(data.span) > 45} />
    </section>
  );
}

function TrendChart({ buckets, weekly }: { buckets: Bucket[]; weekly: boolean }) {
  const { t, fmt } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...buckets.map((b) => b.revenue));
  const best = buckets.reduce((bi, b, i) => (b.revenue > buckets[bi].revenue ? i : bi), 0);
  const when = (b: Bucket) => (weekly ? t('insights.chart.weekOf', { date: fmt.date(b.from, 'short') }) : fmt.date(b.from, 'medium'));
  const point = (b: Bucket) => t('insights.chart.point', { date: when(b), amount: fmt.money(b.revenue), appointments: t('units.appointments', { count: b.booked }) });
  const caption =
    hover !== null
      ? point(buckets[hover])
      : max > 0
        ? t(weekly ? 'insights.chart.bestWeek' : 'insights.chart.bestDay', { date: when(buckets[best]), amount: fmt.money(max) })
        : t('insights.chart.empty');
  const label = t(weekly ? 'insights.chart.week' : 'insights.chart.day');

  return (
    <figure className="ins-chart">
      <div className="ins-chart__plot" role="img" aria-label={`${label}. ${caption}`} onPointerLeave={() => setHover(null)} data-dense={buckets.length > 20 || undefined}>
        <span className="ins-chart__max" aria-hidden>
          {max > 0 && fmt.money(max)}
        </span>
        {buckets.map((b, i) => (
          <span
            key={b.from}
            className="ins-chart__col"
            data-on={hover === i || undefined}
            data-best={hover === null && i === best && max > 0 ? true : undefined}
            onPointerEnter={() => setHover(i)}
            onPointerDown={() => setHover(i)}
          >
            <span className="ins-chart__bar" style={{ '--h': max ? b.revenue / max : 0, '--i': i } as CSSProperties} />
          </span>
        ))}
      </div>
      <div className="ins-chart__axis" aria-hidden>
        <span>{fmt.date(buckets[0].from, 'short')}</span>
        <span>{fmt.date(buckets[buckets.length - 1].to, 'short')}</span>
      </div>
      <figcaption className="ins-chart__caption" aria-live="polite">
        {caption}
      </figcaption>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.from}>
              <th scope="row">{when(b)}</th>
              <td>{fmt.money(b.revenue)}</td>
              <td>{t('units.appointments', { count: b.booked })}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function Kpi({ label, value, delta, sub }: { label: string; value: string; delta?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="ins-kpi">
      <p className="ins-kpi__label">{label}</p>
      <p className="ins-kpi__value tabular">{value}</p>
      {delta && <p className="ins-kpi__delta">{delta}</p>}
      {sub && <p className="ins-kpi__sub">{sub}</p>}
    </div>
  );
}

function Kpis({ data }: { data: Insights }) {
  const { t, fmt } = useI18n();
  const { current: c, previous: p, comparable } = data;
  const lossParts = [t('insights.kpi.cancelled', { count: c.cancelled }), t('insights.kpi.noShows', { count: c.noShow })];
  return (
    <section className="panel ins-kpis" aria-label={t('insights.title')}>
      <Kpi
        label={t('insights.kpi.appointments')}
        value={fmt.number(c.booked)}
        delta={<Delta cur={c.booked} prev={p.booked} show={comparable} />}
        sub={c.upcoming ? `${t('insights.kpi.completed', { count: c.completed })} · ${t('insights.kpi.upcoming', { count: c.upcoming })}` : t('insights.kpi.completed', { count: c.completed })}
      />
      <Kpi
        label={t('insights.kpi.customers')}
        value={fmt.number(c.customers)}
        delta={<Delta cur={c.customers} prev={p.customers} show={comparable} />}
        sub={t('insights.kpi.split', { new: fmt.number(c.newCustomers), returning: fmt.number(c.returningCustomers) })}
      />
      <Kpi
        label={t('insights.kpi.occupancy')}
        value={fmt.percent(c.occupancy)}
        delta={<Delta cur={c.occupancy} prev={p.occupancy} points show={comparable} />}
        sub={t('insights.kpi.occupancySub', { booked: hours(c.bookedMinutes), open: hours(c.openMinutes) })}
      />
      <Kpi
        label={t('insights.kpi.loss')}
        value={fmt.percent(c.lossRate)}
        delta={<Delta cur={c.lossRate} prev={p.lossRate} points good="down" show={comparable} />}
        sub={lossParts.join(' · ')}
      />
    </section>
  );
}

function TeamBoard({ data }: { data: Insights }) {
  const L = useLookup();
  const { t, tx, fmt } = useI18n();
  const rows = data.staff;
  if (!rows.length) return null;
  const top = rows[0];
  const topRevenue = Math.max(1, top.revenue);
  const mostHours = rows.reduce((m, r) => (r.bookedMinutes > m.bookedMinutes ? r : m), top);
  const name = (id: string) => tx(L.staff.get(id)?.name);
  return (
    <Section id="ins-team" title={t('insights.team.title')} className="ins-grid__wide">
      <div className="panel">
        {top.revenue > 0 && (
          <div className="ins-lead">
            <p>{t('insights.team.lead', { name: name(top.staffId), amount: fmt.money(top.revenue), appointments: t('units.appointments', { count: top.booked }) })}</p>
            {mostHours.staffId !== top.staffId && <p>{t('insights.team.hoursLead', { name: name(mostHours.staffId), hours: t('units.hours', { count: hours(mostHours.bookedMinutes) }) })}</p>}
          </div>
        )}
        <ol className="list ins-rank" role="list">
          {rows.map((r, i) => {
            const s = L.staff.get(r.staffId);
            if (!s) return null;
            return (
              <li key={r.staffId} className="list__row ins-rank__row">
                <StaffAvatar staff={s} />
                <div className="list__main ins-rank__main">
                  <span className="list__title ins-rank__name">
                    {tx(s.name)}
                    {i === 0 && r.revenue > 0 && (
                      <span className="ins-badge">
                        <StarIcon size={11} /> {t('insights.team.top')}
                      </span>
                    )}
                  </span>
                  <span className="list__sub">
                    {t('insights.team.sub', {
                      appointments: t('units.appointments', { count: r.booked }),
                      hours: t('units.hours', { count: hours(r.bookedMinutes) }),
                      pct: fmt.percent(r.occupancy),
                    })}
                  </span>
                  <Meter value={r.revenue / topRevenue} tone={i === 0 ? 'accent' : 'soft'} />
                </div>
                <div className="ins-amount">
                  <span className="ins-amount__value tabular">{fmt.money(r.revenue)}</span>
                  <span className="ins-amount__sub">{t('insights.team.share', { pct: fmt.percent(pct(r.revenue, data.current.revenue)) })}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Section>
  );
}

function ServicesBoard({ data }: { data: Insights }) {
  const L = useLookup();
  const { t, tx, fmt } = useI18n();
  const shown = data.services.slice(0, 5);
  const rest = data.services.length - shown.length;
  const topRevenue = Math.max(1, shown[0]?.revenue ?? 0);
  return (
    <Section id="ins-services" title={t('insights.services.title')}>
      <div className="panel">
        {shown.length ? (
          <ol className="list" role="list">
            {shown.map((r, i) => (
              <li key={r.serviceId} className="list__row ins-svc">
                <div className="list__main">
                  <span className="list__title">{tx(L.services.get(r.serviceId)?.name)}</span>
                  <span className="list__sub">{t('insights.services.sub', { appointments: t('units.appointments', { count: r.booked }), pct: fmt.percent(pct(r.revenue, data.current.revenue)) })}</span>
                  <Meter value={r.revenue / topRevenue} tone={i === 0 ? 'accent' : 'soft'} />
                </div>
                <span className="ins-amount__value tabular">{fmt.money(r.revenue)}</span>
              </li>
            ))}
            {rest > 0 && (
              <li className="list__row ins-svc ins-svc--more">
                <span className="list__sub">{t('insights.services.other', { count: rest })}</span>
              </li>
            )}
          </ol>
        ) : (
          <p className="empty">{t('insights.chart.empty')}</p>
        )}
      </div>
    </Section>
  );
}

function BusyTimes({ heat }: { heat: Heatmap }) {
  const { t, fmt } = useI18n();
  const hourLabel = (h: number) => fmt.time(h * 60);
  const summary =
    heat.busiestDay !== null && heat.busiestHour !== null ? t('insights.busy.peak', { day: fmt.weekday(heat.busiestDay), time: hourLabel(heat.busiestHour) }) : t('insights.busy.empty');
  const step = heat.hours.length > 8 ? 2 : 1;
  return (
    <Section id="ins-busy" title={t('insights.busy.title')} className="ins-grid__wide">
      <div className="panel ins-busy">
        <p className="ins-busy__summary">{summary}</p>
        {heat.max > 0 && (
          <>
            <div className="ins-heat" role="img" aria-label={summary} style={{ '--cols': heat.hours.length } as CSSProperties}>
              <span aria-hidden />
              {heat.hours.map((h, j) => (
                <span key={h} className="ins-heat__hour" aria-hidden>
                  {j % step === 0 ? hourLabel(h) : ''}
                </span>
              ))}
              {heat.weekdays.map((d, i) => (
                <div key={d} className="ins-heat__row" aria-hidden>
                  <span className="ins-heat__day">{fmt.weekday(d, 'short')}</span>
                  {heat.cells[i].map((v, j) => (
                    <span
                      key={j}
                      className="ins-heat__cell"
                      title={t('insights.busy.cell', { day: fmt.weekday(d), time: hourLabel(heat.hours[j]), appointments: t('units.appointments', { count: v }) })}
                      style={{ '--v': v / heat.max } as CSSProperties}
                      data-zero={v === 0 || undefined}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="ins-heat__legend" aria-hidden>
              <span>{t('insights.busy.quiet')}</span>
              {[0.15, 0.4, 0.65, 1].map((v) => (
                <span key={v} className="ins-heat__cell" style={{ '--v': v } as CSSProperties} />
              ))}
              <span>{t('insights.busy.busy')}</span>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

function Split({ title, a, b }: { title: string; a: { label: string; value: number }; b: { label: string; value: number } }) {
  const { fmt } = useI18n();
  const total = a.value + b.value;
  const share = pct(a.value, total);
  return (
    <div className="ins-split">
      <p className="ins-split__title">{title}</p>
      <div className="ins-split__bar" aria-hidden>
        <span style={{ flexGrow: share }} />
        <span style={{ flexGrow: 1 - share }} />
      </div>
      <dl className="ins-split__legend">
        {[a, b].map((x, i) => (
          <div key={x.label} data-i={i}>
            <dt>{x.label}</dt>
            <dd className="tabular">
              {fmt.number(x.value)} <span>{fmt.percent(pct(x.value, total))}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CustomersBoard({ data }: { data: Insights }) {
  const L = useLookup();
  const { t, fmt } = useI18n();
  const { openCustomer } = useAppUI();
  const { can } = useWorkspace();
  const c = data.current;
  return (
    <Section id="ins-customers" title={t('insights.customers.title')}>
      <div className="panel">
        {c.customers ? (
          <>
            <div className="ins-splits">
              <Split title={t('insights.customers.mix')} a={{ label: t('insights.customers.new'), value: c.newCustomers }} b={{ label: t('insights.customers.returning'), value: c.returningCustomers }} />
              <Split title={t('insights.customers.channels')} a={{ label: t('insights.customers.online'), value: c.online }} b={{ label: t('insights.customers.studio'), value: c.studio }} />
            </div>
            <p className="ins-sublabel">{t('insights.customers.top')}</p>
            <ol className="list" role="list">
              {data.customers.map((r) => {
                const cu = L.customers.get(r.customerId);
                const body = (
                  <>
                    <Avatar name={cu?.name ?? '?'} size="sm" />
                    <span className="list__main">
                      <span className="list__title">{cu?.name}</span>
                      <span className="list__sub">{t('units.visits', { count: r.visits })}</span>
                    </span>
                    <span className="ins-amount__value tabular">{fmt.money(r.revenue)}</span>
                  </>
                );
                return (
                  <li key={r.customerId}>
                    {can('customers.view') ? (
                      <button type="button" className="list__row" onClick={() => openCustomer(r.customerId)}>
                        {body}
                      </button>
                    ) : (
                      <div className="list__row">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <p className="empty">{t('insights.customers.none')}</p>
        )}
      </div>
    </Section>
  );
}

function WeekAhead({ ahead }: { ahead: Outlook }) {
  const { t, fmt } = useI18n();
  return (
    <Section
      id="ins-ahead"
      title={t('insights.ahead.title')}
      link={
        <Link to="/app/calendar" className="sec__link">
          <CalendarIcon size={14} /> {t('insights.ahead.calendar')}
        </Link>
      }
    >
      <div className="panel ins-ahead">
        <div className="ins-ahead__summary">
          <p className="ins-ahead__line">{t('insights.ahead.summary', { appointments: t('units.appointments', { count: ahead.booked }), amount: fmt.money(ahead.revenue) })}</p>
          {ahead.pending > 0 && (
            <Link to="/app/appointments?status=pending&range=upcoming" className="ins-ahead__pending">
              {t('insights.ahead.pending', { count: ahead.pending })} <ChevronRight size={12} />
            </Link>
          )}
        </div>
        <ol className="ins-week" role="list">
          {ahead.days.map((d) => (
            <li
              key={d.date}
              className="ins-week__day"
              data-closed={d.closed || undefined}
              aria-label={d.closed ? `${fmt.date(d.date, 'medium')}: ${t('insights.ahead.closed')}` : t('insights.ahead.day', { date: fmt.date(d.date, 'medium'), appointments: t('units.appointments', { count: d.booked }), pct: fmt.percent(d.occupancy) })}
            >
              <span className="ins-week__name" aria-hidden>
                {fmt.weekday(weekdayOf(d.date), 'short')}
              </span>
              <span className="ins-week__date tabular" aria-hidden>
                {Number(d.date.slice(8))}
              </span>
              <span className="ins-week__gauge" aria-hidden>
                <span style={{ blockSize: `${d.occupancy * 100}%` }} />
              </span>
              <span className="ins-week__count tabular" aria-hidden>
                {d.closed ? t('insights.ahead.closed') : fmt.percent(d.occupancy)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

function EmptyInsights() {
  const { t } = useI18n();
  const { can, tenant } = useWorkspace();
  const { newAppointment } = useAppUI();
  return (
    <div className="page ins">
      <PageHeader title={t('insights.title')} />
      <section className="panel ins-empty">
        <span className="ins-empty__icon" aria-hidden>
          <ChartIcon size={28} />
        </span>
        <h2 className="ins-empty__title">{t('insights.empty.title')}</h2>
        <p className="ins-empty__body">{t('insights.empty.body')}</p>
        <div className="ins-empty__actions">
          {can('appointments.manage') && (
            <button type="button" className="btn btn--primary btn--sm" onClick={() => newAppointment()}>
              <PlusIcon size={14} /> {t('insights.empty.book')}
            </button>
          )}
          <Link to={`/book/${tenant.business.slug}`} target="_blank" className="btn btn--tinted btn--sm">
            <ExternalIcon size={14} /> {t('insights.empty.page')}
          </Link>
        </div>
      </section>
    </div>
  );
}
