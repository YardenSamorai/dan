import { useEffect, useRef } from 'react';
import { CloseIcon } from './Icons';

/** YouTube and Vimeo links become privacy-friendly embeds; anything else returns null (open it in a new tab). */
export function embedUrl(link: string): string | null {
  try {
    const u = new URL(link);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    const yt =
      host === 'youtu.be' ? u.pathname.slice(1) : host === 'youtube.com' ? (u.searchParams.get('v') ?? /^\/(?:shorts|embed|live)\/([\w-]+)/.exec(u.pathname)?.[1]) : null;
    if (yt && /^[\w-]{6,}$/.test(yt)) return `https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1`;
    const vimeo = host === 'vimeo.com' ? /^\/(\d+)/.exec(u.pathname)?.[1] : null;
    if (vimeo) return `https://player.vimeo.com/video/${vimeo}?dnt=1`;
  } catch {
    /* not a URL */
  }
  return null;
}

export function VideoDialog({ url, title, closeLabel, onClose }: { url: string | null; title: string; closeLabel: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (url && !d.open) d.showModal();
    if (!url && d.open) d.close();
  }, [url]);
  const src = url && embedUrl(url);
  return (
    <dialog
      ref={ref}
      className="dialog video-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {src && (
        <>
          <div className="video-dialog__head">
            <h2 className="dialog__title">{title}</h2>
            <button type="button" className="video-dialog__close" onClick={onClose} aria-label={closeLabel} autoFocus>
              <CloseIcon size={16} />
            </button>
          </div>
          <div className="video-dialog__frame">
            <iframe src={src} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          </div>
        </>
      )}
    </dialog>
  );
}
