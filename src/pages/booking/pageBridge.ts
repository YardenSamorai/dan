import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PageSaveInput, PublicBusiness } from '../../data';
import { pageOf } from '../../domain/page';
import type { SectionKind } from '../../domain/types';
import type { MessageKey } from '../../i18n/messages';

/** Heading a section shows when the owner hasn't written one. */
export const SECTION_TITLE_KEYS: Record<Exclude<SectionKind, 'hero'>, MessageKey> = {
  services: 'tenant.services.title',
  gallery: 'tenant.gallery.title',
  about: 'tenant.about.title',
  team: 'tenant.team.title',
  reviews: 'tenant.reviews.title',
  faq: 'tenant.faq.title',
  info: 'tenant.info.title',
};

/**
 * The page editor shows the real booking page in a same-origin iframe
 * (/book/{slug}?editor) and streams the unsaved draft into it. Nothing here
 * touches storage: the draft lives only in the two windows' memory.
 */

export type ToPreview = { type: 'page:draft'; draft: PageSaveInput } | { type: 'page:focus'; id: string | null; scroll?: boolean };
export type FromPreview = { type: 'page:ready' } | { type: 'page:select'; id: string };

export const PREVIEW_PARAM = 'editor';
export const blockId = (sectionId: string) => `block-${sectionId}`;

export interface PreviewEditing {
  focus: string | null;
  select: (sectionId: string) => void;
}

const Ctx = createContext<PreviewEditing | null>(null);
export const PreviewEditingProvider = Ctx.Provider;
/** Non-null only inside the editor's preview frame. */
export const usePreviewEditing = () => useContext(Ctx);

const inEditorFrame = () => window.parent !== window && new URLSearchParams(window.location.search).has(PREVIEW_PARAM);
const toEditor = (m: FromPreview) => window.parent.postMessage(m, window.location.origin);

/** Preview side: receives the draft and selection from the editor. */
export function useEditorPreview() {
  const [editing] = useState(inEditorFrame);
  const [draft, setDraft] = useState<PageSaveInput | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    const onMessage = (e: MessageEvent<ToPreview>) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const m = e.data;
      if (m?.type === 'page:draft') setDraft(m.draft);
      if (m?.type === 'page:focus') {
        setFocus(m.id);
        if (m.scroll && m.id) {
          const id = blockId(m.id);
          setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
        }
      }
    };
    window.addEventListener('message', onMessage);
    toEditor({ type: 'page:ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [editing]);

  const value = useMemo<PreviewEditing | null>(
    () =>
      editing
        ? {
            focus,
            select: (id) => {
              setFocus(id);
              toEditor({ type: 'page:select', id });
            },
          }
        : null,
    [editing, focus],
  );
  return { editing: value, draft };
}

export function applyDraft(b: PublicBusiness, d: PageSaveInput): PublicBusiness {
  const photo = <T extends { id: string }>(xs: T[], photos: Record<string, string | null>, key: 'imageUrl' | 'avatarUrl') =>
    xs.map((x) => (x.id in photos ? { ...x, [key]: photos[x.id] ?? undefined } : x));
  return {
    ...b,
    page: pageOf(d.page, b.staff.length),
    branding: d.branding,
    tagline: d.tagline,
    description: d.description,
    services: photo(b.services, d.servicePhotos, 'imageUrl'),
    staff: photo(b.staff, d.staffPhotos, 'avatarUrl'),
  };
}
