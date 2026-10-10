import type { AccentKey } from '../../domain/types';

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
