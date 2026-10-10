import type { Locale } from '../config';
import type { Paths, Widen } from '../types';
import { en } from './en';
import { he } from './he';

export type Messages = Widen<typeof en>;
export type MessageKey = Paths<typeof en>;

/** Adding a locale: create messages/<code>.ts typed as Messages and register it in config.ts + here. */
export const messages: Record<Locale, Messages> = { en, he };
