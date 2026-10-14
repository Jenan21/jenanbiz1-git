import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type {
  RateLimitDecision,
  RateLimitProvider,
} from "@/lib/rate-limit/contracts";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";
import { RedisRateLimitProvider } from "@/lib/rate-limit/redis-provider";
import { clientAddress } from "@/lib/security/site-gate";

export type AuthRateLimitRoute = "forgot" | "login" | "oauth" | "register" | "reset";

interface Policy {
  limit: number;
  windowMs: number;
}

// Three independent budgets: one client for one account (tight), one client across every account, and one account
// across every client. Each closes a way around the others: spraying many accounts from one address, rotating
// addresses against one account, and mass registration.
const perAddressAndAccount: Record<AuthRateLimitRoute, Policy> = {
  forgot: { limit: 4, windowMs: 60_000 },
  login: { limit: 8, windowMs: 60_000 },
  oauth: { limit: 20, windowMs: 60_000 },
  register: { limit: 4, windowMs: 60_000 },
  reset: { limit: 8, windowMs: 60_000 },
};

const perAddress: Record<AuthRateLimitRoute, Policy> = {
  forgot: { limit: 20, windowMs: 3_600_000 },
  login: { limit: 60, windowMs: 600_000 },
  oauth: { limit: 60, windowMs: 60_000 },
  register: { limit: 30, windowMs: 3_600_000 },
  reset: { limit: 30, windowMs: 3_600_000 },
};

const perAccount: Partial<Record<AuthRateLimitRoute, Policy>> = {
  forgot: { limit: 5, windowMs: 3_600_000 },
  login: { limit: 30, windowMs: 900_000 },
  register: { limit: 6, windowMs: 3_600_000 },
  reset: { limit: 10, windowMs: 3_600_000 },
};

const globalForRateLimit = globalThis as typeof globalThis & {
  jenanRateLimitProvider?: RateLimitProvider;
};

export function createLocalRateLimitProvider() {
  return new MemoryRateLimitProvider();
}

class UnavailableRateLimitProvider implements RateLimitProvider {
  async consume(input: { limit: number; windowMs: number }) {
    return {
      allowed: false,
      limit: input.limit,
      remaining: 0,
      resetAt: new Date(Date.now() + input.windowMs),
      retryAfterSeconds: Math.max(1, Math.ceil(input.windowMs / 1_000)),
      degraded: true,
    };
  }

  async isReady() {
    return false;
  }
}

export function setRateLimitProvider(provider: RateLimitProvider) {
  globalForRateLimit.jenanRateLimitProvider = provider;
}

export function getRateLimitProvider(): RateLimitProvider {
  if (globalForRateLimit.jenanRateLimitProvider)
    return globalForRateLimit.jenanRateLimitProvider;
  const redisUrl = process.env.REDIS_URL?.trim();
  const provider = redisUrl
    ? new RedisRateLimitProvider(redisUrl)
    : process.env.NODE_ENV === "production"
      ? new UnavailableRateLimitProvider()
      : createLocalRateLimitProvider();
  globalForRateLimit.jenanRateLimitProvider = provider;
  return provider;
}

export async function isRateLimitProviderReady() {
  return getRateLimitProvider().isReady();
}

const digestOf = (value: string) => createHash("sha256").update(value).digest("hex");

function normalizedEmailOf(email?: unknown) {
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
}

function requestIdentity(request: NextRequest, email?: unknown) {
  return digestOf(`${clientAddress(request.headers)}:${normalizedEmailOf(email) ?? "unknown"}`);
}

export async function checkAuthRateLimit(
  route: AuthRateLimitRoute,
  request: NextRequest,
  email?: unknown,
): Promise<RateLimitDecision> {
  const provider = getRateLimitProvider();
  const address = digestOf(clientAddress(request.headers));
  const account = normalizedEmailOf(email);
  const accountPolicy = perAccount[route];
  const decisions = await Promise.all([
    provider.consume({ key: `auth:${route}:${requestIdentity(request, email)}`, ...perAddressAndAccount[route] }),
    provider.consume({ key: `auth:${route}:ip:${address}`, ...perAddress[route] }),
    account && accountPolicy
      ? provider.consume({ key: `auth:${route}:acct:${digestOf(account)}`, ...accountPolicy })
      : Promise.resolve(null),
  ]);
  const denied = decisions.filter((decision): decision is RateLimitDecision => decision !== null && !decision.allowed);
  if (denied.length === 0) return decisions[0] as RateLimitDecision;
  // Report the longest wait: the caller is blocked until every exhausted budget has recovered.
  return denied.reduce((worst, next) => (next.retryAfterSeconds > worst.retryAfterSeconds ? next : worst));
}
