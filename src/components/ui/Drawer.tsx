import { useEffect, useRef, type ReactNode } from 'react';
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
