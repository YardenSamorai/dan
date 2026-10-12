import type { ReactNode } from 'react';

type P = { size?: number; className?: string };

function icon(paths: ReactNode, { directional = false } = {}) {
  return function Icon({ size = 16, className }: P) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        focusable={false}
        className={[directional ? 'flip-rtl' : '', className].filter(Boolean).join(' ') || undefined}
      >
        {paths}
      </svg>
    );
  };
}

/** Directional icons mirror automatically in RTL. */
export const ArrowIcon = icon(<path d="M3 8h10M9 4l4 4-4 4" />, { directional: true });
export const ArrowBackIcon = icon(<path d="M13 8H3m4-4L3 8l4 4" />, { directional: true });
export const ChevronLeft = icon(<path d="M10 3.5 5.5 8l4.5 4.5" />, { directional: true });
export const ChevronRight = icon(<path d="M6 3.5 10.5 8 6 12.5" />, { directional: true });
export const ChevronDown = icon(<path d="m4 6 4 4 4-4" />);
export const CheckIcon = icon(<path d="m3.5 8.5 3 3 6-7" />);
export const HourglassIcon = icon(
  <>
    <path d="M4 2.5h8M4 13.5h8" />
    <path d="M5 2.5v1.2c0 1.4 3 2.7 3 4.3s-3 2.9-3 4.3v1.2M11 2.5v1.2c0 1.4-3 2.7-3 4.3s3 2.9 3 4.3v1.2" />
  </>,
);
export const DoorIcon = icon(
  <>
    <path d="M2.5 13.5h11" />
    <path d="M4.5 13.5V3a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5v10.5" />
    <circle cx="9.5" cy="8.5" r="0.7" fill="currentColor" stroke="none" />
  </>,
);
export const CloseIcon = icon(<path d="m4 4 8 8M12 4l-8 8" />);
export const PlusIcon = icon(<path d="M8 3.5v9M3.5 8h9" />);
export const MinusIcon = icon(<path d="M3.5 8h9" />);
export const SearchIcon = icon(
  <>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3 3" />
  </>,
);
export const ClockIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5v3.2l2 1.3" />
  </>,
);
export const PinIcon = icon(
  <>
    <path d="M8 14s4.5-4 4.5-7.5a4.5 4.5 0 1 0-9 0C3.5 10 8 14 8 14z" />
    <circle cx="8" cy="6.5" r="1.6" />
  </>,
);
export const PhoneIcon = icon(<path d="M5.5 2.5h-2a1 1 0 0 0-1 1.1A10.5 10.5 0 0 0 12.4 13.5a1 1 0 0 0 1.1-1v-2l-2.6-1-1.3 1.3a7 7 0 0 1-3.4-3.4L7.5 6.1z" />);
export const CalendarIcon = icon(
  <>
    <rect x="2.5" y="3.5" width="11" height="10" rx="2" />
    <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
  </>,
);
export const HomeIcon = icon(<path d="M2.5 7 8 2.5 13.5 7v6a.5.5 0 0 1-.5.5H10V10H6v3.5H3a.5.5 0 0 1-.5-.5z" />);
export const GridIcon = icon(
  <>
    <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
    <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
    <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
  </>,
);
export const ListIcon = icon(<path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />);
export const UsersIcon = icon(
  <>
    <circle cx="6" cy="5.5" r="2.5" />
    <path d="M1.5 13.5a4.5 4.5 0 0 1 9 0M10.5 3.2a2.5 2.5 0 0 1 0 4.6M12 9.3a4.5 4.5 0 0 1 2.5 4.2" />
  </>,
);
export const UserIcon = icon(
  <>
    <circle cx="8" cy="5.5" r="2.8" />
    <path d="M2.8 13.8a5.2 5.2 0 0 1 10.4 0" />
  </>,
);
export const SparkIcon = icon(<path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l1.8 1.8M10.2 10.2 12 12M12 4l-1.8 1.8M5.8 10.2 4 12" />);
export const TagIcon = icon(
  <>
    <path d="M2.5 2.5h5l6 6-5 5-6-6z" />
    <circle cx="5.5" cy="5.5" r="1" />
  </>,
);
export const SlidersIcon = icon(<path d="M3 4h6M12 4h1M3 12h1M7 12h6M3 8h2M8 8h5M10.5 2.5v3M5.5 10.5v3M6.5 6.5v3" />);
export const GearIcon = icon(
  <>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M1.8 8h1.6M12.6 8h1.6M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
  </>,
);
export const ExternalIcon = icon(<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />, { directional: true });
export const DotsIcon = icon(
  <>
    <circle cx="3.5" cy="8" r=".6" fill="currentColor" />
    <circle cx="8" cy="8" r=".6" fill="currentColor" />
    <circle cx="12.5" cy="8" r=".6" fill="currentColor" />
  </>,
);
export const AlertIcon = icon(
  <>
    <path d="M8 2.2 14.2 13H1.8z" />
    <path d="M8 6.5v3M8 11.3h.01" />
  </>,
);
export const MenuIcon = icon(<path d="M2.5 5h11M2.5 11h11" />);
export const GlobeIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8h12M8 2c1.8 2 2.6 4 2.6 6S9.8 12 8 14C6.2 12 5.4 10 5.4 8S6.2 4 8 2z" />
  </>,
);
export const MailIcon = icon(
  <>
    <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
    <path d="m2.5 4.5 5.5 4.2 5.5-4.2" />
  </>,
);
export const MessageIcon = icon(<path d="M2.5 3.5h11v7.5H6l-3.5 2.5z" />);
export const LockIcon = icon(
  <>
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
  </>,
);

export const LogOutIcon = icon(<path d="M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3M10.5 11l3-3-3-3M13.5 8H6" />, { directional: true });
export const SwapIcon = icon(<path d="M4.5 2.5 2 5l2.5 2.5M2 5h10M11.5 8.5 14 11l-2.5 2.5M14 11H4" />);
export const BanIcon = icon(
  <>
    <circle cx="8" cy="8" r="6" />
    <path d="m3.8 3.8 8.4 8.4" />
  </>,
);
export const SidebarIcon = icon(
  <>
    <rect x="2" y="2.5" width="12" height="11" rx="2" />
    <path d="M6 2.5v11" />
  </>,
  { directional: true },
);
export const BrushIcon = icon(<path d="M13.5 2.5 7.8 8.2M9.4 9.8 6.2 6.6M6.2 9.6c-1.4 0-2.2 1-2.2 2.1 0 .9-.6 1.5-1.5 1.8 3.2.9 5.9-.2 5.9-2.2 0-1-.9-1.7-2.2-1.7Z" />);
export const EyeIcon = icon(
  <>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </>,
);
export const EyeOffIcon = icon(<path d="M6.6 3.7A6.6 6.6 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a12 12 0 0 1-1.8 2.3M4.3 4.9A11.6 11.6 0 0 0 1.5 8S4 12.5 8 12.5c1.3 0 2.5-.5 3.5-1.1M6.6 6.6a2 2 0 0 0 2.8 2.8M2.5 2.5l11 11" />);
export const ImageIcon = icon(
  <>
    <rect x="2" y="2.5" width="12" height="11" rx="2" />
    <circle cx="5.75" cy="6.25" r="1.25" />
    <path d="m2.5 12 3.5-3.5 2.5 2.5 2-2 3.5 3.5" />
  </>,
);
export const GripIcon = icon(
  <path d="M6 3.5h.01M10 3.5h.01M6 8h.01M10 8h.01M6 12.5h.01M10 12.5h.01" strokeWidth={2.2} />,
);
export const DesktopIcon = icon(
  <>
    <rect x="1.5" y="2.5" width="13" height="8.5" rx="1.5" />
    <path d="M5.5 13.5h5M8 11v2.5" />
  </>,
);
export const MobileIcon = icon(
  <>
    <rect x="4.5" y="1.5" width="7" height="13" rx="1.75" />
    <path d="M7.25 12.25h1.5" />
  </>,
);
export const TrashIcon = icon(<path d="M2.5 4.5h11M6.5 4.5V3a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1.5M4 4.5l.6 8.1a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.1" />);
export const ArrowUpIcon = icon(<path d="M8 13V3M4 7l4-4 4 4" />);
export const ArrowDownIcon = icon(<path d="M8 3v10M4 9l4 4 4-4" />);
/** Physical directions: these never mirror. */
export const ArrowLeftIcon = icon(<path d="M13 8H3m4-4L3 8l4 4" />);
export const ArrowRightIcon = icon(<path d="M3 8h10M9 4l4 4-4 4" />);
export const QuestionIcon = icon(
  <>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M6.2 6.2a1.9 1.9 0 0 1 3.7.5c0 1.3-1.9 1.6-1.9 2.8M8 11.5h.01" />
  </>,
);
export const UploadIcon = icon(<path d="M8 10.5v-8M4.5 6 8 2.5 11.5 6M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />);
export const DownloadIcon = icon(<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />);
export const PlayIcon = icon(<path d="M5 3.2v9.6a.4.4 0 0 0 .6.3l7.4-4.8a.4.4 0 0 0 0-.6L5.6 2.9a.4.4 0 0 0-.6.3Z" />);
export const LinkIcon = icon(<path d="M7 9a3 3 0 0 0 4.2 0l2-2A3 3 0 0 0 9 2.8l-.8.8M9 7a3 3 0 0 0-4.2 0l-2 2A3 3 0 0 0 7 13.2l.8-.8" />);
export const ChartIcon = icon(<path d="M2.5 13.5h11M4.5 11V8.5M7.5 11V4.5M10.5 11V7M13 11V2.5" />);
export const StarIcon = icon(<path d="m8 2.3 1.7 3.5 3.8.5-2.8 2.7.7 3.8L8 11l-3.4 1.8.7-3.8-2.8-2.7 3.8-.5z" />);

/**
 * Placeholder product mark: a neutral rounded tile. Replaced together with
 * PRODUCT.name once the brand is chosen.
 */
export function ProductMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden focusable={false}>
      <rect x="2" y="2" width="16" height="16" rx="5" fill="currentColor" />
      <rect x="5.4" y="5.4" width="3.9" height="3.9" rx="1.1" fill="#fff" />
      <rect x="10.7" y="5.4" width="3.9" height="3.9" rx="1.1" fill="#fff" fillOpacity=".32" />
      <rect x="5.4" y="10.7" width="3.9" height="3.9" rx="1.1" fill="#fff" fillOpacity=".32" />
      <rect x="10.7" y="10.7" width="3.9" height="3.9" rx="1.1" fill="#fff" fillOpacity=".32" />
    </svg>
  );
}

/** A tenant's logo, or a monogram tile in its accent colour. */
export function BusinessMark({ name, logoUrl, className }: { name: string; logoUrl?: string; className?: string }) {
  if (logoUrl) return <img src={logoUrl} alt="" className={`biz-mark biz-mark--img${className ? ` ${className}` : ''}`} />;
  return (
    <span className={`biz-mark${className ? ` ${className}` : ''}`} aria-hidden>
      {[...name.trim()][0]?.toLocaleUpperCase() ?? '·'}
    </span>
  );
}
