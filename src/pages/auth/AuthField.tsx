import { useEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react';

/**
 * One row of the grouped sign-in fields: the label rests inside the row and rises when the
 * row is focused or filled. Needs a non-empty placeholder (" ") for :placeholder-shown.
 */
export function AuthField({
  id,
  label,
  trailing,
  invalid,
  ...input
}: { id: string; label: string; trailing?: ReactNode; invalid?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="af" data-trailing={trailing ? true : undefined}>
      <input id={id} className="af__input" placeholder=" " aria-invalid={invalid || undefined} {...input} />
      <label className="af__label" htmlFor={id}>
        {label}
      </label>
      {trailing}
    </div>
  );
}

/** The fields share one panel, so a form reads as a single object. Each new `shake` value nudges it. */
export function AuthFields({ children, shake = 0 }: { children: ReactNode; shake?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!shake || !el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }],
      { duration: 380, easing: 'cubic-bezier(.36,.07,.19,.97)' },
    );
  }, [shake]);

  return (
    <div className="af-group" ref={ref}>
      {children}
    </div>
  );
}
