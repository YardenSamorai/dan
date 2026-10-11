import { useSearchParams } from 'react-router-dom';

/** Where to go after signing in or up (`?next=`), e.g. back to a team invite. Only paths on this site. */
export function useNext(): string | null {
  const [params] = useSearchParams();
  const next = params.get('next');
  return next && /^\/(?![/\\])/.test(next) ? next : null;
}

export const withNext = (to: string, next: string | null) => (next ? `${to}?next=${encodeURIComponent(next)}` : to);
