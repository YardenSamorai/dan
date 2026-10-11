import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownIcon, ArrowIcon, PlayIcon } from '../../../components/ui/Icons';
import { useI18n } from '../../../i18n/I18nProvider';
import { usePublicTenant } from '../TenantContext';
import { FILM_PARAM, type FromFilm, type ToFilm } from './bridge';
import { FilmPanel } from './FilmPanel';
import { filmView, frameAt, sceneStarts, scenesFor, type FilmFrame } from './script';
import './film.css';

/** The example business whose page opens with the film. */
export const FILM_SLUGS = ['demo-studio'];

const SEEN = 'film.seen';
/** Design size of the dashboard and phone together, and of the phone alone on narrow screens. */
const SET = { wide: { w: 958, h: 900 }, narrow: { w: 446, h: 900 } };
/** Steps per scene sent to the frame; finer than this isn't visible. */
const GRAIN = 40;
/** The film eases after the scroll instead of jumping with each wheel notch. */
const EASE_MS = 260;

const stillMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const seenBefore = () => {
  try {
    return sessionStorage.getItem(SEEN) === '1';
  } catch {
    return false;
  }
};

/**
 * The demo page builds itself as the visitor scrolls: a tall section whose
 * stage stays put while the real page, in a phone, gains one setting after
 * another. Scrolling stays the browser's own; the film only reads it.
 */
export function DemoFilm() {
  const { t } = useI18n();
  const [still] = useState(stillMotion);
  const [open, setOpen] = useState(() => !seenBefore());
  if (still) return <FilmStill />;
  if (!open)
    return (
      <div className="film-replay">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            setOpen(true);
            window.scrollTo({ top: 0 });
          }}
        >
          <PlayIcon size={14} /> {t('film.replay')}
        </button>
      </div>
    );
  return <Film />;
}

function Film() {
  const { t } = useI18n();
  const { business, base, slug } = usePublicTenant();
  const scenes = useMemo(() => scenesFor(business), [business]);
  const starts = useMemo(() => sceneStarts(scenes), [scenes]);
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const frameEl = useRef<HTMLIFrameElement>(null);
  const [p, setP] = useState(0);
  const [ready, setReady] = useState(false);
  const [fit, setFit] = useState({ scale: 0.7, narrow: false });

  useEffect(() => {
    let raf = 0;
    let target = 0;
    let shown = -1;
    let last = 0;
    const read = () => {
      const el = root.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const run = r.height - window.innerHeight;
      target = run > 0 ? Math.min(Math.max(-r.top / run, 0), 1) : 0;
      document.documentElement.toggleAttribute('data-film-playing', r.bottom > 80);
      if (target > 0.97) {
        try {
          sessionStorage.setItem(SEEN, '1');
        } catch {
          /* private mode: the film just plays again */
        }
      }
    };
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      const gap = target - shown;
      shown = Math.abs(gap) < 0.0004 ? target : shown + gap * (1 - Math.exp(-dt / EASE_MS));
      setP(shown);
      raf = shown === target ? 0 : requestAnimationFrame(tick);
    };
    const onScroll = () => {
      read();
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    read();
    shown = target;
    setP(target);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      document.documentElement.removeAttribute('data-film-playing');
    };
  }, []);

  useEffect(() => {
    const el = stage.current;
    const room = view.current;
    if (!el || !room) return;
    const measure = () => {
      const narrow = el.clientWidth < 820;
      const set = narrow ? SET.narrow : SET.wide;
      setFit({
        narrow,
        scale: Math.max(0.3, Math.min(1, room.clientWidth / set.w, room.clientHeight / set.h)),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(room);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    frameEl.current?.setAttribute('inert', '');
    const onMessage = (e: MessageEvent<FromFilm>) => {
      if (e.origin === window.location.origin && e.source === frameEl.current?.contentWindow && e.data?.type === 'film:ready') setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const raw = frameAt(scenes, p);
  const frame: FilmFrame = {
    scene: raw.scene,
    t: Math.round(raw.t * GRAIN) / GRAIN,
  };
  const key = `${frame.scene}:${frame.t}`;
  useEffect(() => {
    if (!ready) return;
    frameEl.current?.contentWindow?.postMessage({ type: 'film:frame', frame } satisfies ToFilm, window.location.origin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const shown = useMemo(() => filmView(business, scenes, frame).business, [business, scenes, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const index = scenes.findIndex((s) => s.id === frame.scene);
  const counted = scenes.filter((s) => s.id !== 'start' && s.id !== 'done');
  const step = counted.findIndex((s) => s.id === frame.scene);
  const jump = (i: number) => {
    const el = root.current;
    if (!el) return;
    const run = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY + run * (starts[i] + 0.002);
    window.scrollTo({ top, behavior: 'smooth' });
  };
  const total = scenes.reduce((n, s) => n + s.weight, 0);

  return (
    <section ref={root} className="film" aria-label={t('film.label')} style={{ '--film-length': total } as React.CSSProperties}>
      <div ref={stage} className="film__stage">
        <div className="film__bar">
          <span className="film__progress" aria-hidden>
            <span style={{ transform: `scaleX(${p})` }} />
          </span>
          <a href="#film-end" className="film__skip">
            {t('film.skip')} <ArrowDownIcon size={14} />
          </a>
        </div>

        <div className="film__copy">
          {scenes.map((s, i) => (
            <div key={s.id} className="film__caption" data-active={i === index || undefined} aria-hidden={i !== index || undefined}>
              {step >= 0 && i === index && <p className="film__step tabular">{t('film.step', { n: step + 1, total: counted.length })}</p>}
              <h2 className={`display ${s.id === 'start' || s.id === 'done' ? 'display-md' : 'display-sm'} film__title`}>{t(`film.scenes.${s.id}.title`)}</h2>
              <p className="film__body">{t(`film.scenes.${s.id}.body`)}</p>
              {s.id === 'start' && (
                <p className="film__cue" aria-hidden>
                  <span className="film__cue-line" />
                  {t('film.scroll')}
                </p>
              )}
              {s.id === 'done' && (
                <div className="film__actions">
                  <Link to={`${base}/new`} className="btn btn--primary btn--lg" tabIndex={i === index ? undefined : -1}>
                    {t('film.book')}
                  </Link>
                  <a href="#film-end" className="link-arrow" tabIndex={i === index ? undefined : -1}>
                    {t('film.seePage')} <ArrowIcon />
                  </a>
                </div>
              )}
            </div>
          ))}
          <ol className="film__rail">
            {counted.map((s) => {
              const i = scenes.indexOf(s);
              return (
                <li key={s.id} data-state={i < index ? 'done' : i === index ? 'now' : undefined}>
                  <button type="button" onClick={() => jump(i)} aria-current={i === index ? 'step' : undefined}>
                    {t(`film.scenes.${s.id}.title`)}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div ref={view} className="film__view">
          <div className="film__set" style={{ '--scale': fit.scale } as React.CSSProperties} data-narrow={fit.narrow || undefined} data-ready={ready || undefined}>
            <FilmPanel frame={frame} view={shown} real={business} />
            <div className="film__device">
              <div className="film__phone">
                <span className="film__island" aria-hidden />
                <div className="film__screen" data-theme={shown.page.theme}>
                  <div className="film__status" aria-hidden>
                    <span className="tabular">9:41</span>
                    <svg viewBox="0 0 64 12" width="64" height="12">
                      <path d="M1 9h3v3H1zM6 6.5h3V12H6zM11 4h3v8h-3zM16 1h3v11h-3z" />
                      <path d="M33.5 3.2a8.8 8.8 0 0 1 11 0l-1.4 1.6a6.6 6.6 0 0 0-8.2 0zM36 6a5 5 0 0 1 6 0l-1.5 1.6a2.7 2.7 0 0 0-3 0zM39 9l1.5 1.7L42 9a2 2 0 0 0-3 0z" />
                      <rect x="48.5" y="1.5" width="13" height="9" rx="2.5" fill="none" stroke="currentColor" opacity=".45" />
                      <rect x="50" y="3" width="9" height="6" rx="1.2" />
                      <path d="M62.8 4.6v2.8a1.5 1.5 0 0 0 0-2.8z" opacity=".45" />
                    </svg>
                  </div>
                  <iframe ref={frameEl} src={`/book/${slug}?${FILM_PARAM}`} title={t('film.label')} tabIndex={-1} aria-hidden />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <span id="film-end" className="film__end" />
    </section>
  );
}

/** For visitors who turned motion off: the steps as a short list, then straight to the page. */
function FilmStill() {
  const { t } = useI18n();
  const { business, base } = usePublicTenant();
  const scenes = scenesFor(business).filter((s) => s.id !== 'start' && s.id !== 'done');
  return (
    <section className="film-still container" aria-labelledby="film-still-title">
      <h2 id="film-still-title" className="display display-sm">
        {t('film.still')}
      </h2>
      <ol>
        {scenes.map((s) => (
          <li key={s.id}>
            <strong>{t(`film.scenes.${s.id}.title`)}</strong> {t(`film.scenes.${s.id}.body`)}
          </li>
        ))}
      </ol>
      <Link to={`${base}/new`} className="btn btn--primary">
        {t('film.book')}
      </Link>
    </section>
  );
}
