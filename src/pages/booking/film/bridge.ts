import { useEffect, useState } from 'react';
import type { FilmFrame } from './script';

/**
 * The demo film shows the real booking page in a same-origin iframe
 * (/book/{slug}?film) and tells it which moment of the film to show.
 */

export const FILM_PARAM = 'film';

export type ToFilm = { type: 'film:frame'; frame: FilmFrame };
export type FromFilm = { type: 'film:ready' };

export const inFilmFrame = () => window.parent !== window && new URLSearchParams(window.location.search).has(FILM_PARAM);

const FIRST: FilmFrame = { scene: 'start', t: 0 };

/** Inside the film's frame: the moment to show. `null` everywhere else. */
export function useFilmFrame(): FilmFrame | null {
  const [active] = useState(inFilmFrame);
  const [frame, setFrame] = useState<FilmFrame>(FIRST);
  useEffect(() => {
    if (!active) return;
    const onMessage = (e: MessageEvent<ToFilm>) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      if (e.data?.type === 'film:frame') setFrame(e.data.frame);
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'film:ready' } satisfies FromFilm, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, [active]);
  return active ? frame : null;
}
