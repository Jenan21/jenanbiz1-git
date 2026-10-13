/** Client-safe constants shared by the sign-in panels and the OAuth routes. No Node-only imports here. */

export const OAUTH_PROVIDERS = ["google", "apple"] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];

export const OAUTH_PROVIDER_LABEL: Record<OAuthProviderId, string> = {
  google: "Google",
  apple: "Apple",
};

export const OAUTH_ERROR_CODES = [
  "unavailable",
  "denied",
  "failed",
  "email_unverified",
  "email_missing",
  "account_exists",
  "registration_closed",
  "account_disabled",
  "rate_limited",
] as const;
export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

export type OAuthEntryPoint = "login" | "register";

export function isOAuthProviderId(value: unknown): value is OAuthProviderId {
  return typeof value === "string" && (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

export function isOAuthErrorCode(value: unknown): value is OAuthErrorCode {
  return typeof value === "string" && (OAUTH_ERROR_CODES as readonly string[]).includes(value);
}

/** Only same-site absolute paths may be used as a post-sign-in destination. */
export function sanitizeNextPath(value: string | null | undefined): string | null {
  if (!value || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

export function oauthStartPath(
  provider: OAuthProviderId,
  options: { from: OAuthEntryPoint; next?: string | null },
) {
  const query = new URLSearchParams({ from: options.from });
  const next = sanitizeNextPath(options.next);
  if (next) query.set("next", next);
  return `/api/auth/oauth/${provider}/start?${query.toString()}`;
}

/** Where a failed attempt lands: back on the panel the user started from, with a short error code. */
export function oauthErrorPath(
  entry: OAuthEntryPoint,
  provider: OAuthProviderId,
  code: OAuthErrorCode,
  next?: string | null,
) {
  const query = new URLSearchParams({ oauth_error: code, oauth_provider: provider });
  const safeNext = sanitizeNextPath(next);
  if (safeNext) query.set("next", safeNext);
  return `/${entry}?${query.toString()}`;
}

export const OAUTH_NOTICE_COPY = {
  ar: {
    unavailable: "الدخول عبر {p} غير مفعّل بعد.",
    denied: "تم إلغاء الدخول عبر {p}.",
    failed: "تعذّر إكمال الدخول عبر {p}. حاول مجدداً.",
    email_unverified: "بريدك في {p} غير مؤكَّد.",
    email_missing: "لم يشارك {p} بريدك الإلكتروني.",
    account_exists: "البريد مسجّل بكلمة مرور. ادخل بها أو استعدها.",
    registration_closed: "التسجيل الجديد مغلق حالياً.",
    account_disabled: "الحساب غير متاح حاليًا.",
    rate_limited: "محاولات كثيرة. انتظر قليلاً.",
  },
  en: {
    unavailable: "{p} sign-in isn't enabled yet.",
    denied: "{p} sign-in was cancelled.",
    failed: "Couldn't complete {p} sign-in. Try again.",
    email_unverified: "Your {p} email isn't verified.",
    email_missing: "{p} didn't share your email.",
    account_exists: "This email has a password account. Sign in with it or reset it.",
    registration_closed: "New registration is currently closed.",
    account_disabled: "This account is currently unavailable.",
    rate_limited: "Too many attempts. Wait briefly.",
  },
} as const satisfies Record<"ar" | "en", Record<OAuthErrorCode, string>>;

export function oauthNotice(
  locale: "ar" | "en",
  code: string | null,
  provider: string | null,
): string | null {
  if (!isOAuthErrorCode(code)) return null;
  const label = isOAuthProviderId(provider) ? OAUTH_PROVIDER_LABEL[provider] : "";
  return OAUTH_NOTICE_COPY[locale][code].replace("{p}", label).replace(/\s{2,}/g, " ").trim();
}
