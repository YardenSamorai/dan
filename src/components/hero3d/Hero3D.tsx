import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { addDays, todayISO, weekdayOf } from '../../domain/time';
import { useI18n } from '../../i18n/I18nProvider';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useScrollTimeline } from '../../lib/useScrollTimeline';
import { clamp, lerp } from '../../lib/math';
import { ArrowIcon } from '../ui/Icons';
import { CAL, CAL_APPTS, DAY, domAt, PICKED, SCENES, SLOTS, type SceneId } from './timeline';
import type { Engine, Quad, Tier } from './engine';
import { createSeq, SEQ, type Seq } from './seq';
import '../../app/pages/calendar.css';
import './hero3d.css';

/** Rail clock range: the whole of her day. */
const RAIL = { start: 480, end: 1320 };
const HOURS = Array.from({ length: (RAIL.end - RAIL.start) / 60 + 1 }, (_, i) => RAIL.start + i * 60);
const PANEL = { w: 800, h: 500 };
const DEBUG = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('herodebug');

type Mode = 'pending' | '3d' | 'static';
type Rect = { x: number; y: number; w: number; h: number };

/** WebGL 2 on a device with some headroom, or the still version. */
function pickTier(): Tier | null {
  if (typeof window === 'undefined') return null;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return null;
  if ((nav.deviceMemory ?? 4) < 3 || (nav.hardwareConcurrency ?? 4) < 4) return null;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    return null;
  }
  const small = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
  return small ? 'mid' : 'high';
}

/** CSS matrix3d that maps the rect (0,0,w,h) onto quad q (TL, TR, BR, BL). */
function rectToQuad(w: number, h: number, q: Quad) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let g = 0;
  let hh = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const det = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / det;
    hh = (dx1 * sy - sx * dy1) / det;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + hh * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + hh * y3;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(',')})`;
}

/** Map a point of the panel's own space through the quad (bilinear is close enough for a small rect). */
function quadPoint(q: Quad, u: number, v: number): [number, number] {
  const top = [lerp(q[0][0], q[1][0], u), lerp(q[0][1], q[1][1], u)];
  const bot = [lerp(q[3][0], q[2][0], u), lerp(q[3][1], q[2][1], u)];
  return [lerp(top[0], bot[0], v), lerp(top[1], bot[1], v)];
}
const rectQuad = (r: Rect): Quad => [
  [r.x, r.y],
  [r.x + r.w, r.y],
  [r.x + r.w, r.y + r.h],
  [r.x, r.y + r.h],
];
const mixQuad = (a: Quad, b: Quad, t: number) => a.map((p, i) => [lerp(p[0], b[i][0], t), lerp(p[1], b[i][1], t)]) as Quad;

interface Layout {
  vw: number;
  vh: number;
  wide: boolean;
  /** Clock rail: its box while it is the day's clock, and the calendar gutter it becomes. */
  rail0: { x: number; w: number; y0: number; k: number };
  rail1: { x: number; w: number; y0: number; k: number };
  /** The calendar's appointment column and the block her booking becomes. */
  col: Rect;
  block: Rect;
  ppm: number;
  /** The picked time inside the booking panel, in panel pixels. */
  slot: Rect;
}

/**
 * The marketing hero. A real-time 3D day: one woman, five appointments, the
 * clock running down the side. The last one she books herself, on a real
 * booking page, and it lands in the business calendar on the page.
 */
export function Hero3D() {
  const { t, fmt, dir } = useI18n();
  const rtl = dir === 'rtl';
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<Mode>(() => (reduced ? 'static' : 'pending'));
  const [wide, setWide] = useState(() => typeof window === 'undefined' || (innerWidth / innerHeight >= 1 && innerWidth >= 700));

  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seqCanvasRef = useRef<HTMLCanvasElement>(null);
  const posterRef = useRef<HTMLImageElement>(null);
  const groundRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const colRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const dbgRef = useRef<HTMLPreElement>(null);

  const engine = useRef<Engine | null>(null);
  const seq = useRef<Seq | null>(null);
  const [seqFits, setSeqFits] = useState(false);
  const layout = useRef<Layout | null>(null);
  const progress = useRef(0);
  const shown = useRef({ scene: '' as SceneId | '', minute: -1, picked: false, revealed: null as boolean | null });

  const paint = useCallback(
    (p: number) => {
      const L = layout.current;
      if (!L) return;
      const d = domAt(p);
      const E = engine.current;
      let quad: Quad | null = null;
      // The prerendered opening covers the screen up to the pillar; past the pillar the live scene shows through.
      const film = seqCanvasRef.current;
      if (E && seq.current && film && seq.current.draw(p)) {
        E.frame(p, false);
        const edges = E.pillar();
        if (edges && edges[1] <= 0) {
          film.style.visibility = 'hidden';
          quad = E.frame(p);
        } else {
          film.style.visibility = 'visible';
          const open = !edges || edges[0] >= L.vw;
          if (open) film.style.maskImage = 'none';
          else {
            const [a, b] = edges;
            film.style.maskImage = `linear-gradient(to right, #000 ${(a + (b - a) * 0.25).toFixed(1)}px, transparent ${(b - (b - a) * 0.25).toFixed(1)}px)`;
            quad = E.frame(p);
          }
        }
      } else {
        if (film) film.style.visibility = 'hidden';
        quad = E ? E.frame(p) : null;
      }

      if (groundRef.current) groundRef.current.style.opacity = d.ground.toFixed(3);
      if (introRef.current) introRef.current.style.opacity = d.intro.toFixed(3);

      // The booking page on her monitor, then the time she picks flying into the calendar.
      const panel = panelRef.current;
      if (panel) {
        const on = !!quad && d.dom > 0 && d.panel < 1;
        panel.style.visibility = on ? 'visible' : 'hidden';
        if (on && quad) {
          panel.style.transform = rectToQuad(PANEL.w, PANEL.h, quad);
          panel.style.opacity = (d.dom * (1 - d.panel)).toFixed(3);
        }
      }
      if (shown.current.picked !== d.picked) {
        shown.current.picked = d.picked;
        pickRef.current?.setAttribute('aria-pressed', String(d.picked));
      }
      const chip = chipRef.current;
      if (chip) {
        const fly = d.chip > 0 && (quad || d.chip >= 1);
        chip.style.visibility = fly || p >= 1 ? 'visible' : 'hidden';
        if (fly || p >= 1) {
          const s = L.slot;
          const from: Quad = quad
            ? [quadPoint(quad, s.x / PANEL.w, s.y / PANEL.h), quadPoint(quad, (s.x + s.w) / PANEL.w, s.y / PANEL.h), quadPoint(quad, (s.x + s.w) / PANEL.w, (s.y + s.h) / PANEL.h), quadPoint(quad, s.x / PANEL.w, (s.y + s.h) / PANEL.h)]
            : rectQuad(L.block);
          chip.style.transform = rectToQuad(L.block.w, L.block.h, mixQuad(from, rectQuad(L.block), d.chip));
          chip.style.setProperty('--k', d.chip.toFixed(3));
        }
      }

      // The rail: the day's clock, which becomes the calendar's hour gutter.
      const rail = railRef.current;
      if (rail) {
        const r = d.rail;
        const x = lerp(L.rail0.x, L.rail1.x, r);
        rail.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
        rail.style.width = `${lerp(L.rail0.w, L.rail1.w, r).toFixed(1)}px`;
        rail.style.setProperty('--y0', lerp(L.rail0.y0, L.rail1.y0, r).toFixed(2));
        rail.style.setProperty('--k', lerp(L.rail0.k, L.rail1.k, r).toFixed(4));
        rail.style.setProperty('--r', r.toFixed(3));
        rail.style.setProperty('--now', d.minute.toFixed(2));
      }
      const m = Math.floor(d.minute);
      if (m !== shown.current.minute && timeRef.current) {
        shown.current.minute = m;
        timeRef.current.textContent = fmt.time(m);
      }
      if (d.scene !== shown.current.scene && sceneRef.current) {
        shown.current.scene = d.scene;
        sceneRef.current.dataset.scene = d.scene;
      }
      if (clockRef.current) clockRef.current.style.opacity = (1 - clamp(d.rail * 1.6)).toFixed(3);

      if (cardRef.current) cardRef.current.style.setProperty('--card', d.card.toFixed(3));
      const fin = finalRef.current;
      if (fin) {
        fin.style.setProperty('--copy', d.copy.toFixed(3));
        const on = d.copy > 0.5;
        if (on !== shown.current.revealed) {
          shown.current.revealed = on;
          fin.dataset.revealed = String(on);
          fin.querySelectorAll('a').forEach((a) => (a.tabIndex = on ? 0 : -1));
        }
      }
      if (DEBUG && dbgRef.current) dbgRef.current.textContent = `p ${p.toFixed(4)}  ${d.scene}  ${fmt.time(m)}`;
    },
    [fmt],
  );

  const apply = useCallback(
    (p: number) => {
      progress.current = p;
      paint(p);
    },
    [paint],
  );
  useScrollTimeline(sectionRef, apply, { enabled: mode === '3d', smoothing: 10 });

  // Decide between the live scene and the stills once, then load three.js only if it will be used.
  useEffect(() => {
    if (reduced) {
      setMode('static');
      return;
    }
    const tier = pickTier();
    if (!tier) {
      setMode('static');
      return;
    }
    let cancelled = false;
    import('./engine')
      .then(({ createEngine }) => {
        if (cancelled || !canvasRef.current) return;
        try {
          engine.current = createEngine(canvasRef.current, tier, rtl);
        } catch {
          setMode('static');
          return;
        }
        const s = stickyRef.current!.getBoundingClientRect();
        const shift = shiftFor(s.width, rtl);
        engine.current.resize(s.width, s.height, Math.min(devicePixelRatio || 1, tier === 'high' ? 2 : 1.5), shift);
        setMode('3d');
        paint(progress.current);
        posterRef.current?.setAttribute('data-hidden', 'true');
      })
      .catch(() => !cancelled && setMode('static'));
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
    };
  }, [reduced, rtl]);

  // The prerendered opening, on landscape screens the film covers.
  useEffect(() => {
    const c = seqCanvasRef.current;
    if (mode !== '3d' || !seqFits || !c || !stickyRef.current) return;
    const s = createSeq(c, () => paint(progress.current));
    const r = stickyRef.current.getBoundingClientRect();
    s.resize(r.width, r.height, Math.min(devicePixelRatio || 1, 2), shiftFor(r.width, rtl));
    seq.current = s;
    engine.current?.matchAspect(SEQ.camAspect);
    return () => {
      seq.current = null;
      engine.current?.matchAspect(null);
      s.dispose();
      c.style.visibility = 'hidden';
      paint(progress.current);
    };
  }, [mode, seqFits, rtl, paint]);

  // Geometry from the live layout: the viewport, the header, the calendar slot and the picked time.
  useLayoutEffect(() => {
    const sticky = stickyRef.current;
    const slot = slotRef.current;
    const col = colRef.current;
    if (!sticky || !slot || !col) return;
    const measure = () => {
      const s = sticky.getBoundingClientRect();
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 60;
      const w = s.width / s.height >= 1 && s.width >= 700;
      const c = col.getBoundingClientRect();
      const colR: Rect = { x: c.left - s.left, y: c.top - s.top, w: c.width, h: c.height };
      const ppm = colR.h / (CAL.end - CAL.start);
      const card = slot.getBoundingClientRect();
      const gutterW = rtl ? card.right - c.right : c.left - card.left;
      const railW = w ? 92 : 58;
      const edge = w ? Math.max(24, (s.width - 1200) / 2) : 14;
      const top0 = header + (w ? 128 : 104);
      const bottom0 = s.height - (w ? 44 : 28);
      const mine = CAL_APPTS.find((a) => a.mine)!;
      let slotR: Rect = { x: 0, y: 0, w: 1, h: 1 };
      const pick = pickRef.current;
      const panel = panelRef.current;
      if (pick && panel) {
        let x = 0;
        let y = 0;
        let el: HTMLElement | null = pick;
        while (el && el !== panel) {
          x += el.offsetLeft;
          y += el.offsetTop;
          el = el.offsetParent as HTMLElement | null;
        }
        slotR = { x, y, w: pick.offsetWidth, h: pick.offsetHeight };
      }
      layout.current = {
        vw: s.width,
        vh: s.height,
        wide: w,
        rail0: { x: rtl ? s.width - edge - railW : edge, w: railW, y0: top0, k: (bottom0 - top0) / (RAIL.end - RAIL.start) },
        rail1: { x: rtl ? c.right - s.left : card.left - s.left, w: gutterW, y0: colR.y, k: ppm },
        col: colR,
        block: { x: colR.x + 3, y: colR.y + (mine.start - CAL.start) * ppm, w: colR.w - 6, h: (mine.end - mine.start) * ppm },
        ppm,
        slot: slotR,
      };
      col.style.setProperty('--ppm', ppm.toFixed(4));
      col.style.setProperty('--hour', `${(ppm * 60).toFixed(3)}px`);
      if (chipRef.current) {
        chipRef.current.style.width = `${layout.current.block.w}px`;
        chipRef.current.style.height = `${layout.current.block.h}px`;
      }
      setWide(w);
      setSeqFits(w && s.width / s.height <= SEQ.maxAspect);
      if (engine.current) engine.current.resize(s.width, s.height, Math.min(devicePixelRatio || 1, 2), shiftFor(s.width, rtl));
      seq.current?.resize(s.width, s.height, Math.min(devicePixelRatio || 1, 2), shiftFor(s.width, rtl));
      paint(mode === 'static' ? 1 : progress.current);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(sticky);
    ro.observe(slot);
    return () => ro.disconnect();
  }, [rtl, mode, paint]);

  const day = addDays(todayISO(), 7);
  const appts = CAL_APPTS.filter((a) => !a.mine);
  const mine = CAL_APPTS.find((a) => a.mine)!;
  const isStatic = mode === 'static';
  const poster = `/hero3d/poster-${wide ? 'wide' : 'tall'}${rtl ? '' : '-ltr'}.webp`;

  return (
    <section ref={sectionRef} className="h3" data-mode={mode} aria-labelledby="hero-title">
      <div className="h3__sticky" ref={stickyRef}>
        {!isStatic && (
          <div className="h3__scene" aria-hidden="true">
            <img ref={posterRef} className="h3__poster" src={poster} alt="" decoding="async" {...{ fetchpriority: 'high' }} />
            <canvas ref={canvasRef} className="h3__canvas" />
            <canvas ref={seqCanvasRef} className="h3__canvas h3__film" />
            <div className="h3__ground" ref={groundRef} />
          </div>
        )}

        {/* Her booking page: real markup, laid onto the monitor in 3D. */}
        {!isStatic && (
          <div className="h3-panel" ref={panelRef} aria-hidden="true" style={{ width: PANEL.w, height: PANEL.h }}>
            <div className="h3-panel__bar">
              <span className="h3-panel__logo" />
              <strong>{t('marketing.hero.booking.business')}</strong>
            </div>
            <div className="h3-panel__body">
              <div className="h3-panel__svc">
                <strong>{t('marketing.hero.booking.service')}</strong>
                <span>{t('marketing.hero.booking.duration')}</span>
              </div>
              <h3 className="h3-panel__title">{t('marketing.hero.booking.when')}</h3>
              <div className="h3-panel__days">
                {Array.from({ length: 6 }, (_, i) => {
                  const iso = addDays(day, i - 2);
                  return (
                    <span key={iso} className="h3-panel__day" data-on={i === 2}>
                      <small>{fmt.weekday(weekdayOf(iso), 'short')}</small>
                      <b>{Number(iso.slice(8))}</b>
                    </span>
                  );
                })}
              </div>
              <div className="h3-panel__slots">
                {SLOTS.map((m) => (
                  <button key={m} type="button" tabIndex={-1} className="slot" ref={m === PICKED ? pickRef : undefined} aria-pressed={false}>
                    <span className="ltr">{fmt.time(m)}</span>
                  </button>
                ))}
              </div>
              <span className="btn btn--primary h3-panel__cta">{t('marketing.hero.booking.book')}</span>
            </div>
          </div>
        )}

        <div className={`h3__final container${isStatic ? ' h3__final--static' : ''}`} ref={finalRef} data-revealed={isStatic}>
          <div className="h3__copy">
            <h1 id="hero-title" className="display h3__title">
              {t('marketing.hero.title')}
            </h1>
            <p className="h3__body">{t('marketing.hero.body')}</p>
            <div className="h3__actions">
              <Link to="/sign-up" className="btn btn--primary btn--lg" tabIndex={isStatic ? 0 : -1}>
                {t('marketing.cta.primary')}
              </Link>
              <Link to="/book/demo-studio" className="link-arrow" tabIndex={isStatic ? 0 : -1}>
                {t('marketing.cta.demo')} <ArrowIcon />
              </Link>
            </div>
          </div>

          {/* The business calendar: the app's own appointment blocks, for the studio she booked with. */}
          <div className="h3-cal" ref={slotRef} aria-hidden="true">
            <div className="h3-cal__card" ref={cardRef}>
              <div className="h3-cal__head">
                <strong>{fmt.date(day, 'long')}</strong>
                <span>
                  {t('marketing.hero.booking.business')} · {t('units.appointments', { count: CAL_APPTS.length })}
                </span>
              </div>
              <div className="h3-cal__col" ref={colRef}>
                <div className="cal-lines" />
                {appts.map((a, i) => (
                  <div
                    key={a.id}
                    className="cal-appt h3-cal__appt"
                    data-status="confirmed"
                    style={{ '--tone': a.tone, '--m0': a.start - CAL.start, '--m1': a.end - CAL.start, '--i': i } as CSSProperties}
                  >
                    <div className="h3-in">
                      <span className="cal-appt__time ltr">{fmt.timeRange(a.start, a.end)}</span>
                      <span className="cal-appt__name">{t(`marketing.hero.appts.${a.id}.client`)}</span>
                      <span className="cal-appt__svc">{t(`marketing.hero.appts.${a.id}.service`)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* The time she picked becomes her appointment. */}
        <div className="h3-chip" ref={chipRef} aria-hidden="true" style={{ '--tone': mine.tone } as CSSProperties}>
          <span className="h3-chip__slot ltr">{fmt.time(mine.start)}</span>
          <div className="cal-appt h3-chip__appt" data-status="confirmed">
            <div className="h3-in">
              <span className="cal-appt__time ltr">{fmt.timeRange(mine.start, mine.end)}</span>
              <span className="cal-appt__name">
                {t('marketing.hero.appts.mine.client')} <em className="h3-chip__new">{t('marketing.hero.calendar.isNew')}</em>
              </span>
              <span className="cal-appt__svc">{t('marketing.hero.appts.mine.service')}</span>
            </div>
          </div>
        </div>

        {/* The clock rail: her day's time, which becomes the calendar's hour gutter. */}
        <div className="h3-rail" ref={railRef} aria-hidden="true">
          <div className="h3-rail__clock" ref={clockRef}>
            <span className="h3-rail__time ltr" ref={timeRef}>
              {fmt.time(DAY[0].start)}
            </span>
            <div className="h3-rail__scene" ref={sceneRef} data-scene="nails">
              {SCENES.map((s) => (
                <span key={s} data-for={s}>
                  <b>{t(`marketing.hero.scenes.${s}.what`)}</b>
                  <small>{t(`marketing.hero.scenes.${s}.where`)}</small>
                </span>
              ))}
            </div>
          </div>
          <i className="h3-rail__line" />
          {HOURS.map((m) => (
            <span key={m} className="h3-rail__hour ltr" data-even={(m / 60) % 2 === 0} data-past={m > CAL.end} style={{ '--m': m - RAIL.start } as CSSProperties}>
              {fmt.time(m)}
            </span>
          ))}
          {DAY.map((a) => (
            <i key={a.id} className="h3-rail__appt" style={{ '--m0': a.start - RAIL.start, '--m1': a.end - RAIL.start, '--len': a.end - a.start, '--start': a.start } as CSSProperties} />
          ))}
          <i className="h3-rail__now" />
        </div>

        {!isStatic && (
          <div className="h3__intro" ref={introRef} aria-hidden="true">
            <p>{t('marketing.hero.intro')}</p>
            <span className="h3__cue">
              {t('marketing.hero.scroll')}
              <i />
            </span>
          </div>
        )}
        {DEBUG && <pre className="hero-debug" ref={dbgRef} />}
      </div>

      {isStatic && (
        <ol className="h3-stills container" aria-label={t('marketing.hero.clock')}>
          {SCENES.map((s, i) => (
            <li key={s} className="h3-still" style={{ animationDelay: `${i * 90}ms` }}>
              <img src={`/hero3d/still-${s}.webp`} width={960} height={720} alt="" loading="lazy" decoding="async" />
              <span className="h3-still__time ltr">{fmt.time(i < DAY.length ? DAY[i].start : 1230)}</span>
              <span className="h3-still__what">{t(`marketing.hero.scenes.${s}.what`)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Push the scene's centre away from the clock rail. */
const shiftFor = (vw: number, rtl: boolean) => {
  const s = vw >= 700 ? 58 : 22;
  return rtl ? s : -s;
};
