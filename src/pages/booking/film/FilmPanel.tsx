import type { ReactNode } from 'react';
import type { PublicBusiness } from '../../../data';
import { ACCENTS, accentColor } from '../../../components/ui/accents';
import { BrushIcon, CalendarIcon, CheckIcon, ClockIcon, GearIcon, ImageIcon, PlusIcon, StarIcon, TagIcon, UploadIcon, UsersIcon } from '../../../components/ui/Icons';
import type { AccentKey, ThemeKey, Weekday } from '../../../domain/types';
import { useI18n } from '../../../i18n/I18nProvider';
import { built, part, typed, type FilmFrame, type SceneId } from './script';

type NavKey = 'calendar' | 'services' | 'staff' | 'availability' | 'page' | 'settings';

const NAV: { key: NavKey; icon: typeof CalendarIcon }[] = [
  { key: 'calendar', icon: CalendarIcon },
  { key: 'services', icon: TagIcon },
  { key: 'staff', icon: UsersIcon },
  { key: 'availability', icon: ClockIcon },
  { key: 'page', icon: BrushIcon },
  { key: 'settings', icon: GearIcon },
];

const NAV_OF: Record<SceneId, NavKey> = {
  start: 'settings',
  name: 'settings',
  brand: 'settings',
  theme: 'page',
  cover: 'page',
  services: 'services',
  team: 'staff',
  gallery: 'page',
  about: 'page',
  reviews: 'page',
  info: 'availability',
  calendar: 'calendar',
  done: 'calendar',
};

const THEMES: ThemeKey[] = ['clean', 'soft', 'editorial', 'night'];
const SWATCHES: AccentKey[] = ['fig', 'rose', 'clay', 'sage', 'ocean', 'ink', 'gold'];
const WEEK: Weekday[] = [0, 1, 2, 3, 4, 5, 6];
const DAY_START = 9 * 60;
const DAY_END = 19 * 60;

/**
 * The owner's side of the film: the dashboard screen where each setting is
 * made, drawn from the same half-built business the phone shows, so both
 * move together.
 */
export function FilmPanel({ frame, view, real }: { frame: FilmFrame; view: PublicBusiness; real: PublicBusiness }) {
  const { t, tx } = useI18n();
  const { scene } = frame;
  const nav = NAV_OF[scene];
  const name = tx(view.name);
  const holding = !['start', 'calendar', 'done'].includes(scene) && built(frame.t) >= 1;

  return (
    <div className="fp" data-screen={nav} aria-hidden>
      <aside className="fp__side">
        <div className="fp__biz">
          <span className="fp__mark">{name.charAt(0) || '·'}</span>
          <span className="fp__biz-name">{name || '\u00a0'}</span>
        </div>
        <ul className="fp__nav">
          {NAV.map(({ key, icon: Icon }) => (
            <li key={key} data-on={key === nav || undefined}>
              <Icon size={14} />
              <span>{t(`app.nav.${key}`)}</span>
            </li>
          ))}
        </ul>
      </aside>
      <div className="fp__main">
        <div key={nav + (nav === 'page' ? scene : '')} className="fp__screen">
          <Screen frame={frame} view={view} real={real} />
        </div>
        <p className="fp__saved" data-on={holding || undefined}>
          <CheckIcon size={12} /> {t('film.panel.saved')}
        </p>
      </div>
    </div>
  );
}

function Screen({ frame, view, real }: { frame: FilmFrame; view: PublicBusiness; real: PublicBusiness }) {
  const { t, tx, fmt } = useI18n();
  const { scene, t: at } = frame;
  const section = (kind: string) => view.page.sections.find((s) => s.kind === kind);

  switch (scene) {
    case 'start':
    case 'name':
    case 'brand':
      return (
        <Head title={t('app.nav.settings')} sub={t('film.panel.business')}>
          <Field label={t('film.panel.name')} value={tx(view.name)} typing={scene === 'name'} />
          <div className="fp__field">
            <span className="fp__label">{t('film.panel.logo')}</span>
            <div className="fp__logo-row">
              <span className="fp__logo" data-on={!view.branding.hideLogo || undefined}>
                {view.branding.logoUrl ? <img src={view.branding.logoUrl} alt="" /> : tx(view.name).charAt(0)}
              </span>
              <span className="fp__ghost-btn">
                <UploadIcon size={12} /> {t('film.panel.upload')}
              </span>
            </div>
          </div>
          <Field label={t('film.panel.tagline')} value={tx(view.tagline)} typing={scene === 'brand' && built(at) < 1} />
        </Head>
      );
    case 'theme':
      return (
        <Head title={t('app.nav.page')} sub={t('pageEditor.theme.label')}>
          <div className="fp__themes">
            {THEMES.map((k) => (
              <span key={k} className="fp__theme" data-theme={k} data-on={view.page.theme === k || undefined}>
                <span className="fp__theme-art" />
                {t(`pageEditor.theme.names.${k}`)}
              </span>
            ))}
          </div>
          <div className="fp__field">
            <span className="fp__label">{t('pageEditor.color.label')}</span>
            <div className="fp__swatches">
              {SWATCHES.map((k) => (
                <span key={k} style={{ background: ACCENTS[k] }} data-on={(view.branding.accent === k && !view.branding.customAccent) || undefined} />
              ))}
              {real.branding.customAccent && <span style={{ background: accentColor(real.branding) }} data-on={!!view.branding.customAccent || undefined} />}
            </div>
          </div>
        </Head>
      );
    case 'cover':
      return (
        <Head title={t('app.nav.page')} sub={t('film.panel.cover')}>
          <div className="fp__drop fp__drop--wide">
            {view.branding.coverUrl && built(at) > 0.25 ? <img src={view.branding.coverUrl} alt="" className="fp__pop" /> : <UploadIcon size={18} />}
          </div>
        </Head>
      );
    case 'services':
      return (
        <Head title={t('app.nav.services')} action={t('film.panel.newService')}>
          <ul className="fp__rows">
            {view.services.map((s) => (
              <li key={s.id} className="fp__row fp__pop">
                {s.imageUrl ? <img src={s.imageUrl} alt="" className="fp__thumb" /> : <span className="fp__thumb" />}
                <span className="fp__row-main">
                  <strong>{tx(s.name)}</strong>
                  <small>{fmt.duration(s.duration)}</small>
                </span>
                <span className="fp__row-end tabular">{fmt.money(s.price)}</span>
              </li>
            ))}
          </ul>
        </Head>
      );
    case 'team':
      return (
        <Head title={t('app.nav.staff')} action={t('film.panel.newPerson')}>
          <ul className="fp__rows">
            {view.staff.map((s) => (
              <li key={s.id} className="fp__row fp__pop">
                {s.avatarUrl ? (
                  <img src={s.avatarUrl} alt="" className="fp__thumb fp__thumb--round" />
                ) : (
                  <span className="fp__thumb fp__thumb--round" style={{ background: s.color }} />
                )}
                <span className="fp__row-main">
                  <strong>{tx(s.name)}</strong>
                  <small>{tx(s.role)}</small>
                </span>
                <span className="fp__days">
                  {WEEK.map((d) => (
                    <span key={d} data-on={s.workingDays.includes(d) || undefined}>
                      {fmt.weekday(d, 'narrow')}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Head>
      );
    case 'gallery': {
      const images = section('gallery')?.images ?? [];
      return (
        <Head title={t('app.nav.page')} sub={t('tenant.gallery.title')}>
          <div className="fp__grid">
            {images.map((src) => (
              <img key={src} src={src} alt="" className="fp__pop" />
            ))}
            <span className="fp__drop">
              <ImageIcon size={16} />
              <small>{t('film.panel.addPhotos')}</small>
            </span>
          </div>
        </Head>
      );
    }
    case 'about': {
      const about = section('about');
      const title = tx(about?.title) || t('tenant.about.title');
      return (
        <Head title={t('app.nav.page')} sub={t('tenant.about.title')}>
          {about?.imageUrl && <img src={about.imageUrl} alt="" className="fp__about-img fp__pop" />}
          <Field label={t('film.panel.fieldTitle')} value={title} />
          <Field label={t('film.panel.fieldText')} value={typed(tx(about?.body), at)} typing={built(at) < 1} multiline />
        </Head>
      );
    }
    case 'reviews':
      return (
        <Head title={t('app.nav.page')} sub={t('tenant.reviews.title')}>
          <ul className="fp__rows">
            {(section('reviews')?.items ?? []).map((r) => (
              <li key={r.id} className="fp__review fp__pop">
                <span className="fp__stars">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <StarIcon key={i} size={11} />
                  ))}
                </span>
                <p>{tx(r.body)}</p>
                <small>{tx(r.title)}</small>
              </li>
            ))}
          </ul>
        </Head>
      );
    case 'info':
      return (
        <Head title={t('app.nav.availability')} sub={t('tenant.info.hours')}>
          <ul className="fp__hours">
            {part(WEEK, at).map((d) => {
              const ranges = view.hours[d].ranges;
              return (
                <li key={d} className="fp__pop">
                  <span>{fmt.weekday(d, 'long')}</span>
                  <span className="tabular">{ranges.length ? ranges.map((r) => fmt.timeRange(r.start, r.end)).join(', ') : t('common.closed')}</span>
                </li>
              );
            })}
          </ul>
          {built(at) > 0.85 && <Field label={t('tenant.info.location')} value={tx(view.address)} />}
        </Head>
      );
    case 'calendar':
    case 'done':
      return <Day real={real} t={scene === 'done' ? 1 : at} />;
  }
}

/** A made-up but plausible day: a few bookings per person, arriving one by one. */
function Day({ real, t: at }: { real: PublicBusiness; t: number }) {
  const { t, tx, fmt } = useI18n();
  const people = real.staff.slice(0, 3);
  const names = t('film.panel.customers').split(',');
  const plan = [0, 120, 270, 390, 510];
  const roomy = real.services.filter((s) => s.duration >= 45);
  const pool = roomy.length ? roomy : real.services;
  const all = people
    .flatMap((p, col) =>
      plan.map((offset, i) => {
        const svc = pool[(i + col * 2) % pool.length];
        return {
          id: `${p.id}-${i}`,
          col,
          start: DAY_START + offset + col * 30,
          length: Math.min(svc.duration, 90),
          svc: tx(svc.name),
          who: names[(col * plan.length + i) % names.length],
          color: p.color,
        };
      }),
    )
    .filter((a) => a.start + a.length <= DAY_END && (a.col + a.start / 30) % 5 !== 2)
    .sort((a, b) => a.start - b.start || a.col - b.col);
  const shown = part(all, at);
  const newest = built(at) < 1 ? shown[shown.length - 1]?.id : undefined;
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 }, (_, i) => DAY_START + i * 60);

  return (
    <Head title={t('app.nav.calendar')} sub={t('common.today')}>
      <div className="fp__cal" style={{ '--cols': people.length } as React.CSSProperties}>
        <div className="fp__cal-head">
          <span />
          {people.map((p) => (
            <span key={p.id}>
              {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : <i style={{ background: p.color }} />}
              {tx(p.name).split(' ')[0]}
            </span>
          ))}
        </div>
        <div className="fp__cal-body">
          {hours.map((h) => (
            <span key={h} className="fp__cal-hour tabular" style={{ '--at': (h - DAY_START) / 60 } as React.CSSProperties}>
              <small>{fmt.time(h)}</small>
            </span>
          ))}
          {shown.map((a) => (
            <span
              key={a.id}
              className="fp__appt fp__pop"
              data-fresh={a.id === newest || undefined}
              style={
                {
                  '--col': a.col,
                  '--at': (a.start - DAY_START) / 60,
                  '--len': a.length / 60,
                  '--c': a.color,
                } as React.CSSProperties
              }
            >
              <strong>{a.who}</strong>
              <small>{a.svc}</small>
              {a.id === newest && <em>{t('film.panel.fresh')}</em>}
            </span>
          ))}
        </div>
      </div>
    </Head>
  );
}

function Head({ title, sub, action, children }: { title: string; sub?: string; action?: string; children: ReactNode }) {
  return (
    <>
      <header className="fp__head">
        <div>
          {sub && <p className="fp__crumb">{sub}</p>}
          <h3 className="fp__title">{title}</h3>
        </div>
        {action && (
          <span className="fp__action">
            <PlusIcon size={12} /> {action}
          </span>
        )}
      </header>
      <div className="fp__content">{children}</div>
    </>
  );
}

function Field({ label, value, typing, multiline }: { label: string; value: string; typing?: boolean; multiline?: boolean }) {
  return (
    <div className="fp__field">
      <span className="fp__label">{label}</span>
      <span className="fp__input" data-focus={typing || undefined} data-multiline={multiline || undefined}>
        {value}
        {typing && <span className="fp__caret" />}
      </span>
    </div>
  );
}
