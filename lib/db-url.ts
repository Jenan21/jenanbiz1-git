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

export interface DatabasePoolSettings {
  allowExitOnIdle: boolean;
  /** A caller that cannot get a connection this quickly is refused instead of waiting without limit. */
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  idle_in_transaction_session_timeout: number;
  max: number;
  /** A query that runs longer than this is cancelled by the server, so a slow statement cannot hold a connection forever. */
  query_timeout: number;
  statement_timeout: number;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

/**
 * Connection pool limits. A serverless instance keeps a few connections because many instances run side by side
 * and the pooled database endpoint multiplexes them; a long-running server can hold more. `DATABASE_POOL_MAX` overrides.
 */
export function databasePoolSettings(env: Record<string, string | undefined> = process.env): DatabasePoolSettings {
  const serverless = env.VERCEL === "1";
  return {
    allowExitOnIdle: serverless,
    connectionTimeoutMillis: boundedInteger(env.DATABASE_CONNECT_TIMEOUT_MS, 8_000, 500, 60_000),
    idleTimeoutMillis: 30_000,
    idle_in_transaction_session_timeout: 30_000,
    max: boundedInteger(env.DATABASE_POOL_MAX, serverless ? 5 : 20, 1, 100),
    query_timeout: boundedInteger(env.DATABASE_QUERY_TIMEOUT_MS, 30_000, 1_000, 300_000),
    statement_timeout: boundedInteger(env.DATABASE_QUERY_TIMEOUT_MS, 30_000, 1_000, 300_000),
  };
}
