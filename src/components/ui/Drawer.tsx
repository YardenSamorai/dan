import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useT } from '../../i18n/I18nProvider';
import { CloseIcon } from './Icons';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  labelledBy?: string;
}

const PHONE = '(max-width: 640px)';

/**
 * Phones: the sheet follows a downward drag, as on iPhone. From the header or
 * grab handle at any time, from the content once it's scrolled to the top.
 * Let go past a third of its height, or with a flick, and it closes;
 * otherwise it springs back. Dragging up only stretches it a little.
 */
function useSheetDrag(ref: RefObject<HTMLDialogElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let speed = 0;
    let mode: 'idle' | 'maybe' | 'drag' | 'scroll' = 'idle';
    let scroller: HTMLElement | null = null;

    const place = (dy: number) => {
      const y = dy >= 0 ? dy : -8 * Math.log1p(-dy / 8);
      d.style.transform = `translateY(${y}px)`;
      d.style.setProperty('--sheet-fade', String(Math.max(0, 1 - Math.max(dy, 0) / d.offsetHeight)));
    };
    const release = () => {
      d.style.removeProperty('transition');
      d.style.removeProperty('transform');
      d.style.removeProperty('--sheet-fade');
    };

    const start = (e: TouchEvent) => {
      if (!matchMedia(PHONE).matches || e.touches.length !== 1) return;
      const target = e.target as Element;
      if (target.closest('input, textarea, select, [contenteditable], .no-sheet-drag')) return;
      scroller = target.closest<HTMLElement>('.drawer__body');
      startY = lastY = e.touches[0].clientY;
      lastT = e.timeStamp;
      speed = 0;
      mode = 'maybe';
    };
    const move = (e: TouchEvent) => {
      if (mode === 'idle' || mode === 'scroll') return;
      const y = e.touches[0].clientY;
      const dy = y - startY;
      if (mode === 'maybe') {
        if (Math.abs(dy) < 6) return;
        const atTop = !scroller || scroller.scrollTop <= 0;
        if (dy < 0 && scroller) return void (mode = 'scroll');
        if (!atTop) return void (mode = 'scroll');
        mode = 'drag';
        startY = y;
        d.style.transition = 'none';
      }
      e.preventDefault();
      const dt = Math.max(e.timeStamp - lastT, 1);
      speed = 0.8 * ((y - lastY) / dt) + 0.2 * speed;
      lastY = y;
      lastT = e.timeStamp;
      place(y - startY);
    };
    const end = () => {
      if (mode !== 'drag') return void (mode = 'idle');
      mode = 'idle';
      const dy = lastY - startY;
      const dismiss = dy > d.offsetHeight / 3 || (speed > 0.5 && dy > 20);
      // The stylesheet's own spring takes over from wherever the finger let go.
      d.style.removeProperty('transition');
      if (!dismiss) return release();
      d.style.transform = 'translateY(100%)';
      d.style.setProperty('--sheet-fade', '0');
      close.current();
      window.setTimeout(release, 450);
    };

    d.addEventListener('touchstart', start, { passive: true });
    d.addEventListener('touchmove', move, { passive: false });
    d.addEventListener('touchend', end);
    d.addEventListener('touchcancel', end);
    return () => {
      d.removeEventListener('touchstart', start);
      d.removeEventListener('touchmove', move);
      d.removeEventListener('touchend', end);
      d.removeEventListener('touchcancel', end);
    };
  }, [ref]);
}

/**
 * Side panel on desktop, bottom sheet on phones. Native modal dialog: focus trap, Esc and inert background for free.
 * The last open content is kept while the panel transitions out, so it leaves the way it came.
 */
export function Drawer({ open, onClose, title, children, footer, headerExtra }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();
  const last = useRef<{ title: ReactNode; children: ReactNode; footer?: ReactNode; headerExtra?: ReactNode } | null>(null);
  if (open) last.current = { title, children, footer, headerExtra };
  const shown = open ? { title, children, footer, headerExtra } : last.current;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useSheetDrag(ref, onClose);

  return (
    <dialog
      ref={ref}
      className="drawer"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onTransitionEnd={(e) => {
        if (e.target === ref.current && !open) last.current = null;
      }}
      aria-label={typeof shown?.title === 'string' ? shown.title : undefined}
    >
      {shown && (
        <>
          <header className="drawer__head">
            <h2 className="drawer__title">{shown.title}</h2>
            {shown.headerExtra}
            <button type="button" className="btn btn--quiet btn--sm btn--icon" onClick={onClose} aria-label={t('common.close')} tabIndex={open ? 0 : -1}>
              <CloseIcon />
            </button>
          </header>
          <div className="drawer__body">{shown.children}</div>
          {shown.footer && <footer className="drawer__foot">{shown.footer}</footer>}
        </>
      )}
    </dialog>
  );
}
