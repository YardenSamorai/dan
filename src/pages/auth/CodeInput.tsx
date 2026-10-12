import { useEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * A one-time code as separate digit boxes. One real input sits over the boxes,
 * so typing, deleting, pasting and the phone's "from Messages/Mail" suggestion
 * all behave like a normal field.
 */
export function CodeInput({
  id,
  length,
  value,
  onChange,
  onComplete,
  label,
  invalid,
  shake = 0,
  disabled,
}: {
  id: string;
  length: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  label: string;
  invalid?: boolean;
  shake?: number;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!shake || !el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }],
      { duration: 380, easing: 'cubic-bezier(.36,.07,.19,.97)' },
    );
  }, [shake]);

  const active = Math.min(value.length, length - 1);

  return (
    <div className="code-input" ref={ref} dir="ltr" data-invalid={invalid || undefined} style={{ '--digits': length } as CSSProperties}>
      <input
        id={id}
        className="code-input__field"
        data-autofocus
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={length}
        aria-label={label}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, length);
          onChange(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
      />
      {Array.from({ length }, (_, i) => (
        <span key={i} className="code-input__box" data-filled={i < value.length || undefined} data-active={(focused && i === active) || undefined} aria-hidden>
          {value[i] ?? ''}
        </span>
      ))}
    </div>
  );
}
