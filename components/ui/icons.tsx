import type { SVGProps } from "react";

export type IconName =
  | "activity"
  | "arrow"
  | "bell"
  | "brain"
  | "briefcase"
  | "check"
  | "chevron"
  | "dashboard"
  | "eye"
  | "eyeOff"
  | "globe"
  | "grid"
  | "lock"
  | "mail"
  | "megaphone"
  | "menu"
  | "moon"
  | "people"
  | "phone"
  | "plus"
  | "search"
  | "settings"
  | "shield"
  | "sparkles"
  | "user"
  | "wallet"
  | "building"
  | "graduation"
  | "cart"
  | "rocket"
  | "trend"
  | "barChart"
  | "pieChart"
  | "lightbulb"
  | "cube"
  | "bolt"
  | "link"
  | "mapPin"
  | "crosshair"
  | "fileText"
  | "database"
  | "car"
  | "store"
  | "target"
  | "chip"
  | "refresh"
  | "printer"
  | "share"
  | "externalLink"
  | "warning"
  | "x";

const paths: Record<IconName, React.ReactNode> = {
  activity: (
    <>
      <path d="M3 12h4l2.5-7 5 14 2.5-7h4" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  brain: (
    <>
      <path d="M9 3a4 4 0 0 0-4 4v1a3 3 0 0 0 1 2.2V10a4 4 0 0 0 1.3 3l.7.6V14a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3v-.4l.7-.6A4 4 0 0 0 18 10V8.2A3 3 0 0 0 19 6V5a4 4 0 0 0-4-4h-1a3 3 0 0 0-3 3v1a3 3 0 0 0-3-3H9Zm3 7a2 2 0 0 1 2 2v1h1a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-1.5A2.5 2.5 0 0 1 11 18H9a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h1v-1a2 2 0 0 1 2-2Z" />
      <path d="M12 6v2M9 9h6" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  eyeOff: (
    <>
      <path d="m3 3 18 18M10.6 6.2A11 11 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-2.1 2.8M6.6 6.7C3.6 8.6 2 12 2 12s3.5 6 10 6a10 10 0 0 0 4-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
  grid: (
    <>
      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 11v2a2 2 0 0 0 2 2h2l8 5V4l-8 5H5a2 2 0 0 0-2 2Z" />
      <path d="m7 15 2 6M19 9a4 4 0 0 1 0 6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 9 9 0 1 0 20 15.5" />,
  people: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.08 9.9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.69A2 2 0 0 1 22 16.92Z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4 6v5c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  sparkles: (
    <>
      <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3ZM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15ZM19 13l.7 1.8 1.8.7-1.8.7L19 18l-.7-1.8-1.8-.7 1.8-.7L19 13Z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 5h14a2 2 0 0 1 2 2v12H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path d="M2 8h18M15 13h5v3h-5a1.5 1.5 0 0 1 0-3Z" />
    </>
  ),
  building: <><path d="M4 21V5l8-3 8 3v16" /><path d="M8 9h1M15 9h1M8 13h1M15 13h1M8 17h1M15 17h1M3 21h18" /></>,
  graduation: <><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 12v5c3 2 7 2 10 0v-5M21 10v6" /></>,
  cart: <><path d="M3 4h2l2 11h10l3-8H6" /><circle cx="9" cy="19" r="1" /><circle cx="17" cy="19" r="1" /></>,
  rocket: <><path d="M14 4c3-2 6-1 6-1s1 3-1 6l-6 6-4-4 5-7Z" /><path d="m9 11-4 1-2 4 5-1M13 15l-1 4-4 2 1-5M8 18l-3 3" /></>,
  trend: <><path d="M3 17 9 11l4 4 8-9" /><path d="M16 6h5v5" /></>,
  barChart: <><path d="M5 20V10M12 20V4M19 20v-7" /></>,
  pieChart: <><path d="M12 3v9h9A9 9 0 1 1 12 3Z" /><path d="M15 3a6 6 0 0 1 6 6h-6V3Z" /></>,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  mapPin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></>,
  crosshair: <><circle cx="12" cy="12" r="7" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="1.2" /></>,
  database: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  car: <><path d="M5 16V11l2-5h10l2 5v5M3 16h18v3H3zM7 13h.01M17 13h.01" /><path d="M5 11h14" /></>,
  store: <><path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9c0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0 0 2 4 2 4 0M10 20v-6h4v6" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
  chip: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3M10 11l1.5 4M13.5 11 12 15" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v4h-4" /></>,
  printer: <><path d="M7 9V3h10v6M7 17H4v-6h16v6h-3M7 14h10v7H7z" /></>,
  share: <><circle cx="6" cy="12" r="2.2" /><circle cx="17" cy="6" r="2.2" /><circle cx="17" cy="18" r="2.2" /><path d="m8 11 7-4M8 13l7 4" /></>,
  externalLink: <><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" /></>,
  warning: <><path d="M12 3 2.5 20h19L12 3zM12 10v5M12 17.5v.5" /></>,
  fileText: <><path d="M7 3h7l5 5v13H7V3Z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>,
  lightbulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" /></>,
  cube: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />,
  link: <><path d="M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 11a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
};

export function Icon({
  name,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={["icon", className].filter(Boolean).join(" ")}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
