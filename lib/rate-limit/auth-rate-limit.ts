import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type {
  RateLimitDecision,
  RateLimitProvider,
} from "@/lib/rate-limit/contracts";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";

export type AuthRateLimitRoute = "login" | "register";

const policies: Record<
  AuthRateLimitRoute,
  { limit: number; windowMs: number }
> = {
  login: { limit: 8, windowMs: 60_000 },
  register: { limit: 4, windowMs: 60_000 },
};

const globalForRateLimit = globalThis as typeof globalThis & {
  jenanRateLimitProvider?: RateLimitProvider;
};

export function createLocalRateLimitProvider() {
  return new MemoryRateLimitProvider();
}

export function setRateLimitProvider(provider: RateLimitProvider) {
  globalForRateLimit.jenanRateLimitProvider = provider;
}

export function getRateLimitProvider() {
  if (globalForRateLimit.jenanRateLimitProvider)
    return globalForRateLimit.jenanRateLimitProvider;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "A distributed RateLimitProvider must be configured in production",
    );
  }
  const provider = createLocalRateLimitProvider();
  globalForRateLimit.jenanRateLimitProvider = provider;
  return provider;
}

function requestIdentity(request: NextRequest, email?: unknown) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "unknown";
  return createHash("sha256").update(`${ip}:${normalizedEmail}`).digest("hex");
}

export async function checkAuthRateLimit(
  route: AuthRateLimitRoute,
  request: NextRequest,
  email?: unknown,
): Promise<RateLimitDecision> {
  return getRateLimitProvider().consume({
    key: `auth:${route}:${requestIdentity(request, email)}`,
    ...policies[route],
  });
}
