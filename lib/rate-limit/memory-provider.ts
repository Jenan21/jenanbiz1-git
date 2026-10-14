import type {
  RateLimitConsumeInput,
  RateLimitDecision,
  RateLimitProvider,
} from "@/lib/rate-limit/contracts";

interface Entry {
  count: number;
  resetAtMs: number;
}

export class MemoryRateLimitProvider implements RateLimitProvider {
  private readonly entries = new Map<string, Entry>();

  async isReady() {
    return true;
  }

  async peek({
    key,
    limit,
    windowMs,
    now = Date.now(),
  }: RateLimitConsumeInput): Promise<RateLimitDecision> {
    const entry = this.entries.get(key);
    const live = entry && entry.resetAtMs > now ? entry : undefined;
    const count = live?.count ?? 0;
    const allowed = count < limit;
    const resetAtMs = live?.resetAtMs ?? now + windowMs;
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt: new Date(resetAtMs),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((resetAtMs - now) / 1000)),
    };
  }

  async consume({
    key,
    limit,
    windowMs,
    now = Date.now(),
  }: RateLimitConsumeInput): Promise<RateLimitDecision> {
    const existing = this.entries.get(key);
    const entry =
      !existing || existing.resetAtMs <= now
        ? { count: 0, resetAtMs: now + windowMs }
        : existing;
    entry.count += 1;
    this.entries.set(key, entry);
    const allowed = entry.count <= limit;
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - entry.count),
      resetAt: new Date(entry.resetAtMs),
      retryAfterSeconds: allowed
        ? 0
        : Math.max(1, Math.ceil((entry.resetAtMs - now) / 1000)),
    };
  }

  clear() {
    this.entries.clear();
  }
}
