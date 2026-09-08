import { afterEach, describe, expect, it } from "vitest";
import { RedisRateLimitProvider } from "@/lib/rate-limit/redis-provider";

const redisUrl = process.env.REDIS_URL;
const provider = redisUrl ? new RedisRateLimitProvider(redisUrl) : null;

describe("Redis rate limit integration", () => {
  afterEach(async () => {
    await provider?.close();
  });

  it.skipIf(!provider)("enforces an atomic shared limit", async () => {
    const key = `test:rate-limit:${crypto.randomUUID()}`;
    expect(await provider!.isReady()).toBe(true);
    expect((await provider!.consume({ key, limit: 2, windowMs: 60_000 })).allowed).toBe(true);
    expect((await provider!.consume({ key, limit: 2, windowMs: 60_000 })).remaining).toBe(0);
    const rejected = await provider!.consume({ key, limit: 2, windowMs: 60_000 });
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
  });
});