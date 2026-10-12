import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Stroke({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export function AuthUserIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="8" r="3.9" />
      <path d="M4.6 20.4v-.9a6.4 6.4 0 0 1 6.4-6.4h2a6.4 6.4 0 0 1 6.4 6.4v.9Z" />
    </Stroke>
  );
}

export function AuthUserPlusIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="9.5" cy="7.6" r="3.7" />
      <path d="M2.8 20.2v-.8a6 6 0 0 1 6-6h1.4a6 6 0 0 1 6 6v.8Z" />
      <path d="M19 8.2v5.6M16.2 11h5.6" />
    </Stroke>
  );
}

export function AuthMailIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="2.6" y="4.8" width="18.8" height="14.4" rx="2.6" />
      <path d="m3.4 7.4 7.6 5.2a1.8 1.8 0 0 0 2 0l7.6-5.2" />
    </Stroke>
  );
}

export function AuthPhoneIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M21 16.9v2.6a2 2 0 0 1-2.2 2 17.7 17.7 0 0 1-7.7-2.7 17.4 17.4 0 0 1-5.4-5.4A17.7 17.7 0 0 1 2.9 5.7 2 2 0 0 1 4.9 3.5h2.6a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1l-1.1 1.1a14.2 14.2 0 0 0 5.4 5.4l1.1-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z" />
    </Stroke>
  );
}

export function AuthLockIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="4.2" y="10.6" width="15.6" height="10.6" rx="2.2" />
      <path d="M7.8 10.6V7.4a4.2 4.2 0 0 1 8.4 0v3.2" />
      <path d="M12 15.1v2" />
    </Stroke>
  );
}

export function AuthEyeIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M1.8 12S5.6 5.2 12 5.2 22.2 12 22.2 12 18.4 18.8 12 18.8 1.8 12 1.8 12Z" />
      <circle cx="12" cy="12" r="3.1" />
    </Stroke>
  );
}

export function AuthEyeOffIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M9.9 9.9a3.1 3.1 0 0 0 4.2 4.2" />
      <path d="M10.7 5.3A9.5 9.5 0 0 1 12 5.2C18.4 5.2 22.2 12 22.2 12a16 16 0 0 1-2.1 2.9M6.6 6.7A16.2 16.2 0 0 0 1.8 12S5.6 18.8 12 18.8a9.6 9.6 0 0 0 5.4-1.6" />
      <path d="m2.6 2.6 18.8 18.8" />
    </Stroke>
  );
}

export function AuthGlobeIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="12" r="9.6" />
      <path d="M2.4 12h19.2" />
      <path d="M12 2.4c2.7 2.6 4.1 5.8 4.1 9.6s-1.4 7-4.1 9.6c-2.7-2.6-4.1-5.8-4.1-9.6S9.3 5 12 2.4Z" />
    </Stroke>
  );
}

export function AuthChevronIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="m6 9.2 6 6 6-6" />
    </Stroke>
  );
}

export function AuthInfoIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="12" r="9.6" />
      <path d="M12 11v5.6" />
      <path d="M12 7.6h.01" strokeWidth={2.4} />
    </Stroke>
  );
}

export function AuthCheckIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="m4.8 12.6 4.6 4.6 9.8-10.2" />
    </Stroke>
  );
}

export function AuthCloseIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />
    </Stroke>
  );
}

export function AuthLoginIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M14.4 3.4h4.2a2 2 0 0 1 2 2v13.2a2 2 0 0 1-2 2h-4.2" />
      <path d="m9.6 16.8 4.8-4.8-4.8-4.8" />
      <path d="M14.4 12H3.2" />
    </Stroke>
  );
}

export function AuthAlertIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="12" r="9.6" />
      <path d="M12 7.4v5.4" />
      <path d="M12 16.4h.01" strokeWidth={2.4} />
    </Stroke>
  );
}

/** The Jenan "J" leaf mark, traced as vector paths. */
export function JenanLeafMark(props: IconProps) {
  return (
    <svg viewBox="0 0 40 62" aria-hidden="true" focusable="false" {...props}>
      <defs>
        <linearGradient id="jenan-leaf-cyan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9fdff" />
          <stop offset=".42" stopColor="#2fe9f8" />
          <stop offset="1" stopColor="#17dff2" />
        </linearGradient>
        <linearGradient id="jenan-leaf-blue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6aa6ec" />
          <stop offset="1" stopColor="#4a7ccb" />
        </linearGradient>
      </defs>
      <path
        d="M29.3 10.0C30.4 9.3 29.7 7.6 29.8 10.5C30.0 13.4 30.4 24.2 30.2 27.2C30.1 30.1 29.7 26.8 28.7 28.0C27.6 29.2 25.3 32.8 23.9 34.3C22.5 35.9 21.1 36.8 20.3 37.3C19.5 37.9 19.4 37.7 19.2 37.6C18.9 37.5 18.7 39.1 18.8 36.6C18.8 34.1 19.1 25.5 19.2 22.8C19.4 20.0 19.2 21.4 19.9 20.0C20.6 18.6 21.7 16.2 23.2 14.5C24.8 12.8 28.2 10.7 29.3 10.0Z"
        fill="#06505b"
      />
      <path
        d="M37.0 21.7C36.6 20.9 36.5 21.1 35.8 21.8C35.0 22.4 33.2 24.1 32.4 25.4C31.6 26.7 31.0 28.6 31.1 29.6C31.2 30.5 32.8 30.7 33.2 31.2C33.5 31.6 34.1 31.0 33.3 32.4C32.5 33.8 31.1 37.1 28.4 39.6C25.8 42.1 20.0 45.2 17.5 47.6C15.0 50.0 15.0 52.5 13.7 53.8C12.4 55.2 11.6 55.1 9.7 55.8C7.8 56.5 3.6 57.5 2.2 58.0C0.9 58.5 1.6 58.6 1.6 58.9C1.5 59.3 0.6 59.9 2.0 60.2C3.4 60.4 7.7 60.7 10.2 60.5C12.8 60.3 15.2 59.8 17.5 59.0C19.8 58.2 21.7 57.4 23.9 55.9C26.1 54.5 28.4 52.8 30.7 50.3C32.9 47.8 36.1 44.9 37.3 40.9C38.6 36.9 38.2 29.5 38.2 26.2C38.1 23.0 37.4 22.4 37.0 21.7Z"
        fill="url(#jenan-leaf-blue)"
      />
      <path
        fillRule="evenodd"
        d="M37.8 1.5C35.8 1.6 28.5 6.9 25.8 8.6C23.2 10.3 23.2 10.5 22.0 11.6C20.8 12.7 19.8 13.6 18.9 15.2C18.1 16.8 17.3 17.2 16.9 21.1C16.5 25.0 16.9 35.4 16.7 38.5C16.5 41.6 17.5 38.8 15.8 39.4C14.0 40.0 8.6 41.2 6.3 42.2C4.1 43.2 3.2 43.9 2.2 45.4C1.1 47.0 0.4 49.3 0.0 51.4C-0.4 53.5 -0.2 56.8 -0.1 58.2C0.0 59.5 0.3 59.3 0.7 59.5C1.0 59.7 2.0 59.6 2.2 59.4C2.3 59.2 1.4 59.9 1.7 58.3C1.9 56.7 2.8 52.0 3.6 49.9C4.3 47.8 5.1 46.9 6.2 45.9C7.4 44.9 8.2 44.8 10.8 43.9C13.3 43.0 19.1 41.6 21.6 40.7C24.1 39.7 24.7 39.1 25.9 38.1C27.2 37.1 28.3 36.5 29.1 34.8C29.8 33.0 29.7 29.2 30.3 27.5C30.9 25.8 32.1 25.0 32.8 24.3C33.4 23.7 33.8 24.2 34.2 23.8C34.5 23.3 34.5 22.2 34.9 21.8C35.3 21.4 36.4 21.6 36.8 21.3C37.1 21.1 37.0 22.7 37.2 20.5C37.5 18.3 38.2 11.4 38.2 8.2C38.3 5.1 39.9 1.4 37.8 1.5ZM29.3 9.9C30.5 9.3 29.8 7.8 29.9 10.7C30.1 13.5 31.2 22.9 30.2 26.8C29.2 30.8 25.7 32.6 23.8 34.4C22.0 36.2 20.1 37.3 19.2 37.7C18.4 38.0 18.7 39.4 18.8 36.5C18.8 33.6 19.0 24.1 19.8 20.4C20.5 16.8 21.6 16.3 23.2 14.6C24.8 12.8 28.2 10.6 29.3 9.9Z"
        fill="url(#jenan-leaf-cyan)"
      />
    </svg>
  );
}
