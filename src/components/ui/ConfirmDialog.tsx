import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, danger, busy, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      role="alertdialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      {open && (
        <>
          <h2 id="confirm-title" className="dialog__title">
            {title}
          </h2>
          {body && <div className="dialog__body">{body}</div>}
          <div className="dialog__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} autoFocus>
              {cancelLabel}
            </button>
            <button type="button" className={`btn btn--sm ${danger ? 'btn--danger' : 'btn--ink'}`} onClick={onConfirm} disabled={busy}>
              {busy && <span className="spinner" aria-hidden />}
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
