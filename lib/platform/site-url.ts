import { PRODUCTION_ORIGIN } from "@/config/site";

const localSiteUrl = "http://localhost:3000";

/**
 * The public origin the site is served from; page metadata (canonical and Open Graph URLs) is resolved against it.
 * A production deployment that was not given an origin uses the official domain instead of the local address.
 */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): URL {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(new URL(configured).origin);
    } catch {
      // A malformed value must not fail the build; it falls back to the default origin.
    }
  }
  return new URL(env.VERCEL_ENV === "production" ? PRODUCTION_ORIGIN : localSiteUrl);
}
