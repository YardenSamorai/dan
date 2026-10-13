import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BusinessMark, ChevronLeft, ChevronRight, ClockIcon, CloseIcon, MessageIcon, PhoneIcon, PinIcon, PlusIcon } from '../../components/ui/Icons';
import { StaffAvatar } from '../../components/ui/bits';
import type { PublicService } from '../../data';
import { WEEKDAYS } from '../../domain/defaults';
import { openState } from '../../domain/opening';
import { isClass, termsRange } from '../../domain/scheduling';
import { addDays, weekdayOf } from '../../domain/time';
import { galleryFlow } from '../../domain/page';
import type { GalleryFlow, GalleryLayout, HeroLayout, ISODate, Minutes, PageSection, ServicesLayout } from '../../domain/types';
import { useI18n } from '../../i18n/I18nProvider';
import { blockId, SECTION_TITLE_KEYS, usePreviewEditing } from './pageBridge';
import { usePublicTenant, type PublicTenant } from './TenantContext';

type Opening = { serviceId: string; date: ISODate; start: Minutes; sessionId?: string };

/** The first bookable time for a service in the next three weeks. */
function findOpening(tenant: PublicTenant, service: PublicService): Opening | null {
  if (isClass(service)) {
    const s = tenant.sessions(service.id, 21).find((x) => !x.block);
    return s ? { serviceId: service.id, date: s.date, start: s.start, sessionId: s.id } : null;
  }
  const q = { serviceId: service.id, staffId: tenant.business.policies.allowAnyStaff || tenant.solo ? ('any' as const) : (service.staffIds[0] ?? 'any') };
  for (let i = 0; i < 21; i++) {
    const date = addDays(tenant.today, i);
    const s = tenant.slots({ ...q, date })[0];
    if (s) return { serviceId: service.id, date, start: s.start };
  }
  return null;
}

const openingHref = (base: string, o: Opening) =>
  o.sessionId ? `${base}/new?service=${o.serviceId}&session=${o.sessionId}` : `${base}/new?service=${o.serviceId}&date=${o.date}&time=${o.start}`;

function useNextOpening(): Opening | null {
  const tenant = usePublicTenant();
  return useMemo(() => {
    const service = tenant.business.services[0];
    return service ? findOpening(tenant, service) : null;
  }, [tenant]);
}

/** "Today", "Tomorrow" or the date, the way the hero already says it. */
function useOpeningDay() {
  const { fmt } = useI18n();
  return (o: Opening) => fmt.relativeDay(o.date) ?? fmt.date(o.date, 'medium');
}

export default function TenantHome() {
  const { business } = usePublicTenant();
  return (
    <>
      {business.page.sections
        .filter((s) => s.visible)
        .map((s) => (
          <Block key={s.id} section={s} />
        ))}
    </>
  );
}

/** One section; inside the editor's preview it's also a click target with a label. */
function Block({ section: s }: { section: PageSection }) {
  const { t } = useI18n();
  const editing = usePreviewEditing();
  const body = <SectionBody section={s} editing={!!editing} />;
  if (!editing) return body;
  return (
    <div id={blockId(s.id)} className="pg-block" data-kind={s.kind} data-selected={editing.focus === s.id || undefined} onClick={() => editing.select(s.id)}>
      {body}
      <span className="pg-block__tag" aria-hidden>
        {t(`pageEditor.kinds.${s.kind}`)}
      </span>
    </div>
  );
}

function SectionBody({ section: s, editing }: { section: PageSection; editing: boolean }) {
  const { tx } = useI18n();
  const { business } = usePublicTenant();
  const empty = (kind: 'gallery' | 'about' | 'reviews' | 'faq') => (editing ? <EmptySection section={s} kind={kind} /> : null);
  switch (s.kind) {
    case 'hero':
      return <Hero section={s} />;
    case 'services':
      return <Services section={s} />;
    case 'gallery':
      return s.images?.length ? <Gallery section={s} editing={editing} /> : empty('gallery');
    case 'about':
      return tx(s.body).trim() || s.imageUrl ? <About section={s} /> : empty('about');
    case 'team':
      return business.staff.length ? <Team section={s} /> : null;
    case 'reviews':
    case 'faq': {
      const items = (s.items ?? []).filter((x) => tx(x.title).trim() || tx(x.body).trim());
      if (!items.length) return empty(s.kind);
      return s.kind === 'reviews' ? <Reviews section={s} items={items} /> : <Faq section={s} items={items} />;
    }
    case 'info':
      return <Info section={s} />;
  }
}

function useHeading(s: PageSection) {
  const { t, tx } = useI18n();
  return s.kind === 'hero' ? '' : tx(s.title).trim() || t(SECTION_TITLE_KEYS[s.kind]);
}

function Section({ section: s, className = '', children, head = true }: { section: PageSection; className?: string; children: ReactNode; head?: boolean }) {
  const heading = useHeading(s);
  const titleId = `${s.kind}-title`;
  return (
    <section className={`section container tenant-section ${className}`} id={s.kind} aria-labelledby={titleId}>
      {head && (
        <h2 id={titleId} className="display display-sm tenant-section__title">
          {heading}
        </h2>
      )}
      {children}
    </section>
  );
}

function EmptySection({ section, kind }: { section: PageSection; kind: 'gallery' | 'about' | 'reviews' | 'faq' }) {
  const { t } = useI18n();
  return (
    <Section section={section} className="pg-empty">
      <p className="pg-empty__note">{t(`pageEditor.empty.${kind}`)}</p>
    </Section>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────

function Hero({ section: s }: { section: PageSection }) {
  const { t, tx, fmt } = useI18n();
  const { business, base } = usePublicTenant();
  const next = useNextOpening();
  const day = useOpeningDay();
  const name = tx(business.name);
  const layout = (s.layout ?? 'centered') as HeroLayout;
  const cover = business.branding.coverUrl;
  const address = tx(business.address);
  const state = openState(business.hours, business.specialDays, business.timezone);
  const status = state.open
    ? t('tenant.hero.openUntil', { time: fmt.time(state.until) })
    : state.next && t('tenant.hero.opensAt', { day: fmt.relativeDay(state.next.date) ?? fmt.weekday(weekdayOf(state.next.date)), time: fmt.time(state.next.start) });

  const intro = (
    <div className="pg-hero__intro">
      {!business.branding.hideLogo && <BusinessMark name={name} logoUrl={business.branding.logoUrl} className="biz-mark--xl" />}
      <h1 id="tenant-title" className="display pg-hero__title">
        {name}
      </h1>
      {tx(business.tagline) && <p className="pg-hero__tagline">{tx(business.tagline)}</p>}
      {tx(business.description) && <p className="pg-hero__desc">{tx(business.description)}</p>}
      <div className="pg-hero__actions">
        <Link to={`${base}/new`} className="btn btn--primary btn--lg">
          {t('common.book')}
        </Link>
        {next ? (
          <Link to={openingHref(base, next)} className="hero__opening">
            <span className="hero__opening-dot" aria-hidden />
            <span className="hero__opening-label">{t('tenant.hero.next')}</span>
            <span>
              {day(next)} · <span className="tabular">{fmt.time(next.start)}</span>
            </span>
          </Link>
        ) : (
          <span className="pg-hero__none">{t('tenant.hero.none')}</span>
        )}
      </div>
      {(status || address) && (
        <ul className="pg-hero__facts">
          {status && (
            <li>
              <span className="pg-hero__status" data-open={state.open || undefined} aria-hidden />
              {status}
            </li>
          )}
          {address && (
            <li>
              <PinIcon size={14} /> {address}
            </li>
          )}
        </ul>
      )}
    </div>
  );

  if (layout === 'cover') {
    return (
      <section className="pg-hero pg-hero--cover" data-img={!!cover || undefined} aria-labelledby="tenant-title">
        {cover && <img className="pg-hero__bg" src={cover} alt="" />}
        <div className="pg-hero__inner container">{intro}</div>
      </section>
    );
  }
  if (layout === 'split') {
    return (
      <section className="pg-hero pg-hero--split container" aria-labelledby="tenant-title">
        {intro}
        <div className="pg-hero__media">
          {cover ? (
            <img src={cover} alt="" />
          ) : (
            <div className="pg-hero__placeholder">
              {!business.branding.hideLogo && <BusinessMark name={name} logoUrl={business.branding.logoUrl} className="biz-mark--xl" />}
            </div>
          )}
        </div>
      </section>
    );
  }
  return (
    <section className="pg-hero pg-hero--centered container" aria-labelledby="tenant-title">
      {intro}
      {cover && <img className="pg-hero__wide" src={cover} alt="" />}
    </section>
  );
}

// ── Horizontal scroller ──────────────────────────────────────────────

/** A swipeable row of `<li>`s, with back/forward buttons for mouse users. `count` re-measures when items change. */
function Scroller({ className, count, children }: { className: string; count: number; children: ReactNode }) {
  const { t, dir } = useI18n();
  const ref = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const x = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    setEdge({ start: x < 4, end: x > max - 4 });
  };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);
  const go = (step: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: step * el.clientWidth * 0.8 * (dir === 'rtl' ? -1 : 1), behavior: still ? 'auto' : 'smooth' });
  };
  return (
    <div className={`scroller ${className}`}>
      <ul ref={ref} className="scroller__track" onScroll={measure}>
        {children}
      </ul>
      <button type="button" className="scroller__btn scroller__btn--back" disabled={edge.start} onClick={() => go(-1)} aria-label={t('tenant.scroll.back')}>
        <ChevronLeft size={18} />
      </button>
      <button type="button" className="scroller__btn scroller__btn--forward" disabled={edge.end} onClick={() => go(1)} aria-label={t('tenant.scroll.forward')}>
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

// ── Services ─────────────────────────────────────────────────────────

function useServiceInfo(service: PublicService) {
  const { t, tx, fmt } = useI18n();
  const { business, base } = usePublicTenant();
  const names = service.staffIds.map((id) => tx(business.staff.find((s) => s.id === id)?.name).split(' ')[0]);
  const r = termsRange(service);
  return {
    name: tx(service.name),
    desc: tx(service.description),
    who: isClass(service)
      ? t('booking.classes.groupLabel')
      : business.staff.length > 1 && names.length < business.staff.length
        ? t('tenant.services.with', { names: fmt.list(names) })
        : '',
    duration: fmt.durationRange(r.duration),
    price: fmt.moneyRange(r.price),
    href: `${base}/new?service=${service.id}`,
  };
}

function ServiceRow({ service }: { service: PublicService }) {
  const { t } = useI18n();
  const x = useServiceInfo(service);
  return (
    <li className="svc-row" data-img={service.imageUrl ? '' : undefined}>
      {service.imageUrl && <img className="svc-row__img" src={service.imageUrl} alt="" loading="lazy" />}
      <h3 className="svc-row__name">{x.name}</h3>
      <span className="svc-row__meta">
        <ClockIcon size={13} /> {x.duration}
      </span>
      <span className="svc-row__price tabular">{x.price}</span>
      <p className="svc-row__desc">{[x.desc, x.who].filter(Boolean).join(' · ')}</p>
      <Link to={x.href} className="btn btn--ghost btn--sm svc-row__action">
        {t('tenant.services.book')}
      </Link>
    </li>
  );
}

/**
 * The whole card books the service (its name link stretches over it); the
 * next free time sits on top as its own link, straight to that slot.
 */
function ServiceCard({ service, opening }: { service: PublicService; opening?: Opening | null }) {
  const { t, tx, fmt } = useI18n();
  const { business, base } = usePublicTenant();
  const day = useOpeningDay();
  const x = useServiceInfo(service);
  const people = business.staff.length > 1 ? business.staff.filter((s) => service.staffIds.includes(s.id)) : [];
  return (
    <li className="svc-card">
      <span className="svc-card__media">
        {service.imageUrl ? <img src={service.imageUrl} alt="" loading="lazy" /> : <span className="svc-card__initial">{x.name.slice(0, 1)}</span>}
      </span>
      <div className="svc-card__body">
        <h3 className="svc-card__name">
          <Link to={x.href} className="svc-card__link">
            {x.name}
          </Link>
        </h3>
        {x.desc && <p className="svc-card__desc">{x.desc}</p>}
        <p className="svc-card__foot">
          <span className="svc-card__meta">
            <ClockIcon size={13} /> {x.duration}
          </span>
          <span className="svc-card__price tabular">{x.price}</span>
        </p>
        {people.length > 0 && (
          <p className="svc-card__people">
            <span className="svc-card__faces" aria-hidden>
              {people.slice(0, 4).map((p) => (
                <StaffAvatar key={p.id} staff={p} size="sm" />
              ))}
            </span>
            {t('tenant.services.with', { names: fmt.list(people.map((p) => tx(p.name).split(' ')[0])) })}
          </p>
        )}
        {opening ? (
          <Link to={openingHref(base, opening)} className="svc-card__next" aria-label={t('tenant.services.nextLabel', { service: x.name, day: day(opening), time: fmt.time(opening.start) })}>
            <span className="hero__opening-dot" aria-hidden />
            <span>{t('tenant.services.next', { day: day(opening), time: fmt.time(opening.start) })}</span>
          </Link>
        ) : (
          <span className="svc-card__cta" aria-hidden>
            {t('tenant.services.book')}
          </span>
        )}
      </div>
    </li>
  );
}

function ServiceTile({ service }: { service: PublicService }) {
  const x = useServiceInfo(service);
  return (
    <li className="svc-tile" data-img={service.imageUrl ? '' : undefined}>
      <Link to={x.href} className="svc-tile__link">
        {service.imageUrl && <img className="svc-tile__img" src={service.imageUrl} alt="" loading="lazy" />}
        <span className="svc-tile__text">
          <h3 className="svc-tile__name">{x.name}</h3>
          <span className="svc-tile__meta">
            {x.duration} · <span className="tabular">{x.price}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

function ServiceMenuItem({ service }: { service: PublicService }) {
  const x = useServiceInfo(service);
  return (
    <li>
      <Link to={x.href} className="svc-menu__link">
        <span className="svc-menu__line">
          <h3 className="svc-menu__name">{x.name}</h3>
          <span className="svc-menu__dots" aria-hidden />
          <span className="svc-menu__price tabular">{x.price}</span>
        </span>
        <span className="svc-menu__sub">{[x.duration, x.desc, x.who].filter(Boolean).join(' · ')}</span>
      </Link>
    </li>
  );
}

function ServiceFeature({ service }: { service: PublicService }) {
  const { t } = useI18n();
  const x = useServiceInfo(service);
  return (
    <li className="svc-feature">
      <Link to={x.href} className="svc-feature__media" tabIndex={-1} aria-hidden>
        {service.imageUrl ? <img src={service.imageUrl} alt="" loading="lazy" /> : <span className="svc-card__initial">{x.name.slice(0, 1)}</span>}
      </Link>
      <div className="svc-feature__body">
        <h3 className="display display-sm svc-feature__name">{x.name}</h3>
        {(x.desc || x.who) && <p className="svc-feature__desc">{[x.desc, x.who].filter(Boolean).join(' · ')}</p>}
        <p className="svc-feature__meta">
          <span>
            <ClockIcon size={14} /> {x.duration}
          </span>
          <span className="svc-feature__price tabular">{x.price}</span>
        </p>
        <Link to={x.href} className="btn btn--primary">
          {t('tenant.services.book')}
        </Link>
      </div>
    </li>
  );
}

function ServiceGroup({ layout, items, openings }: { layout: ServicesLayout; items: PublicService[]; openings: Map<string, Opening | null> }) {
  if (layout === 'carousel' || layout === 'cards') {
    const cards = items.map((x) => <ServiceCard key={x.id} service={x} opening={openings.get(x.id)} />);
    return layout === 'carousel' ? (
      <Scroller className="svc-scroll" count={items.length}>
        {cards}
      </Scroller>
    ) : (
      <ul className="svc-grid svc-grid--cards" data-count={Math.min(items.length, 4)}>
        {cards}
      </ul>
    );
  }
  const [cls, Item] =
    layout === 'tiles'
        ? ['svc-grid svc-grid--tiles', ServiceTile]
        : layout === 'menu'
          ? ['svc-menu', ServiceMenuItem]
          : layout === 'feature'
            ? ['svc-features', ServiceFeature]
            : ['svc-list', ServiceRow];
  return (
    <ul className={cls}>
      {items.map((x) => (
        <Item key={x.id} service={x} />
      ))}
    </ul>
  );
}

/** Layouts that show services side by side: categories become filters over one grid instead of headings. */
const FILTERED: ServicesLayout[] = ['cards', 'tiles', 'feature', 'carousel'];

function Services({ section: s }: { section: PageSection }) {
  const { t, tx, fmt } = useI18n();
  const tenant = usePublicTenant();
  const { business } = tenant;
  const layout = (s.layout ?? 'list') as ServicesLayout;
  const [only, setOnly] = useState<string | null>(null);
  const groups = useMemo(() => {
    const cats = business.categories.map((c) => ({ id: c.id, name: tx(c.name), items: business.services.filter((x) => x.categoryId === c.id) }));
    const rest = business.services.filter((x) => !x.categoryId || !business.categories.some((c) => c.id === x.categoryId));
    return [...cats, { id: '_', name: t('tenant.services.other'), items: rest }].filter((g) => g.items.length);
  }, [business, tx, t]);
  const ids = business.services.map((x) => x.id).join();
  // Keyed on what changes availability, not on the tenant object, which the demo film rebuilds every frame.
  const openings = useMemo(
    () => new Map(layout === 'cards' || layout === 'carousel' ? business.services.map((x) => [x.id, findOpening(tenant, x)] as const) : []),
    [tenant.slug, tenant.today, ids, layout, business.policies.allowAnyStaff],
  );
  const filters = FILTERED.includes(layout) && groups.length > 1;
  const picked = filters ? groups.find((g) => g.id === only) : undefined;
  return (
    <Section section={s}>
      {groups.length === 0 && <p className="muted">{t('tenant.services.empty')}</p>}
      {filters ? (
        <>
          <div className="svc-filter" role="group" aria-label={t('tenant.services.filter')}>
            <button type="button" className="chip" aria-pressed={!picked} onClick={() => setOnly(null)}>
              {t('tenant.services.all')}
            </button>
            {groups.map((g) => (
              <button key={g.id} type="button" className="chip" aria-pressed={picked?.id === g.id} onClick={() => setOnly(g.id)}>
                {g.name}
              </button>
            ))}
          </div>
          <div className="svc-cat">
            <ServiceGroup layout={layout} items={picked ? picked.items : groups.flatMap((g) => g.items)} openings={openings} />
          </div>
        </>
      ) : (
        groups.map((g) => (
          <div key={g.id} className="svc-cat">
            {g.id !== '_' && groups.length > 1 && <h3 className="svc-cat__title">{g.name}</h3>}
            <ServiceGroup layout={layout} items={g.items} openings={openings} />
          </div>
        ))
      )}
      {business.addOns.length > 0 && (
        <div className="svc-cat">
          <h3 className="svc-cat__title">{t('tenant.services.addOns')}</h3>
          <ul className="addons">
            {business.addOns.map((a) => (
              <li key={a.id} className="addon">
                <span>{tx(a.name)}</span>
                <span className="muted tabular">
                  +{fmt.duration(a.duration)} · {fmt.money(a.price)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

// ── Gallery ──────────────────────────────────────────────────────────

/** Columns, plus which photos grow, so every row is full whatever the count. */
function galleryPlan(n: number) {
  const cols = n <= 4 ? n : n % 4 === 0 ? 4 : n % 3 === 0 ? 3 : 4;
  const gap = cols === 4 && n > 4 ? (4 - (n % 4)) % 4 : 0;
  const span = (i: number) => (gap === 3 && i === 0 ? 'feature' : (gap === 1 && i === 0) || (gap === 2 && i < 2) ? 'wide' : undefined);
  return { cols, span };
}

type Photo = (src: string, i: number, copy?: boolean) => ReactNode;

function Gallery({ section: s, editing }: { section: PageSection; editing: boolean }) {
  const { t, dir } = useI18n();
  const images = s.images ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const layout = (s.layout ?? 'grid') as GalleryLayout;
  const photo: Photo = (src, i, copy) => (
    <button
      type="button"
      className="pg-gallery__item"
      tabIndex={copy ? -1 : undefined}
      onClick={() => !editing && setOpen(i)}
      aria-label={t('tenant.gallery.open', { n: i + 1, total: images.length })}
    >
      <img src={src} alt="" loading="lazy" />
    </button>
  );
  return (
    <Section section={s}>
      {layout === 'marquee' ? (
        <GalleryMarquee images={images} flow={galleryFlow(s, dir)} photo={photo} />
      ) : layout === 'strip' ? (
        <GalleryStrip images={images} photo={photo} />
      ) : layout === 'masonry' ? (
        <ul className="pg-masonry" style={{ '--cols': Math.min(3, images.length) } as React.CSSProperties}>
          {images.map((src, i) => (
            <li key={`${i}-${src.slice(-24)}`}>{photo(src, i)}</li>
          ))}
        </ul>
      ) : (
        <GalleryGrid images={images} photo={photo} />
      )}
      {open !== null && <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </Section>
  );
}

function GalleryGrid({ images, photo }: { images: string[]; photo: Photo }) {
  const plan = galleryPlan(images.length);
  return (
    <ul className="pg-gallery" data-cols={plan.cols} data-odd={images.length % 2 ? '' : undefined} style={{ '--cols': plan.cols } as React.CSSProperties}>
      {images.map((src, i) => (
        <li key={`${i}-${src.slice(-24)}`} data-span={plan.span(i)}>
          {photo(src, i)}
        </li>
      ))}
    </ul>
  );
}

function GalleryStrip({ images, photo }: { images: string[]; photo: Photo }) {
  return (
    <Scroller className="pg-strip" count={images.length}>
      {images.map((src, i) => (
        <li key={`${i}-${src.slice(-24)}`}>{photo(src, i)}</li>
      ))}
    </Scroller>
  );
}

/** The run is repeated until it is long enough to fill wide screens, then doubled so the loop is seamless. */
function GalleryMarquee({ images, flow, photo }: { images: string[]; flow: GalleryFlow; photo: Photo }) {
  const run = Array.from({ length: Math.ceil(8 / images.length) }, () => images).flat();
  return (
    <div className="pg-marquee" data-flow={flow} style={{ '--dur': `${run.length * 4.5}s` } as React.CSSProperties}>
      <ul className="pg-marquee__track">
        {[0, 1].flatMap((half) =>
          run.map((src, j) => {
            const copy = half > 0 || j >= images.length;
            return (
              <li key={`${half}-${j}`} aria-hidden={copy || undefined} data-copy={copy || undefined}>
                {photo(src, j % images.length, copy)}
              </li>
            );
          }),
        )}
      </ul>
    </div>
  );
}

function Lightbox({ images, index, onIndex, onClose }: { images: string[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const { t, dir } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const go = (step: number) => onIndex((index + step + images.length) % images.length);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="lightbox"
      aria-label={t('tenant.gallery.open', { n: index + 1, total: images.length })}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(dir === 'rtl' ? -1 : 1);
        if (e.key === 'ArrowLeft') go(dir === 'rtl' ? 1 : -1);
      }}
    >
      <img key={index} className="lightbox__img" src={images[index]} alt="" />
      <button type="button" className="lightbox__btn lightbox__close" onClick={onClose} aria-label={t('tenant.gallery.close')}>
        <CloseIcon size={18} />
      </button>
      {images.length > 1 && (
        <>
          <button type="button" className="lightbox__btn lightbox__prev" onClick={() => go(-1)} aria-label={t('tenant.gallery.prev')}>
            <ChevronLeft size={20} />
          </button>
          <button type="button" className="lightbox__btn lightbox__next" onClick={() => go(1)} aria-label={t('tenant.gallery.next')}>
            <ChevronRight size={20} />
          </button>
          <p className="lightbox__count tabular">
            {index + 1} / {images.length}
          </p>
        </>
      )}
    </dialog>
  );
}

// ── About ────────────────────────────────────────────────────────────

const paragraphs = (text: string) =>
  text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

function About({ section: s }: { section: PageSection }) {
  const { tx } = useI18n();
  const heading = useHeading(s);
  return (
    <Section section={s} className="pg-about" head={false}>
      <div className="pg-about__grid" data-img={s.imageUrl ? '' : undefined}>
        {s.imageUrl && <img className="pg-about__img" src={s.imageUrl} alt="" loading="lazy" />}
        <div className="pg-about__text">
          <h2 id="about-title" className="display display-sm tenant-section__title">
            {heading}
          </h2>
          {paragraphs(tx(s.body)).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── Team ─────────────────────────────────────────────────────────────

function Team({ section: s }: { section: PageSection }) {
  const { t, tx, fmt } = useI18n();
  const { business, base } = usePublicTenant();
  const photos = business.staff.some((x) => x.avatarUrl);
  return (
    <Section section={s}>
      <div className="team-grid" data-photos={photos || undefined}>
        {business.staff.map((x) => {
          const name = tx(x.name);
          return (
            <article key={x.id} className="team-card">
              {photos ? (
                <div className="team-card__photo" style={{ '--tone': x.color } as React.CSSProperties}>
                  {x.avatarUrl ? <img src={x.avatarUrl} alt="" loading="lazy" /> : <StaffAvatar staff={{ ...x, avatarUrl: undefined }} size="xl" />}
                </div>
              ) : (
                <StaffAvatar staff={x} size="xl" />
              )}
              <div>
                <h3 className="team-card__name">{name}</h3>
                {tx(x.role) && <p className="team-card__role">{tx(x.role)}</p>}
              </div>
              {tx(x.bio) && <p className="team-card__bio">{tx(x.bio)}</p>}
              <div className="team-card__meta">
                <span className="muted">{t('tenant.team.works')}</span>
                <div className="team-card__days">
                  {WEEKDAYS.map((wd) => (
                    <span key={wd} className="team-card__day" data-on={x.workingDays.includes(wd)} title={fmt.weekday(wd)}>
                      {fmt.weekday(wd, 'narrow')}
                    </span>
                  ))}
                </div>
              </div>
              <Link to={`${base}/new?staff=${x.id}`} className="link-arrow">
                {t('tenant.team.book', { name: name.split(' ')[0] })}
              </Link>
            </article>
          );
        })}
      </div>
    </Section>
  );
}

// ── Reviews & questions ──────────────────────────────────────────────

function Reviews({ section: s, items }: { section: PageSection; items: NonNullable<PageSection['items']> }) {
  const { tx } = useI18n();
  return (
    <Section section={s}>
      <ul className="pg-reviews">
        {items.map((x) => (
          <li key={x.id} className="pg-review">
            <svg className="pg-review__mark" viewBox="0 0 32 24" aria-hidden>
              <path d="M0 24V14C0 6 4.5 1.3 12 0l1.4 3.4C9 4.8 7 7.6 6.8 11H12v13zm18 0V14c0-8 4.5-12.7 12-14l1.4 3.4C27 4.8 25 7.6 24.8 11H30v13z" />
            </svg>
            <blockquote className="pg-review__text">
              {paragraphs(tx(x.body)).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </blockquote>
            {tx(x.title) && <p className="pg-review__who">{tx(x.title)}</p>}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Faq({ section: s, items }: { section: PageSection; items: NonNullable<PageSection['items']> }) {
  const { tx } = useI18n();
  const heading = useHeading(s);
  return (
    <Section section={s} className="pg-faq" head={false}>
      <div className="pg-faq__grid">
        <h2 id="faq-title" className="display display-sm tenant-section__title">
          {heading}
        </h2>
        <div className="pg-faq__list">
          {items.map((x) => (
            <details key={x.id} className="pg-faq__item">
              <summary>
                <span>{tx(x.title)}</span>
                <PlusIcon size={16} />
              </summary>
              <div className="pg-faq__answer">
                {paragraphs(tx(x.body)).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ── Info ─────────────────────────────────────────────────────────────

export function OpeningHours({ compact }: { compact?: boolean }) {
  const { t, fmt } = useI18n();
  const { business, today } = usePublicTenant();
  const { hours } = business;
  return (
    <dl className={`hours${compact ? ' hours--compact' : ''}`}>
      {WEEKDAYS.map((wd) => (
        <div key={wd} className="hours__row" data-today={wd === weekdayOf(today) || undefined}>
          <dt>{fmt.weekday(wd, compact ? 'short' : 'long')}</dt>
          <dd className="tabular">{hours[wd].ranges.length ? hours[wd].ranges.map((r) => fmt.timeRange(r.start, r.end)).join(', ') : t('common.closed')}</dd>
        </div>
      ))}
    </dl>
  );
}

function Info({ section: s }: { section: PageSection }) {
  const { t, tx, fmt } = useI18n();
  const { business } = usePublicTenant();
  const p = business.policies;
  const address = tx(business.address);
  const phoneDigits = business.phone.replace(/\D/g, '');
  const wa = business.social.whatsapp?.replace(/\D/g, '');
  const hoursText = (h: number) => t('units.hoursLong', { count: h });
  const notice = p.leadTimeMinutes >= 1440 ? t('units.daysLong', { count: Math.round(p.leadTimeMinutes / 1440) }) : p.leadTimeMinutes >= 60 ? hoursText(Math.round(p.leadTimeMinutes / 60)) : fmt.duration(p.leadTimeMinutes);

  return (
    <Section section={s}>
      <div className="tenant-info">
        <div>
          <h3 className="svc-cat__title">{t('tenant.info.hours')}</h3>
          <OpeningHours />
          {business.specialDays.length > 0 && (
            <>
              <h3 className="svc-cat__title tenant-info__sub">{t('tenant.info.special')}</h3>
              <dl className="hours">
                {business.specialDays.map((d) => (
                  <div key={d.date} className="hours__row">
                    <dt>
                      {fmt.date(d.date, 'medium')}
                      {d.label && <span className="muted"> · {d.label}</span>}
                    </dt>
                    <dd className="tabular">{d.closed ? t('common.closed') : d.ranges.map((r) => fmt.timeRange(r.start, r.end)).join(', ')}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
        <div className="tenant-info__col">
          {address && (
            <div>
              <h3 className="svc-cat__title">{t('tenant.info.location')}</h3>
              <p className="tenant-info__line">
                <PinIcon /> {address}
              </p>
              <a className="link-arrow" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.address.en || address)}`} target="_blank" rel="noreferrer">
                {t('tenant.info.directions')}
              </a>
            </div>
          )}
          <div>
            <h3 className="svc-cat__title">{t('tenant.info.contact')}</h3>
            <div className="tenant-info__actions">
              {phoneDigits && (
                <a className="btn btn--ghost btn--sm" href={`tel:${phoneDigits}`}>
                  <PhoneIcon /> <span className="ltr">{business.phone}</span>
                </a>
              )}
              {wa && (
                <a className="btn btn--ghost btn--sm" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">
                  <MessageIcon /> {t('common.whatsapp')}
                </a>
              )}
              {business.email && (
                <a className="btn btn--ghost btn--sm" href={`mailto:${business.email}`}>
                  {t('common.email')}
                </a>
              )}
              {business.social.instagram && (
                <a className="btn btn--ghost btn--sm" href={`https://instagram.com/${business.social.instagram}`} target="_blank" rel="noreferrer">
                  Instagram
                </a>
              )}
            </div>
          </div>
          <div>
            <h3 className="svc-cat__title">{t('tenant.info.policies')}</h3>
            <ul className="tenant-policies">
              <li>{t('tenant.info.noticePolicy', { time: notice })}</li>
              <li>{p.customerCanCancel ? t('tenant.info.cancelPolicy', { hours: hoursText(p.cancelWindowHours) }) : t('tenant.info.noOnlineCancel')}</li>
              {p.customerCanReschedule && <li>{t('tenant.info.reschedulePolicy', { hours: hoursText(p.rescheduleWindowHours) })}</li>}
              {p.confirmationMode === 'manual' && <li>{t('tenant.info.manualPolicy')}</li>}
              <li>{t('tenant.info.payment')}</li>
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}
