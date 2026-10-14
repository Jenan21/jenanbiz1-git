const WEAK_SSL_MODES = new Set(["require", "prefer", "verify-ca"]);

/**
 * `pg` currently treats sslmode=require/prefer/verify-ca as verify-full, but its next major version follows libpq,
 * where those modes encrypt the connection without checking the server certificate. That would silently open the
 * door to a man-in-the-middle, so the strong mode is pinned here instead of depending on the library default.
 * Other modes (disable, allow, verify-full) and URLs that opt into libpq semantics explicitly are left untouched.
 */
export function normalizeDatabaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return raw;
  const mode = url.searchParams.get("sslmode");
  if (!mode || url.searchParams.has("uselibpqcompat") || !WEAK_SSL_MODES.has(mode)) return raw;
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}
