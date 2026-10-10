import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ACCENT_KEYS, ACCENTS, accentColor, accentStyle, loadThemeFont } from '../../components/ui/accents';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BusinessMark,
  CheckIcon,
  ChevronLeft,
  ChevronRight,
  ClockIcon,
  CloseIcon,
  DesktopIcon,
  ExternalIcon,
  EyeIcon,
  EyeOffIcon,
  GridIcon,
  GripIcon,
  HomeIcon,
  ImageIcon,
  LockIcon,
  MessageIcon,
  MobileIcon,
  PlusIcon,
  QuestionIcon,
  TagIcon,
  TrashIcon,
  UserIcon,
  UsersIcon,
} from '../../components/ui/Icons';
import { Segmented, StaffAvatar, Switch } from '../../components/ui/bits';
import { useToast } from '../../components/ui/Toast';
import { ApiError, type PageSaveInput } from '../../data';
import { HEX, readableAccent } from '../../domain/color';
import { GALLERY_MAX, galleryFlow, missingKinds, moveSection, newSection, pageOf, THEMES } from '../../domain/page';
import type { Branding, GalleryFlow, GalleryLayout, HeroLayout, PageItem, PageSection, SectionKind, ServicesLayout, TenantData } from '../../domain/types';
import type { Locale, LText } from '../../i18n/config';
import { useI18n } from '../../i18n/I18nProvider';
import { pickImages, prepareImage } from '../../lib/image';
import { useMedia } from '../../lib/useMedia';
import { PREVIEW_PARAM, SECTION_TITLE_KEYS, type FromPreview, type ToPreview } from '../../pages/booking/pageBridge';
import { useWorkspace } from '../workspace';
import './page-editor.css';

type Update = (fn: (d: PageSaveInput) => PageSaveInput) => void;
type PickPhotos = (key: string, opts: { aspect?: number; max: number }, multiple?: boolean) => Promise<string[]>;

const draftOf = (t: TenantData): PageSaveInput => ({
  page: pageOf(t.business.page, t.staff.filter((s) => s.active && s.onlineBookable).length),
  branding: t.business.branding,
  tagline: t.business.tagline,
  description: t.business.description,
  servicePhotos: {},
  staffPhotos: {},
});

const setL = (text: LText | undefined, locale: Locale, value: string) => ({ en: '', ...text, [locale]: value }) as LText;

const KIND_ICONS: Record<SectionKind, (p: { size?: number }) => JSX.Element> = {
  hero: HomeIcon,
  services: TagIcon,
  gallery: GridIcon,
  about: UserIcon,
  team: UsersIcon,
  reviews: MessageIcon,
  faq: QuestionIcon,
  info: ClockIcon,
};

/** Kinds that hold their own content and can be removed; the rest can only be hidden. */
const REMOVABLE: SectionKind[] = ['gallery', 'about', 'reviews', 'faq'];

export default function PageEditorRoute() {
  const { can } = useWorkspace();
  return can('business.settings') ? <PageEditor /> : <Navigate to="/app" replace />;
}

function PageEditor() {
  const { tenant, api } = useWorkspace();
  const { t, tx } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const narrow = useMedia('(max-width: 899px)');
  const [draft, setDraft] = useState(() => draftOf(tenant));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [searchParams] = useSearchParams();
  const [initial] = useState(() => {
    const q = searchParams.get('section');
    return (q && draft.page.sections.find((s) => s.id === q || s.kind === q)?.id) || null;
  });
  const [tab, setTab] = useState<'design' | 'sections'>(initial ? 'sections' : 'design');
  const [selected, setSelected] = useState<string | null>(initial);
  const [adding, setAdding] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [confirm, setConfirm] = useState<{ title: string; label: string; danger?: boolean; run: () => void } | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const latest = useRef({ draft, selected });
  latest.current = { draft, selected };
  const slug = tenant.business.slug;

  const update: Update = useCallback((fn) => {
    setDraft(fn);
    setDirty(true);
  }, []);

  const post = useCallback((m: ToPreview) => {
    if (ready.current) frame.current?.contentWindow?.postMessage(m, window.location.origin);
  }, []);

  useEffect(() => {
    post({ type: 'page:draft', draft });
  }, [draft, post]);

  useEffect(() => {
    const onMessage = (e: MessageEvent<FromPreview>) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === 'page:ready') {
        ready.current = true;
        post({ type: 'page:draft', draft: latest.current.draft });
        post({ type: 'page:focus', id: latest.current.selected });
      }
      if (e.data?.type === 'page:select') {
        setSelected(e.data.id);
        setAdding(false);
        setTab('sections');
        setView('edit');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  useEffect(() => {
    THEMES.forEach(loadThemeFont);
  }, []);

  useEffect(() => {
    document.title = `${t('pageEditor.title')} · ${tx(tenant.business.name)}`;
  }, [t, tx, tenant.business.name]);

  const choose = (id: string | null) => {
    setSelected(id);
    setAdding(false);
    post({ type: 'page:focus', id, scroll: !!id });
  };

  const pick: PickPhotos = async (key, opts, multiple = false) => {
    const files = await pickImages(multiple);
    if (!files.length) return [];
    setWorking(key);
    try {
      return await Promise.all(files.map((f) => prepareImage(f, opts)));
    } catch {
      toast(t('pageEditor.imageError'));
      return [];
    } finally {
      setWorking(null);
    }
  };

  const leave = (to: string) => {
    if (!dirty) return navigate(to);
    setConfirm({ title: t('pageEditor.leaveConfirm'), label: t('pageEditor.leave'), danger: true, run: () => navigate(to) });
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.savePage(draft);
      setDirty(false);
      toast(t('pageEditor.savedToast'));
    } catch (e) {
      toast(e instanceof ApiError && e.code === 'too_large' ? t('pageEditor.tooLarge') : t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  };

  const discard = () =>
    setConfirm({
      title: t('pageEditor.discardConfirm'),
      label: t('pageEditor.discard'),
      danger: true,
      run: () => {
        setDraft(draftOf(tenant));
        setDirty(false);
      },
    });

  const sections = draft.page.sections;
  const patch = (id: string, p: Partial<PageSection>) => update((d) => ({ ...d, page: { ...d.page, sections: d.page.sections.map((s) => (s.id === id ? { ...s, ...p } : s)) } }));
  const move = (id: string, to: number) => update((d) => ({ ...d, page: moveSection(d.page, id, to) }));
  const add = (kind: SectionKind) => {
    const s = newSection(kind);
    update((d) => {
      const list = d.page.sections;
      const at = list[list.length - 1]?.kind === 'info' ? list.length - 1 : list.length;
      return { ...d, page: { ...d.page, sections: [...list.slice(0, at), s, ...list.slice(at)] } };
    });
    setTimeout(() => choose(s.id), 0);
  };
  const remove = (id: string) =>
    setConfirm({
      title: t('pageEditor.sections.removeConfirm'),
      label: t('pageEditor.sections.remove'),
      danger: true,
      run: () => {
        update((d) => ({ ...d, page: { ...d.page, sections: d.page.sections.filter((s) => s.id !== id) } }));
        choose(null);
      },
    });

  const section = sections.find((s) => s.id === selected);
  const ctx: PanelCtx = { draft, update, patch, pick, working, leave };

  return (
    <div className="pe" data-view={narrow ? view : undefined}>
      <header className="pe-bar">
        <button type="button" className="pe-bar__back" onClick={() => leave('/app')}>
          <ChevronLeft size={18} />
          <span className="pe-bar__back-label">{t('pageEditor.back')}</span>
        </button>
        <div className="pe-bar__title">
          <h1>{t('pageEditor.title')}</h1>
          <span className="pe-status" data-dirty={dirty || undefined}>
            {dirty ? <span className="pe-status__dot" /> : <CheckIcon size={12} />}
            {dirty ? t('pageEditor.unsaved') : t('pageEditor.saved')}
          </span>
        </div>
        {!narrow && (
          <div className="pe-bar__device">
            <Segmented
              label={t('pageEditor.device.label')}
              value={device}
              onChange={setDevice}
              options={[
                { value: 'desktop', label: <DesktopIcon size={16} /> },
                { value: 'mobile', label: <MobileIcon size={16} /> },
              ]}
            />
          </div>
        )}
        <div className="pe-bar__actions">
          <a className="btn btn--quiet btn--sm pe-bar__view" href={`/book/${slug}`} target="_blank" rel="noreferrer" aria-label={t('pageEditor.view')}>
            <ExternalIcon size={15} />
            <span>{t('pageEditor.view')}</span>
          </a>
          {dirty && (
            <button type="button" className="btn btn--quiet btn--sm pe-bar__discard" onClick={discard}>
              {t('pageEditor.discard')}
            </button>
          )}
          <button type="button" className="btn btn--primary btn--sm" onClick={save} disabled={!dirty || busy}>
            {busy ? t('pageEditor.saving') : t('pageEditor.save')}
          </button>
        </div>
      </header>

      <div className="pe-body">
        <aside className="pe-panel" aria-label={t('pageEditor.title')}>
          {section ? (
            <SectionPanel
              key={section.id}
              ctx={ctx}
              section={section}
              index={sections.indexOf(section)}
              count={sections.length}
              onBack={() => choose(null)}
              onMove={(to) => move(section.id, to)}
              onRemove={() => remove(section.id)}
            />
          ) : adding ? (
            <div className="pe-stack pe-enter">
              <PanelHead title={t('pageEditor.sections.addTitle')} onBack={() => setAdding(false)} />
              <div className="pe-kinds">
                {missingKinds(draft.page).map((k) => {
                  const Icon = KIND_ICONS[k];
                  return (
                    <button key={k} type="button" className="pe-kind" onClick={() => add(k)}>
                      <span className="pe-kind__icon">
                        <Icon size={18} />
                      </span>
                      <span className="pe-kind__text">
                        <strong>{t(`pageEditor.kinds.${k}`)}</strong>
                        <span>{t(`pageEditor.kindDesc.${k}`)}</span>
                      </span>
                      <PlusIcon size={16} />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="pe-tabs">
                <Segmented
                  label={t('pageEditor.title')}
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: 'design', label: t('pageEditor.tabs.design') },
                    { value: 'sections', label: t('pageEditor.tabs.sections') },
                  ]}
                />
              </div>
              {tab === 'design' ? (
                <DesignPanel ctx={ctx} />
              ) : (
                <SectionsList
                  sections={sections}
                  canAdd={missingKinds(draft.page).length > 0}
                  onOpen={choose}
                  onToggle={(s) => patch(s.id, { visible: !s.visible })}
                  onMove={move}
                  onAdd={() => setAdding(true)}
                />
              )}
            </>
          )}
        </aside>

        <div className="pe-canvas" data-device={narrow ? 'full' : device}>
          <div className="pe-frame">
            <iframe ref={frame} key={slug} src={`/book/${slug}?${PREVIEW_PARAM}`} title={t('pageEditor.showPreview')} />
          </div>
        </div>
      </div>

      {narrow && (
        <button type="button" className="pe-fab" onClick={() => setView((v) => (v === 'edit' ? 'preview' : 'edit'))}>
          {view === 'edit' ? <EyeIcon size={16} /> : <GripIcon size={16} />}
          {view === 'edit' ? t('pageEditor.showPreview') : t('pageEditor.showEditor')}
        </button>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title ?? ''}
        confirmLabel={confirm?.label ?? ''}
        cancelLabel={t('common.cancel')}
        danger={confirm?.danger}
        onConfirm={() => {
          confirm?.run();
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

interface PanelCtx {
  draft: PageSaveInput;
  update: Update;
  patch: (id: string, p: Partial<PageSection>) => void;
  pick: PickPhotos;
  working: string | null;
  leave: (to: string) => void;
}

// ── Building blocks ──────────────────────────────────────────────────

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="pe-group">
      <h3 className="pe-group__title">{title}</h3>
      {hint && <p className="pe-group__hint">{hint}</p>}
      {children}
    </section>
  );
}

function PanelHead({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <div className="pe-head">
      <button type="button" className="pe-head__back" onClick={onBack}>
        <ChevronLeft size={16} />
        {t('pageEditor.sections.all')}
      </button>
      <h2 className="pe-head__title">{title}</h2>
    </div>
  );
}

function TextField({ id, label, hint, value, placeholder, area, onChange }: { id: string; label: string; hint?: string; value: string; placeholder?: string; area?: boolean; onChange: (v: string) => void }) {
  const props = { id, className: 'field__input', value, placeholder, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {area ? <textarea rows={4} {...props} /> : <input {...props} />}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

function PhotoField({ label, hint, src, busy, onPick, onRemove }: { label: string; hint?: string; src?: string; busy: boolean; onPick: () => void; onRemove: () => void }) {
  const { t } = useI18n();
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <button type="button" className="pe-photo" data-empty={!src || undefined} onClick={onPick} aria-label={src ? t('pageEditor.photo.replace') : t('pageEditor.photo.upload')}>
        {src ? (
          <img src={src} alt="" />
        ) : (
          <span className="pe-photo__empty">
            <ImageIcon size={22} />
            {t('pageEditor.photo.upload')}
          </span>
        )}
        {busy && <span className="pe-photo__busy">{t('pageEditor.photo.working')}</span>}
      </button>
      {src && (
        <div className="pe-photo__actions">
          <button type="button" className="btn btn--tinted btn--sm" onClick={onPick}>
            {t('pageEditor.photo.replace')}
          </button>
          <button type="button" className="btn btn--quiet btn--sm" onClick={onRemove}>
            {t('pageEditor.photo.remove')}
          </button>
        </div>
      )}
      {hint && <p className="field__hint">{hint}</p>}
    </div>
  );
}

/** A small photo slot in a list row: tap to add or replace, with a remove button once set. */
function PhotoRow({ label, src, busy, round, onPick, onRemove, fallback }: { label: string; src?: string; busy: boolean; round?: boolean; onPick: () => void; onRemove: () => void; fallback?: ReactNode }) {
  const { t } = useI18n();
  return (
    <li className="pe-row">
      <button type="button" className="pe-row__thumb" data-round={round || undefined} onClick={onPick} aria-label={`${src ? t('pageEditor.photo.replace') : t('pageEditor.photo.upload')} · ${label}`}>
        {src ? <img src={src} alt="" /> : fallback ?? <ImageIcon size={18} />}
        {busy && <span className="pe-photo__busy" />}
      </button>
      <span className="pe-row__name">{label}</span>
      {src ? (
        <button type="button" className="btn btn--quiet btn--sm" onClick={onRemove}>
          {t('pageEditor.photo.remove')}
        </button>
      ) : (
        <button type="button" className="btn btn--tinted btn--sm" onClick={onPick}>
          {t('pageEditor.photo.upload')}
        </button>
      )}
    </li>
  );
}

type AnyLayout = HeroLayout | ServicesLayout | GalleryLayout;

const SCHEMAS: Record<AnyLayout, ReactNode> = {
  centered: (
    <>
      <rect className="s-txt" x="22" y="5" width="20" height="3.5" rx="1.75" />
      <rect className="s-mute" x="18" y="11" width="28" height="2" rx="1" />
      <rect className="s-acc" x="26" y="16" width="12" height="4" rx="2" />
      <rect className="s-img" x="5" y="24" width="54" height="16" rx="3" />
    </>
  ),
  split: (
    <>
      <rect className="s-txt" x="5" y="12" width="20" height="3.5" rx="1.75" />
      <rect className="s-mute" x="5" y="18" width="24" height="2" rx="1" />
      <rect className="s-acc" x="5" y="24" width="12" height="4" rx="2" />
      <rect className="s-img" x="35" y="5" width="24" height="34" rx="3" />
    </>
  ),
  cover: (
    <>
      <rect className="s-img s-img--strong" x="3" y="3" width="58" height="38" rx="3" />
      <rect className="s-inv" x="8" y="24" width="20" height="3.5" rx="1.75" />
      <rect className="s-inv s-inv--mute" x="8" y="30" width="26" height="2" rx="1" />
      <rect className="s-inv" x="8" y="34.5" width="11" height="3.5" rx="1.75" />
    </>
  ),
  list: (
    <>
      {[6, 18, 30].map((y) => (
        <g key={y}>
          <rect className="s-img" x="5" y={y} width="8" height="8" rx="2" />
          <rect className="s-txt" x="17" y={y + 1.5} width="22" height="2.5" rx="1.25" />
          <rect className="s-mute" x="17" y={y + 5.5} width="14" height="1.6" rx=".8" />
          <rect className="s-acc" x="49" y={y + 2} width="10" height="4" rx="2" />
        </g>
      ))}
    </>
  ),
  cards: (
    <>
      {[4, 23, 42].map((x) => (
        <g key={x}>
          <rect className="s-card" x={x} y="6" width="18" height="32" rx="3" />
          <rect className="s-img" x={x} y="6" width="18" height="13" rx="3" />
          <rect className="s-txt" x={x + 3} y="23" width="11" height="2.4" rx="1.2" />
          <rect className="s-acc" x={x + 3} y="31" width="12" height="3.5" rx="1.75" />
        </g>
      ))}
    </>
  ),
  tiles: (
    <>
      {[5, 33].map((x) => (
        <g key={x}>
          <rect className="s-img s-img--strong" x={x} y="4" width="26" height="36" rx="3" />
          <rect className="s-inv" x={x + 3} y="30" width="14" height="2.6" rx="1.3" />
          <rect className="s-inv s-inv--mute" x={x + 3} y="34.5" width="9" height="1.8" rx=".9" />
        </g>
      ))}
    </>
  ),
  menu: (
    <>
      {[5, 33].map((x) =>
        [7, 18, 29].map((y) => (
          <g key={`${x}-${y}`}>
            <rect className="s-txt" x={x} y={y} width="10" height="2.4" rx="1.2" />
            <path className="s-dots" d={`M${x + 12} ${y + 1.6}h8`} />
            <rect className="s-acc" x={x + 21} y={y} width="5" height="2.4" rx="1.2" />
            <rect className="s-mute" x={x} y={y + 4.5} width="7" height="1.6" rx=".8" />
          </g>
        )),
      )}
    </>
  ),
  feature: (
    <>
      <rect className="s-img s-img--strong" x="5" y="4" width="24" height="16" rx="3" />
      <rect className="s-txt" x="34" y="7" width="18" height="3" rx="1.5" />
      <rect className="s-mute" x="34" y="12.5" width="24" height="1.8" rx=".9" />
      <rect className="s-acc" x="34" y="16" width="10" height="3" rx="1.5" />
      <rect className="s-img s-img--strong" x="35" y="24" width="24" height="16" rx="3" />
      <rect className="s-txt" x="5" y="27" width="18" height="3" rx="1.5" />
      <rect className="s-mute" x="5" y="32.5" width="24" height="1.8" rx=".9" />
      <rect className="s-acc" x="5" y="36" width="10" height="3" rx="1.5" />
    </>
  ),
  carousel: (
    <>
      {[4, 25, 46].map((x, i) => (
        <g key={x} opacity={i === 2 ? 0.55 : 1}>
          <rect className="s-card" x={x} y="6" width="18" height="28" rx="3" />
          <rect className="s-img" x={x} y="6" width="18" height="12" rx="3" />
          <rect className="s-txt" x={x + 3} y="22" width="11" height="2.4" rx="1.2" />
          <rect className="s-acc" x={x + 3} y="28" width="12" height="3" rx="1.5" />
        </g>
      ))}
      <circle className="s-acc" cx="29" cy="39.5" r="1.4" />
      <circle className="s-mute" cx="35" cy="39.5" r="1.4" />
    </>
  ),
  grid: (
    <>
      {[4, 23].map((y) =>
        [6, 24, 42].map((x) => <rect key={`${x}-${y}`} className="s-img s-img--strong" x={x} y={y} width="16" height="16" rx="2.5" />),
      )}
    </>
  ),
  masonry: (
    <>
      <rect className="s-img s-img--strong" x="6" y="4" width="16" height="22" rx="2.5" />
      <rect className="s-img s-img--strong" x="6" y="29" width="16" height="11" rx="2.5" />
      <rect className="s-img s-img--strong" x="24" y="4" width="16" height="12" rx="2.5" />
      <rect className="s-img s-img--strong" x="24" y="19" width="16" height="21" rx="2.5" />
      <rect className="s-img s-img--strong" x="42" y="4" width="16" height="17" rx="2.5" />
      <rect className="s-img s-img--strong" x="42" y="24" width="16" height="16" rx="2.5" />
    </>
  ),
  strip: (
    <>
      <rect className="s-img s-img--strong" x="4" y="8" width="20" height="26" rx="3" />
      <rect className="s-img s-img--strong" x="27" y="8" width="20" height="26" rx="3" />
      <rect className="s-img" x="50" y="8" width="14" height="26" rx="3" />
      <circle className="s-acc" cx="29" cy="39.5" r="1.4" />
      <circle className="s-mute" cx="35" cy="39.5" r="1.4" />
    </>
  ),
  marquee: (
    <>
      <rect className="s-img" x="0" y="11" width="10" height="20" rx="2.5" />
      <rect className="s-img s-img--strong" x="13" y="11" width="18" height="20" rx="2.5" />
      <rect className="s-img s-img--strong" x="34" y="11" width="18" height="20" rx="2.5" />
      <rect className="s-img" x="55" y="11" width="9" height="20" rx="2.5" />
      <path className="s-arrow" d="M40 37.5H24m3.5-3.5L24 37.5l3.5 3.5" />
    </>
  ),
};

function LayoutPicker<T extends AnyLayout>({ value, options, label, onChange }: { value: T; options: { value: T; label: string }[]; label: string; onChange: (v: T) => void }) {
  return (
    <div className="pe-layouts" data-n={options.length} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className="pe-layout" onClick={() => onChange(o.value)}>
          <svg viewBox="0 0 64 44" className="pe-schema" aria-hidden>
            {SCHEMAS[o.value]}
          </svg>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Design tab ───────────────────────────────────────────────────────

function DesignPanel({ ctx }: { ctx: PanelCtx }) {
  const { t, tx } = useI18n();
  const { tenant } = useWorkspace();
  const { draft, update, pick, working } = ctx;
  const b = draft.branding;
  const setBranding = (p: Partial<Branding>) => update((d) => ({ ...d, branding: { ...d.branding, ...p } }));
  const custom = b.customAccent && HEX.test(b.customAccent) ? b.customAccent : null;
  const adjusted = !!custom && readableAccent(custom).toLowerCase() !== custom.toLowerCase();
  const name = tx(tenant.business.name);

  return (
    <div className="pe-stack pe-enter">
      <Group title={t('pageEditor.theme.label')} hint={t('pageEditor.theme.hint')}>
        <div className="pe-themes" role="radiogroup" aria-label={t('pageEditor.theme.label')}>
          {THEMES.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={draft.page.theme === k}
              className="pe-theme"
              onClick={() => update((d) => ({ ...d, page: { ...d.page, theme: k } }))}
            >
              <span className="pe-theme__art" data-theme={k} style={{ '--swatch': accentColor(b) } as CSSProperties} aria-hidden>
                <span className="pe-theme__aa">Aa</span>
                <span className="pe-theme__line" />
                <span className="pe-theme__line pe-theme__line--short" />
                <span className="pe-theme__btn" />
              </span>
              <span className="pe-theme__name">{t(`pageEditor.theme.names.${k}`)}</span>
              <span className="pe-theme__desc">{t(`pageEditor.theme.desc.${k}`)}</span>
            </button>
          ))}
        </div>
      </Group>

      <Group title={t('pageEditor.color.label')} hint={t('pageEditor.color.hint')}>
        <div className="pe-swatches">
          {ACCENT_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className="pe-swatch"
              aria-pressed={!custom && b.accent === k}
              aria-label={t(`onboarding.review.colorName.${k}`)}
              style={{ background: ACCENTS[k] }}
              onClick={() => setBranding({ accent: k, customAccent: undefined })}
            />
          ))}
          <label className="pe-swatch pe-swatch--custom" data-on={custom ? '' : undefined} style={custom ? ({ '--c': custom } as CSSProperties) : undefined} title={t('pageEditor.color.custom')}>
            <input type="color" className="pe-swatch__input" value={custom ?? accentColor(b)} onChange={(e) => setBranding({ customAccent: e.target.value })} aria-label={t('pageEditor.color.custom')} />
          </label>
        </div>
        {adjusted && <p className="pe-note">{t('pageEditor.color.adjusted')}</p>}
      </Group>

      <Group title={t('pageEditor.logo.label')} hint={t('pageEditor.logo.hint')}>
        <Switch checked={!b.hideLogo} onChange={(v) => setBranding({ hideLogo: v ? undefined : true })} label={t('pageEditor.logo.show')} />
        <div className="pe-logo" data-off={b.hideLogo || undefined}>
          <span data-accent={b.accent} style={accentStyle(b)}>
            <BusinessMark name={name} logoUrl={b.logoUrl} className="biz-mark--xl" />
          </span>
          <div className="pe-logo__actions">
            <button type="button" className="btn btn--tinted btn--sm" onClick={async () => (await pick('logo', { aspect: 1, max: 400 })).forEach((url) => setBranding({ logoUrl: url }))}>
              {working === 'logo' ? t('pageEditor.photo.working') : b.logoUrl ? t('pageEditor.photo.replace') : t('pageEditor.photo.upload')}
            </button>
            {b.logoUrl && (
              <button type="button" className="btn btn--quiet btn--sm" onClick={() => setBranding({ logoUrl: undefined })}>
                {t('pageEditor.photo.remove')}
              </button>
            )}
          </div>
        </div>
        {b.hideLogo ? <p className="pe-note">{t('pageEditor.logo.hidden')}</p> : !b.logoUrl && <p className="pe-note">{t('pageEditor.logo.monogram')}</p>}
      </Group>
    </div>
  );
}

// ── Sections tab ─────────────────────────────────────────────────────

function SectionsList({
  sections,
  canAdd,
  onOpen,
  onToggle,
  onMove,
  onAdd,
}: {
  sections: PageSection[];
  canAdd: boolean;
  onOpen: (id: string) => void;
  onToggle: (s: PageSection) => void;
  onMove: (id: string, to: number) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const [drag, setDrag] = useState<string | null>(null);
  return (
    <div className="pe-stack pe-enter">
      <p className="pe-lede">{t('pageEditor.sections.lede')}</p>
      <ul className="pe-sections">
        {sections.map((s, i) => {
          const pinned = s.kind === 'hero';
          const Icon = KIND_ICONS[s.kind];
          const name = t(`pageEditor.kinds.${s.kind}`);
          return (
            <li
              key={s.id}
              className="pe-sec"
              data-hidden={!s.visible || undefined}
              data-dragging={drag === s.id || undefined}
              draggable={!pinned}
              onDragStart={(e) => {
                setDrag(s.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', s.id);
              }}
              onDragOver={(e) => {
                if (!drag || pinned) return;
                e.preventDefault();
                if (drag !== s.id) onMove(drag, i);
              }}
              onDrop={(e) => e.preventDefault()}
              onDragEnd={() => setDrag(null)}
            >
              <span className="pe-sec__grip" title={pinned ? t('pageEditor.sections.pinned') : t('pageEditor.sections.drag')} aria-hidden>
                {pinned ? <LockIcon size={13} /> : <GripIcon size={14} />}
              </span>
              <button type="button" className="pe-sec__main" onClick={() => onOpen(s.id)}>
                <span className="pe-sec__icon">
                  <Icon size={16} />
                </span>
                <span className="pe-sec__text">
                  <span className="pe-sec__name">{name}</span>
                  <span className="pe-sec__sub">{pinned ? t('pageEditor.sections.pinned') : s.visible ? t(`pageEditor.kindDesc.${s.kind}`) : t('pageEditor.sections.hidden')}</span>
                </span>
                <ChevronRight size={14} className="pe-sec__chev" />
              </button>
              {!pinned && (
                <button
                  type="button"
                  className="icon-btn pe-sec__eye"
                  aria-pressed={s.visible}
                  aria-label={s.visible ? t('pageEditor.sections.hideItem', { name }) : t('pageEditor.sections.showItem', { name })}
                  onClick={() => onToggle(s)}
                >
                  {s.visible ? <EyeIcon size={16} /> : <EyeOffIcon size={16} />}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {canAdd && (
        <button type="button" className="pe-add" onClick={onAdd}>
          <PlusIcon size={16} /> {t('pageEditor.sections.add')}
        </button>
      )}
    </div>
  );
}

// ── One section ──────────────────────────────────────────────────────

function SectionPanel({
  ctx,
  section: s,
  index,
  count,
  onBack,
  onMove,
  onRemove,
}: {
  ctx: PanelCtx;
  section: PageSection;
  index: number;
  count: number;
  onBack: () => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const { t, tx, locale } = useI18n();
  const { patch } = ctx;
  const pinned = s.kind === 'hero';

  return (
    <div className="pe-stack pe-enter">
      <PanelHead title={t(`pageEditor.kinds.${s.kind}`)} onBack={onBack} />

      {!pinned && (
        <div className="pe-toolbar">
          <Switch checked={s.visible} onChange={(v) => patch(s.id, { visible: v })} label={t('pageEditor.sections.show')} />
          <span className="pe-toolbar__moves">
            <button type="button" className="icon-btn" disabled={index <= 1} onClick={() => onMove(index - 1)} aria-label={t('pageEditor.sections.moveUp')}>
              <ArrowUpIcon size={16} />
            </button>
            <button type="button" className="icon-btn" disabled={index >= count - 1} onClick={() => onMove(index + 1)} aria-label={t('pageEditor.sections.moveDown')}>
              <ArrowDownIcon size={16} />
            </button>
          </span>
        </div>
      )}

      {s.kind !== 'hero' && (
        <TextField
          id={`sec-title-${s.id}`}
          label={t('pageEditor.sections.title')}
          hint={t('pageEditor.sections.titleHint', { default: t(SECTION_TITLE_KEYS[s.kind]) })}
          placeholder={t(SECTION_TITLE_KEYS[s.kind])}
          value={tx(s.title)}
          onChange={(v) => patch(s.id, { title: v.trim() ? setL(s.title, locale, v) : undefined })}
        />
      )}

      {s.kind === 'hero' && <HeroFields ctx={ctx} section={s} />}
      {s.kind === 'services' && <ServicesFields ctx={ctx} section={s} />}
      {s.kind === 'gallery' && <GalleryFields ctx={ctx} section={s} />}
      {s.kind === 'about' && <AboutFields ctx={ctx} section={s} />}
      {s.kind === 'team' && <TeamFields ctx={ctx} />}
      {(s.kind === 'reviews' || s.kind === 'faq') && <ItemsFields ctx={ctx} section={s} kind={s.kind} />}
      {s.kind === 'info' && (
        <div className="pe-callout">
          <p>{t('pageEditor.info.body')}</p>
          <button type="button" className="btn btn--tinted btn--sm" onClick={() => ctx.leave('/app/settings/business')}>
            {t('pageEditor.info.manage')}
          </button>
        </div>
      )}

      {REMOVABLE.includes(s.kind) && (
        <button type="button" className="pe-remove" onClick={onRemove}>
          <TrashIcon size={15} /> {t('pageEditor.sections.remove')}
        </button>
      )}
    </div>
  );
}

function HeroFields({ ctx, section: s }: { ctx: PanelCtx; section: PageSection }) {
  const { t, tx, locale } = useI18n();
  const { draft, update, patch, pick, working } = ctx;
  return (
    <>
      <Group title={t('pageEditor.sections.layout')}>
        <LayoutPicker<HeroLayout>
          label={t('pageEditor.sections.layout')}
          value={(s.layout as HeroLayout) ?? 'centered'}
          onChange={(v) => patch(s.id, { layout: v })}
          options={(['centered', 'split', 'cover'] as const).map((v) => ({ value: v, label: t(`pageEditor.hero.layouts.${v}`) }))}
        />
      </Group>
      <PhotoField
        label={t('pageEditor.hero.cover')}
        hint={t('pageEditor.hero.coverHint')}
        src={draft.branding.coverUrl}
        busy={working === 'cover'}
        onPick={async () => (await pick('cover', { max: 1920 })).forEach((url) => update((d) => ({ ...d, branding: { ...d.branding, coverUrl: url } })))}
        onRemove={() => update((d) => ({ ...d, branding: { ...d.branding, coverUrl: undefined } }))}
      />
      <TextField
        id="hero-tagline"
        label={t('pageEditor.hero.tagline')}
        placeholder={t('pageEditor.hero.taglinePlaceholder')}
        value={tx(draft.tagline)}
        onChange={(v) => update((d) => ({ ...d, tagline: setL(d.tagline, locale, v) }))}
      />
      <TextField
        id="hero-description"
        area
        label={t('pageEditor.hero.description')}
        placeholder={t('pageEditor.hero.descriptionPlaceholder')}
        value={tx(draft.description)}
        onChange={(v) => update((d) => ({ ...d, description: setL(d.description, locale, v) }))}
      />
    </>
  );
}

function ServicesFields({ ctx, section: s }: { ctx: PanelCtx; section: PageSection }) {
  const { t, tx } = useI18n();
  const { tenant } = useWorkspace();
  const { draft, update, patch, pick, working } = ctx;
  const services = tenant.services.filter((x) => x.active);
  const setPhoto = (id: string, url: string | null) => update((d) => ({ ...d, servicePhotos: { ...d.servicePhotos, [id]: url } }));
  return (
    <>
      <Group title={t('pageEditor.sections.layout')}>
        <LayoutPicker<ServicesLayout>
          label={t('pageEditor.sections.layout')}
          value={(s.layout as ServicesLayout) ?? 'list'}
          onChange={(v) => patch(s.id, { layout: v })}
          options={(['list', 'cards', 'tiles', 'menu', 'feature', 'carousel'] as const).map((v) => ({ value: v, label: t(`pageEditor.services.layouts.${v}`) }))}
        />
      </Group>
      <Group title={t('pageEditor.services.photos')} hint={t('pageEditor.services.photosHint')}>
        {services.length === 0 ? (
          <p className="pe-lede">{t('pageEditor.services.none')}</p>
        ) : (
          <ul className="pe-rows">
            {services.map((x) => {
              const src = x.id in draft.servicePhotos ? draft.servicePhotos[x.id] ?? undefined : x.imageUrl;
              return (
                <PhotoRow
                  key={x.id}
                  label={tx(x.name)}
                  src={src}
                  busy={working === `svc-${x.id}`}
                  onPick={async () => (await pick(`svc-${x.id}`, { max: 1000 })).forEach((url) => setPhoto(x.id, url))}
                  onRemove={() => setPhoto(x.id, null)}
                />
              );
            })}
          </ul>
        )}
        <button type="button" className="pe-link" onClick={() => ctx.leave('/app/services')}>
          {t('pageEditor.services.manage')} <ChevronRight size={13} />
        </button>
      </Group>
    </>
  );
}

function GalleryFields({ ctx, section: s }: { ctx: PanelCtx; section: PageSection }) {
  const { t, dir } = useI18n();
  const { patch, pick, working } = ctx;
  const images = s.images ?? [];
  const [drag, setDrag] = useState<number | null>(null);
  const set = (next: string[]) => patch(s.id, { images: next });
  const addPhotos = async () => {
    const urls = await pick('gallery', { max: 1600 }, true);
    if (urls.length) set([...images, ...urls].slice(0, GALLERY_MAX));
  };
  const layout = (s.layout as GalleryLayout) ?? 'grid';
  return (
    <>
      <Group title={t('pageEditor.sections.layout')}>
        <LayoutPicker<GalleryLayout>
          label={t('pageEditor.sections.layout')}
          value={layout}
          onChange={(v) => patch(s.id, { layout: v })}
          options={(['grid', 'masonry', 'strip', 'marquee'] as const).map((v) => ({ value: v, label: t(`pageEditor.gallery.layouts.${v}`) }))}
        />
        {layout === 'marquee' && (
          <div className="pe-flow">
            <span className="pe-flow__label">{t('pageEditor.gallery.flow')}</span>
            <Segmented<GalleryFlow>
              label={t('pageEditor.gallery.flow')}
              value={galleryFlow(s, dir)}
              onChange={(v) => patch(s.id, { flow: v })}
              options={[
                { value: 'right', label: <><ArrowRightIcon size={14} /> {t('pageEditor.gallery.flows.right')}</> },
                { value: 'left', label: <><ArrowLeftIcon size={14} /> {t('pageEditor.gallery.flows.left')}</> },
              ]}
            />
          </div>
        )}
      </Group>
      <Group title={t('pageEditor.gallery.photos')} hint={t('pageEditor.gallery.hint', { max: GALLERY_MAX })}>
        <ul className="pe-gallery">
          {images.map((src, i) => (
            <li
              key={`${i}-${src.slice(-16)}`}
              className="pe-gallery__item"
              data-dragging={drag === i || undefined}
              draggable
              onDragStart={(e) => {
                setDrag(i);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(i));
              }}
              onDragOver={(e) => {
                if (drag === null) return;
                e.preventDefault();
                if (drag !== i) {
                  const next = [...images];
                  const [x] = next.splice(drag, 1);
                  next.splice(i, 0, x);
                  set(next);
                  setDrag(i);
                }
              }}
              onDrop={(e) => e.preventDefault()}
              onDragEnd={() => setDrag(null)}
            >
              <img src={src} alt="" />
              <button type="button" className="pe-gallery__remove" onClick={() => set(images.filter((_, j) => j !== i))} aria-label={t('pageEditor.gallery.remove', { n: i + 1 })}>
                <CloseIcon size={12} />
              </button>
            </li>
          ))}
          {images.length < GALLERY_MAX && (
            <li>
              <button type="button" className="pe-gallery__add" onClick={addPhotos}>
                {working === 'gallery' ? (
                  t('pageEditor.photo.working')
                ) : (
                  <>
                    <PlusIcon size={18} />
                    <span>{t('pageEditor.photo.add')}</span>
                  </>
                )}
              </button>
            </li>
          )}
        </ul>
        {images.length >= GALLERY_MAX && <p className="pe-note">{t('pageEditor.gallery.full')}</p>}
      </Group>
    </>
  );
}

function AboutFields({ ctx, section: s }: { ctx: PanelCtx; section: PageSection }) {
  const { t, tx, locale } = useI18n();
  const { patch, pick, working } = ctx;
  return (
    <>
      <PhotoField
        label={t('pageEditor.about.photo')}
        src={s.imageUrl}
        busy={working === 'about'}
        onPick={async () => (await pick('about', { max: 1400 })).forEach((url) => patch(s.id, { imageUrl: url }))}
        onRemove={() => patch(s.id, { imageUrl: undefined })}
      />
      <div className="field">
        <label className="field__label" htmlFor={`about-${s.id}`}>
          {t('pageEditor.about.body')}
        </label>
        <textarea
          id={`about-${s.id}`}
          className="field__input"
          rows={8}
          placeholder={t('pageEditor.about.bodyPlaceholder')}
          value={tx(s.body)}
          onChange={(e) => patch(s.id, { body: setL(s.body, locale, e.target.value) })}
        />
      </div>
    </>
  );
}

function TeamFields({ ctx }: { ctx: PanelCtx }) {
  const { t, tx } = useI18n();
  const { tenant } = useWorkspace();
  const { draft, update, pick, working } = ctx;
  const staff = tenant.staff.filter((x) => x.active && x.onlineBookable);
  const setPhoto = (id: string, url: string | null) => update((d) => ({ ...d, staffPhotos: { ...d.staffPhotos, [id]: url } }));
  return (
    <Group title={t('pageEditor.team.photos')}>
      <ul className="pe-rows">
        {staff.map((x) => {
          const src = x.id in draft.staffPhotos ? draft.staffPhotos[x.id] ?? undefined : x.avatarUrl;
          return (
            <PhotoRow
              key={x.id}
              round
              label={tx(x.name)}
              src={src}
              busy={working === `staff-${x.id}`}
              fallback={<StaffAvatar staff={{ ...x, avatarUrl: undefined }} size="lg" />}
              onPick={async () => (await pick(`staff-${x.id}`, { aspect: 1, max: 700 })).forEach((url) => setPhoto(x.id, url))}
              onRemove={() => setPhoto(x.id, null)}
            />
          );
        })}
      </ul>
      <button type="button" className="pe-link" onClick={() => ctx.leave('/app/staff')}>
        {t('pageEditor.team.manage')} <ChevronRight size={13} />
      </button>
    </Group>
  );
}

function ItemsFields({ ctx, section: s, kind }: { ctx: PanelCtx; section: PageSection; kind: 'reviews' | 'faq' }) {
  const { t, tx, locale } = useI18n();
  const items = s.items ?? [];
  const set = (next: PageItem[]) => ctx.patch(s.id, { items: next });
  const edit = (id: string, key: 'title' | 'body', v: string) => set(items.map((x) => (x.id === id ? { ...x, [key]: setL(x[key], locale, v) } : x)));
  const L =
    kind === 'reviews'
      ? { title: t('pageEditor.reviews.name'), body: t('pageEditor.reviews.text'), add: t('pageEditor.reviews.add'), remove: t('pageEditor.reviews.remove') }
      : { title: t('pageEditor.faq.question'), body: t('pageEditor.faq.answer'), add: t('pageEditor.faq.add'), remove: t('pageEditor.faq.remove') };
  return (
    <div className="pe-items">
      {items.map((x, i) => (
        <fieldset key={x.id} className="pe-item">
          <legend className="pe-item__head">
            <span>{t(kind === 'reviews' ? 'pageEditor.reviews.item' : 'pageEditor.faq.item', { n: i + 1 })}</span>
          </legend>
          <button type="button" className="icon-btn pe-item__remove" onClick={() => set(items.filter((y) => y.id !== x.id))} aria-label={L.remove}>
            <TrashIcon size={15} />
          </button>
          <input className="field__input" aria-label={L.title} placeholder={L.title} value={tx(x.title)} onChange={(e) => edit(x.id, 'title', e.target.value)} />
          <textarea className="field__input" rows={3} aria-label={L.body} placeholder={L.body} value={tx(x.body)} onChange={(e) => edit(x.id, 'body', e.target.value)} />
        </fieldset>
      ))}
      <button type="button" className="pe-add" onClick={() => set([...items, { id: `${kind}-${Date.now().toString(36)}`, title: { en: '' }, body: { en: '' } }])}>
        <PlusIcon size={16} /> {L.add}
      </button>
    </div>
  );
}
