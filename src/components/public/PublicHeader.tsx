import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nProvider';
import { CloseIcon } from '../ui/Icons';
import { LocaleSwitch } from '../ui/bits';
import '../../styles/public.css';

export interface PublicNavItem {
  to: string;
  label: string;
}

/**
 * The shared header of the marketing site and tenant booking pages: brand at
 * inline-start, nav, language, a primary action and a full-screen sheet on phones.
 */
export function PublicHeader({
  brand,
  home,
  nav,
  action,
  sheetFoot,
}: {
  brand: ReactNode;
  home: string;
  nav: PublicNavItem[];
  action: ReactNode;
  sheetFoot?: ReactNode;
}) {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const menuBtn = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    const d = sheetRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) {
      d.close();
      menuBtn.current?.focus();
    }
  }, [open]);

  const link = (n: PublicNavItem, className: string, style?: React.CSSProperties) =>
    n.to.startsWith('#') ? (
      <a key={n.to} href={n.to} className={className} style={style} onClick={() => setOpen(false)}>
        {n.label}
      </a>
    ) : (
      <Link key={n.to} to={n.to} className={className} style={style}>
        {n.label}
      </Link>
    );

  return (
    <>
      <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
        <div className="site-header__inner container">
          <Link to={home} className="site-header__logo">
            {brand}
          </Link>
          <nav className="site-header__nav" aria-label={t('common.menu')}>
            {nav.map((n) => link(n, 'site-header__link'))}
          </nav>
          <div className="site-header__actions">
            <LocaleSwitch className="site-header__locale" />
            {action}
            <button ref={menuBtn} type="button" className="site-header__menu" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(true)}>
              <span className="sr-only">{t('common.openMenu')}</span>
              <i />
              <i />
            </button>
          </div>
        </div>
      </header>

      <dialog
        id="site-menu"
        ref={sheetRef}
        className="menu-sheet"
        aria-label={t('common.menu')}
        onCancel={(e) => {
          e.preventDefault();
          setOpen(false);
        }}
      >
        {open && (
          <>
            <div className="menu-sheet__top container">
              {brand}
              <button type="button" className="menu-sheet__close" onClick={() => setOpen(false)}>
                <CloseIcon size={20} />
                <span className="sr-only">{t('common.closeMenu')}</span>
              </button>
            </div>
            <nav className="menu-sheet__nav container">
              {nav.map((n, i) => link(n, 'menu-sheet__link display', { animationDelay: `${60 + i * 40}ms` }))}
            </nav>
            <div className="menu-sheet__foot container">
              <LocaleSwitch />
              {sheetFoot}
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
