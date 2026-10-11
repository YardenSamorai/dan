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

/** The phone shows one column; its appointments land in their own sequence, one there from the start. */
const PHONE_APPTS = APPTS.filter((a) => a.staff === STAFF[0].id).sort((a, b) => a.order - b.order);
const PHONE_PRE = 1;

/** Scroll phases: the device straightens (and on phones rises), then the day books. Angles are where it starts. */
const MOTION = {
  phone: { riseEnd: 0.38, bookStart: 0.42, tilt: 34, turn: -14, roll: 5, sway: 7, scale: 0.9 },
  tablet: { riseEnd: 0.3, bookStart: 0.34, tilt: 26, turn: 18, roll: -3, sway: 4, scale: 0.92 },
};

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

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

function offsetWithin(el: HTMLElement, ancestor: HTMLElement) {
  let y = 0;
  for (let n: HTMLElement | null = el; n && n !== ancestor; n = n.offsetParent as HTMLElement | null) y += n.offsetTop;
  return y;
}

/**
 * The marketing hero: the pitch beside the app's own day calendar on a tablet (a phone on small screens).
 * Scrolling books the day: appointments land in the calendar one by one. Scrolling is only read, never taken over.
 * The device starts tilted back in depth and straightens as the stage pins; on small screens it also rises over the pitch.
 * Each new booking floats a notification in front of the device.
 */
export function HeroCalendar() {
  const { t, fmt } = useI18n();
  const reduced = useReducedMotion();
  const phone = usePhone();
  const total = phone ? PHONE_APPTS.length : TOTAL;
  const pre = phone ? PHONE_PRE : PREBOOKED;
  const [booked, setBooked] = useState(reduced ? total : pre);

  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
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

  // Progress through the pinned stretch drives the booking (and, on phones, the device's rise).
  useEffect(() => {
    const copy = copyRef.current;
    const rig = rigRef.current;
    if (reduced) {
      setBooked(total);
      return;
    }
    let raf = 0;
    const read = () => {
      raf = 0;
      const s = sectionRef.current;
      const stage = stageRef.current;
      if (!s || !stage || !copy || !rig) return;
      const vh = window.innerHeight;
      const p = clamp(-s.getBoundingClientRect().top / Math.max(1, s.offsetHeight - vh));
      const m = phone ? MOTION.phone : MOTION.tablet;
      const rise = ease(clamp(p / m.riseEnd));
      const book = clamp((p - m.bookStart) / (1 - m.bookStart));
      let dy = 0;
      if (phone) {
        const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 60;
        const room = stage.clientHeight - header;
        const target = header + Math.max(12, (room - rig.offsetHeight) / 2);
        dy = target - offsetWithin(rig, stage);
        copy.style.opacity = String(1 - clamp(p / (m.riseEnd * 0.7)));
        copy.style.transform = `translate3d(0, ${(-rise * 48).toFixed(1)}px, 0)`;
      }
      const turn = (1 - rise) * m.turn + Math.sin(book * Math.PI) * m.sway;
      rig.style.transform = `translate3d(0, ${(dy * rise).toFixed(1)}px, 0) rotateX(${((1 - rise) * m.tilt).toFixed(2)}deg) rotateY(${turn.toFixed(2)}deg) rotateZ(${((1 - rise) * m.roll).toFixed(2)}deg) scale(${(m.scale + (1 - m.scale) * rise).toFixed(3)})`;
      rig.style.setProperty('--lift', rise.toFixed(3));
      setBooked(bookedAt(book, total, pre));
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
      for (const el of [copy, rig]) el?.removeAttribute('style');
    };
  }, [reduced, phone, total, pre]);

  const day = todayISO();
  const staff = phone ? STAFF.slice(0, 1) : STAFF;
  const seq = (a: (typeof APPTS)[number]) => (phone ? PHONE_APPTS.indexOf(a) : a.order);
  const body = size.h - size.top - BAR - HEAD;
  const ppm = body / (DAY_END - DAY_START);
  const clients = t('marketing.hero.demo.clients').split('|');
  const latest = booked > pre ? booked - 1 : -1;
  const fresh = latest < 0 ? null : phone ? PHONE_APPTS[latest] : APPTS.find((a) => a.order === latest);
  const freshTone = STAFF.find((s) => s.id === fresh?.staff)?.color;

  return (
    <section ref={sectionRef} className="hc" data-motion={!reduced} aria-labelledby="hero-title">
      <div className="hc__stage" ref={stageRef}>
        <div className="hc__inner container">
          <div className="hc__copy" ref={copyRef}>
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

          <div className="hc__rig" data-kind={phone ? 'phone' : 'tablet'} ref={rigRef} aria-hidden="true">
            <div className="hc__device" data-kind={phone ? 'phone' : 'tablet'}>
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
                      const count = APPTS.filter((a) => a.staff === s.id && seq(a) < booked).length;
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
                          const isNew = seq(a) === latest;
                          return (
                            <div
                              key={a.order}
                              className="cal-slot hc-slot"
                              data-on={seq(a) < booked}
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

            {fresh && (
              <div className="hc-toast" key={fresh.order} style={{ '--tone': freshTone } as CSSProperties}>
                <Avatar name={clients[fresh.client]} color={freshTone} size="sm" />
                <div className="hc-toast__text">
                  <strong>{t('marketing.hero.calendar.booked')}</strong>
                  <span>
                    {clients[fresh.client]} · {t(`marketing.hero.demo.services.${fresh.service}`)}
                    {!phone && ` · ${t(`marketing.hero.demo.staff.${fresh.staff}`)}`}
                  </span>
                </div>
                <span className="hc-toast__time ltr">{fmt.time(fresh.start)}</span>
              </div>
            )}
            <i className="hc__floor" />
          </div>
        </div>
      </div>
    </section>
  );
}
