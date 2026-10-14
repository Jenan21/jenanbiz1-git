import { sanitizeNextPath } from "@/lib/auth/oauth/shared";

/**
 * Where to send a person once they have signed in. Only a same-site path survives: anything that could be read as
 * another origin (`//host`, `/\host`, tabs or line breaks the URL parser silently drops, absolute URLs) falls back.
 */
export function resolvePostSignInPath(
  requested: string | null | undefined,
  origin: string,
  fallback = "/dashboard",
): string {
  const next = sanitizeNextPath(requested);
  if (!next) return fallback;
  try {
    const base = new URL(origin);
    const target = new URL(next, base);
    if (target.origin !== base.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
