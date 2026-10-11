import type { PublicBusiness } from '../../../data';
import type { AccentKey, PageSection, SectionKind, ThemeKey } from '../../../domain/types';

/**
 * The demo page "builds itself" as the visitor scrolls: a pure function from
 * scroll progress to the business the preview shows. Every scene reveals a
 * piece of the real, finished page, so the film always ends on exactly what
 * the page below looks like.
 */

export type SceneId = 'start' | 'name' | 'brand' | 'theme' | 'cover' | 'services' | 'team' | 'gallery' | 'about' | 'reviews' | 'info' | 'calendar' | 'done';

export interface Scene {
  id: SceneId;
  /** Share of the scroll this scene takes. */
  weight: number;
}

export interface FilmFrame {
  scene: SceneId;
  /** 0..1 through the scene. */
  t: number;
}

const ORDER: {
  id: SceneId;
  weight: number;
  has?: (b: PublicBusiness) => boolean;
}[] = [
  { id: 'start', weight: 0.5 },
  { id: 'name', weight: 0.9 },
  { id: 'brand', weight: 0.9 },
  { id: 'theme', weight: 1.4 },
  { id: 'cover', weight: 0.8, has: (b) => !!b.branding.coverUrl },
  { id: 'services', weight: 1.4, has: (b) => b.services.length > 0 },
  {
    id: 'team',
    weight: 1.1,
    has: (b) => b.staff.length > 1 && visible(b, 'team'),
  },
  {
    id: 'gallery',
    weight: 1.1,
    has: (b) => !!section(b, 'gallery')?.images?.length,
  },
  { id: 'about', weight: 0.8, has: (b) => !!section(b, 'about') },
  {
    id: 'reviews',
    weight: 0.9,
    has: (b) => !!section(b, 'reviews')?.items?.length,
  },
  { id: 'info', weight: 0.8, has: (b) => visible(b, 'info') },
  {
    id: 'calendar',
    weight: 1.4,
    has: (b) => b.services.length > 0 && b.staff.length > 0,
  },
  { id: 'done', weight: 1.2 },
];

const section = (b: PublicBusiness, kind: SectionKind) => b.page.sections.find((s) => s.kind === kind && s.visible);
const visible = (b: PublicBusiness, kind: SectionKind) => !!section(b, kind);

/** The scenes this business has material for, in order. */
export function scenesFor(b: PublicBusiness): Scene[] {
  return ORDER.filter((s) => !s.has || s.has(b)).map(({ id, weight }) => ({
    id,
    weight,
  }));
}

export function frameAt(scenes: Scene[], p: number): FilmFrame {
  const total = scenes.reduce((n, s) => n + s.weight, 0);
  let at = Math.min(Math.max(p, 0), 1) * total;
  for (const s of scenes) {
    if (at < s.weight || s === scenes[scenes.length - 1]) return { scene: s.id, t: Math.min(at / s.weight, 1) };
    at -= s.weight;
  }
  return { scene: 'done', t: 1 };
}

/** Where each scene starts, 0..1, for the caption rail and skipping. */
export function sceneStarts(scenes: Scene[]): number[] {
  const total = scenes.reduce((n, s) => n + s.weight, 0);
  let at = 0;
  return scenes.map((s) => {
    const start = at / total;
    at += s.weight;
    return start;
  });
}

/** Each scene builds in its first stretch, then holds still before the next one starts. */
export const built = (t: number) => Math.min(t / 0.7, 1);
/** First `t` share of a list, at least one item once the scene has begun. */
export const part = <T>(xs: T[], t: number) => xs.slice(0, Math.max(1, Math.ceil(xs.length * built(t))));
export const typed = (s: string, t: number) => s.slice(0, Math.ceil(s.length * Math.min(t / 0.6, 1)));

/** Looks the design scene steps through before landing on the business's own. */
const LOOKS: { theme: ThemeKey; accent: AccentKey }[] = [
  { theme: 'clean', accent: 'ink' },
  { theme: 'soft', accent: 'rose' },
  { theme: 'night', accent: 'gold' },
];
const lookAt = (t: number) => (t < 0.66 ? LOOKS[Math.floor(t / 0.22)] : null);

export interface FilmView {
  business: PublicBusiness;
  /** Section the preview keeps in view. */
  focus: SectionKind;
  /** The name is being typed. */
  typing: boolean;
}

export function filmView(real: PublicBusiness, scenes: Scene[], f: FilmFrame): FilmView {
  const ids = scenes.map((s) => s.id);
  const at = ids.indexOf(f.scene);
  const reached = (id: SceneId) => ids.includes(id) && ids.indexOf(id) < at;
  const now = (id: SceneId) => f.scene === id;
  const shown = (id: SceneId) => reached(id) || now(id);
  if (f.scene === 'done' || f.scene === 'calendar') return { business: real, focus: 'hero', typing: false };

  const tx = <T extends Record<string, string | undefined>>(v: T, cut: (s: string) => string) =>
    Object.fromEntries(Object.entries(v).map(([k, s]) => [k, s === undefined ? s : cut(s)])) as T;

  const name = reached('name') ? real.name : now('name') ? tx(real.name, (s) => typed(s, f.t)) : { en: '' };
  const brandT = now('brand') ? built(f.t) : reached('brand') ? 1 : 0;
  const look = now('theme') ? lookAt(f.t) : null;
  const designed = reached('theme') || (now('theme') && !look);

  const realHero = real.page.sections.find((s) => s.kind === 'hero')!;
  const hero: PageSection = {
    ...realHero,
    layout: shown('cover') ? realHero.layout : 'centered',
  };
  const sections: PageSection[] = [hero];
  for (const s of real.page.sections) {
    if (!s.visible || s.kind === 'hero') continue;
    const scene = s.kind as SceneId;
    if (!shown(scene)) continue;
    const t = now(scene) ? f.t : 1;
    if (s.kind === 'gallery') sections.push({ ...s, images: part(s.images ?? [], t) });
    else if (s.kind === 'reviews') sections.push({ ...s, items: part(s.items ?? [], t) });
    else sections.push(s);
  }

  const services = shown('services') ? (now('services') ? part(real.services, f.t) : real.services) : [];
  const staff = shown('team') ? (now('team') ? part(real.staff, f.t) : real.staff) : shown('services') ? real.staff.slice(0, 1) : [];

  const business: PublicBusiness = {
    ...real,
    name,
    tagline: brandT > 0 ? tx(real.tagline, (s) => typed(s, brandT)) : { en: '' },
    description: brandT > 0.6 ? real.description : { en: '' },
    branding: {
      ...real.branding,
      hideLogo: brandT > 0 ? real.branding.hideLogo : true,
      coverUrl: shown('cover') ? real.branding.coverUrl : undefined,
      ...(designed ? {} : { accent: look?.accent ?? 'ink', customAccent: undefined }),
    },
    page: {
      theme: designed ? real.page.theme : (look?.theme ?? 'clean'),
      sections,
    },
    services,
    staff,
    addOns: reached('services') ? real.addOns : [],
  };

  const focus: SectionKind = (['services', 'team', 'gallery', 'about', 'reviews', 'info'] as const).find((k) => now(k)) ?? 'hero';
  return { business, focus, typing: now('name') };
}
