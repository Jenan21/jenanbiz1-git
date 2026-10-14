import { db } from "@/lib/db";
import { isRateLimitProviderReady } from "@/lib/rate-limit/auth-rate-limit";

export interface ReadinessReport {
  checks: { database: boolean; rateLimit: boolean };
  ready: boolean;
}

/** The probe is open to anyone, so its answer is shared for a few seconds instead of costing a query per request. */
export const READINESS_CACHE_MS = 5_000;
/** A dependency that does not answer within this time counts as down; the probe never hangs. */
export const READINESS_CHECK_TIMEOUT_MS = 4_000;

type Check = () => Promise<boolean>;

function withTimeout(check: Check, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    check().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}

export function createReadinessProbe(options: { checks: { database: Check; rateLimit: Check }; now?: () => number; timeoutMs?: number }) {
  const now = options.now ?? (() => Date.now());
  const timeoutMs = options.timeoutMs ?? READINESS_CHECK_TIMEOUT_MS;
  let cached: { at: number; report: ReadinessReport } | undefined;
  let inFlight: Promise<ReadinessReport> | undefined;

  async function run(): Promise<ReadinessReport> {
    const [database, rateLimit] = await Promise.all([
      withTimeout(options.checks.database, timeoutMs),
      withTimeout(options.checks.rateLimit, timeoutMs),
    ]);
    return { checks: { database, rateLimit }, ready: database && rateLimit };
  }

  return async function readiness(): Promise<ReadinessReport> {
    if (cached && now() - cached.at < READINESS_CACHE_MS) return cached.report;
    // Concurrent callers wait for the same check rather than each starting their own.
    inFlight ??= run()
      .then((report) => {
        cached = { at: now(), report };
        return report;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };
}

export const checkReadiness = createReadinessProbe({
  checks: {
    database: () => db.$queryRaw`SELECT 1`.then(() => true),
    rateLimit: () => isRateLimitProviderReady(),
  },
});
