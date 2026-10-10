import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { todayISO } from '../../domain/time';
import { useI18n } from '../../i18n/I18nProvider';
import { clamp } from '../../lib/math';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { ArrowIcon } from '../ui/Icons';
import { Avatar } from '../ui/bits';
import { APPTS, bookedAt, DAY_END, DAY_START, PREBOOKED, STAFF, TOTAL } from './calendarDemo';
import '../../app/pages/calendar.css';
import './hero.css';

const PHONE = '(max-width: 899px)';

/** The app screen is laid out at a real device size and scaled to fit the frame. */
const SCREEN = {
  tablet: { w: 1024, h: 720, top: 0 },
  phone: { w: 390, h: 800, top: 44 },
};
const BAR = 56;
const HEAD = 56;
const HOURS = Array.from({ length: (DAY_END - DAY_START) / 60 - 1 }, (_, i) => DAY_START + (i + 1) * 60);

function usePhone() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(PHONE).matches);
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

/**
 * The marketing hero: the pitch beside the app's own day calendar on a tablet (a phone on small screens).
 * Scrolling books the day: appointments land in the calendar one by one. Scrolling is only read, never taken over.
 */
export function HeroCalendar() {
  const { t, fmt } = useI18n();
  const reduced = useReducedMotion();
  const phone = usePhone();
  const [booked, setBooked] = useState(reduced ? TOTAL : PREBOOKED);

  const sectionRef = useRef<HTMLElement>(null);
  const deviceRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<HTMLDivElement>(null);

  const size = phone ? SCREEN.phone : SCREEN.tablet;

  // Fit the app screen to the frame.
  useLayoutEffect(() => {
    const el = screenRef.current;
    const app = appRef.current;
    if (!el || !app) return;
    const fit = () => (app.style.transform = `scale(${el.clientWidth / size.w})`);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w]);

  // Progress: through the pinned stretch on wide screens; as the phone scrolls up into view on small ones.
  useEffect(() => {
    if (reduced) {
      setBooked(TOTAL);
      return;
    }
    let raf = 0;
    const read = () => {
      raf = 0;
      const s = sectionRef.current;
      const d = deviceRef.current;
      if (!s || !d) return;
      const vh = window.innerHeight;
      let p: number;
      if (s.offsetHeight > vh * 1.2) {
        p = clamp(-s.getBoundingClientRect().top / (s.offsetHeight - vh));
      } else {
        const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 60;
        p = clamp((vh * 0.9 - d.getBoundingClientRect().top) / (vh * 0.9 - header - 16));
      }
      setBooked(bookedAt(p));
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', wake);
    return () => {
      window.removeEventListener('scroll', wake);
      window.removeEventListener('resize', wake);
      cancelAnimationFrame(raf);
    };
  }, [reduced, phone]);

  const day = todayISO();
  const staff = phone ? STAFF.slice(0, 1) : STAFF;
  const body = size.h - size.top - BAR - HEAD;
  const ppm = body / (DAY_END - DAY_START);
  const clients = t('marketing.hero.demo.clients').split('|');
  const latest = booked > PREBOOKED ? booked - 1 : -1;

  return (
    <section ref={sectionRef} className="hc" data-motion={!reduced} aria-labelledby="hero-title">
      <div className="hc__stage">
        <div className="hc__inner container">
          <div className="hc__copy">
            <h1 id="hero-title" className="display hc__title">
              {t('marketing.hero.title')
                .split(/(?<=\.)\s+/)
                .map((s) => (
                  <span key={s}>{s}</span>
                ))}
            </h1>
            <p className="hc__body">{t('marketing.hero.body')}</p>
            <div className="hc__actions">
              <Link to="/sign-up" className="btn btn--primary btn--lg">
                {t('marketing.cta.primary')}
              </Link>
              <Link to="/book/demo-studio" className="link-arrow">
                {t('marketing.cta.demo')} <ArrowIcon />
              </Link>
            </div>
          </div>

          <div className="hc__device" data-kind={phone ? 'phone' : 'tablet'} ref={deviceRef} aria-hidden="true">
            <div className="hc__screen" ref={screenRef} style={{ aspectRatio: `${size.w} / ${size.h}` }}>
              <div className="hc-app" ref={appRef} style={{ width: size.w, height: size.h, paddingTop: size.top }}>
                {phone && (
                  <div className="hc-app__status">
                    <span className="ltr">{fmt.time(9 * 60 + 41)}</span>
                    <i className="hc-app__island" />
                  </div>
                )}
                <div className="hc-app__bar" style={{ height: BAR }}>
                  <strong className="hc-app__title">{fmt.date(day, phone ? 'medium' : 'full')}</strong>
                  {!phone && (
                    <div className="segmented">
                      <button type="button" tabIndex={-1} aria-pressed>
                        {t('calendar.day')}
                      </button>
                      <button type="button" tabIndex={-1} aria-pressed={false}>
                        {t('calendar.week')}
                      </button>
                      <button type="button" tabIndex={-1} aria-pressed={false}>
                        {t('calendar.list')}
                      </button>
                    </div>
                  )}
                </div>

                <div className="hc-grid" style={{ '--cols': staff.length, '--hour': `${60 * ppm}px`, gridTemplateRows: `${HEAD}px ${body}px` } as CSSProperties}>
                  <div className="cal__corner" />
                  {staff.map((s) => {
                    const name = t(`marketing.hero.demo.staff.${s.id}`);
                    const count = APPTS.filter((a) => a.staff === s.id && a.order < booked).length;
                    return (
                      <div className="cal__head" key={s.id}>
                        <Avatar name={name} color={s.color} size="sm" />
                        <div className="cal__head-text">
                          <span className="cal__head-name">{name}</span>
                          <span className="cal__head-sub">
                            {fmt.timeRange(DAY_START, DAY_END)} · {t('units.appointments', { count })}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  <div className="hc-gutter">
                    {HOURS.map((m) => (
                      <span key={m} className="cal__hour" style={{ top: (m - DAY_START) * ppm }}>
                        {fmt.time(m)}
                      </span>
                    ))}
                  </div>

                  {staff.map((s) => (
                    <div className="cal__col hc-col" key={s.id}>
                      <div className="cal-lines" />
                      {APPTS.filter((a) => a.staff === s.id).map((a) => {
                        const h = (a.end - a.start) * ppm;
                        const isNew = a.order === latest;
                        return (
                          <div
                            key={a.order}
                            className="cal-slot hc-slot"
                            data-on={a.order < booked}
                            data-new={isNew}
                            style={{ top: (a.start - DAY_START) * ppm, height: h, insetInlineStart: 2, width: 'calc(100% - 6px)', '--tone': s.color } as CSSProperties}
                          >
                            <div className="cal-appt" data-status="confirmed" style={{ height: h }}>
                              <span className="cal-appt__time ltr">{fmt.timeRange(a.start, a.end)}</span>
                              <span className="cal-appt__name">
                                {clients[a.client]}
                                {isNew && <em className="hc-new">{t('marketing.hero.calendar.isNew')}</em>}
                              </span>
                              {h >= 64 && <span className="cal-appt__svc">{t(`marketing.hero.demo.services.${a.service}`)}</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
