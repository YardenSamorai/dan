import type { GalleryFlow, PageConfig, PageSection, SectionKind, ThemeKey } from './types';

export const THEMES: ThemeKey[] = ['clean', 'soft', 'editorial', 'night'];

/** Order sections are offered in when adding; each kind appears at most once. */
export const SECTION_KINDS: SectionKind[] = ['hero', 'services', 'gallery', 'about', 'team', 'reviews', 'faq', 'info'];

export const GALLERY_MAX = 12;

/** Unset means the way the page reads: a marquee enters from the side text starts on. */
export const galleryFlow = (s: PageSection, dir: 'ltr' | 'rtl'): GalleryFlow => s.flow ?? (dir === 'rtl' ? 'right' : 'left');

let seq = 0;
export const sectionId = (kind: SectionKind) => `${kind}-${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newSection(kind: SectionKind): PageSection {
  const base: PageSection = { id: sectionId(kind), kind, visible: true };
  if (kind === 'hero') return { ...base, layout: 'centered' };
  if (kind === 'services') return { ...base, layout: 'list' };
  if (kind === 'gallery') return { ...base, images: [] };
  if (kind === 'about') return { ...base, body: { en: '' } };
  if (kind === 'reviews' || kind === 'faq') return { ...base, items: [] };
  return base;
}

/** What a business gets before it opens the editor: today's page, as sections. */
export function defaultPage(staffCount: number): PageConfig {
  return {
    theme: 'clean',
    sections: [
      { id: 'hero', kind: 'hero', visible: true, layout: 'centered' },
      { id: 'services', kind: 'services', visible: true, layout: 'list' },
      { id: 'team', kind: 'team', visible: staffCount > 1 },
      { id: 'info', kind: 'info', visible: true },
    ],
  };
}

/** The page to render: the saved one, or the default. The hero is always present and first. */
export function pageOf(page: PageConfig | undefined, staffCount: number): PageConfig {
  const p = page ?? defaultPage(staffCount);
  const hero = p.sections.find((s) => s.kind === 'hero') ?? { id: 'hero', kind: 'hero' as const, visible: true, layout: 'centered' as const };
  return { ...p, sections: [{ ...hero, visible: true }, ...p.sections.filter((s) => s.kind !== 'hero')] };
}

/** Kinds not on the page yet. */
export const missingKinds = (p: PageConfig) => SECTION_KINDS.filter((k) => !p.sections.some((s) => s.kind === k));

export function moveSection(p: PageConfig, id: string, to: number): PageConfig {
  const from = p.sections.findIndex((s) => s.id === id);
  if (from < 1 || to < 1 || to >= p.sections.length) return p;
  const sections = [...p.sections];
  const [s] = sections.splice(from, 1);
  sections.splice(to, 0, s);
  return { ...p, sections };
}
