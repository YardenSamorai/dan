import type { CSSProperties } from 'react';
import { HEX, readableAccent } from '../../domain/color';
import type { AccentKey, Branding, ThemeKey } from '../../domain/types';

/** Swatch colours for the accent picker; must match [data-accent] in styles/tokens.css. */
export const ACCENTS: Record<AccentKey, string> = {
  fig: '#6b2236',
  rose: '#9c3f5a',
  clay: '#94482f',
  sage: '#44614c',
  ocean: '#275a73',
  plum: '#5b3a6e',
  ink: '#262224',
  gold: '#7c5b1c',
};

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];

/** The accent actually shown: a custom colour (made readable) or the curated swatch. */
export const accentColor = (b: Pick<Branding, 'accent' | 'customAccent'>) =>
  b.customAccent && HEX.test(b.customAccent) ? readableAccent(b.customAccent) : ACCENTS[b.accent];

/** Inline style for an element that also carries data-accent; only needed for custom colours. */
export const accentStyle = (b: Pick<Branding, 'accent' | 'customAccent'>): CSSProperties | undefined =>
  b.customAccent && HEX.test(b.customAccent) ? ({ '--accent': readableAccent(b.customAccent) } as CSSProperties) : undefined;

const THEME_FONTS: Partial<Record<ThemeKey, string>> = {
  soft: 'Varela+Round',
  editorial: 'Frank+Ruhl+Libre:wght@500;700',
};

/** Themes with their own typeface load it on first use. */
export function loadThemeFont(theme: ThemeKey) {
  const family = THEME_FONTS[theme];
  const id = `theme-font-${theme}`;
  if (!family || document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  document.head.appendChild(link);
}
