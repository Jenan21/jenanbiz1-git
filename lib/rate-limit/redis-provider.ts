import { createClient } from "redis";
import type { RateLimitConsumeInput, RateLimitDecision, RateLimitProvider } from "@/lib/rate-limit/contracts";

function deniedDecision(input: RateLimitConsumeInput) {
  const now = input.now ?? Date.now();
  return {
    allowed: false,
    limit: input.limit,
    remaining: 0,
    resetAt: new Date(now + input.windowMs),
    retryAfterSeconds: Math.max(1, Math.ceil(input.windowMs / 1_000)),
  } satisfies RateLimitDecision;
}

export class RedisRateLimitProvider implements RateLimitProvider {
  private readonly client;
  private connection?: Promise<void>;

  constructor(url: string) {
    this.client = createClient({ url });
    this.client.on("error", () => undefined);
  }

  private async connect() {
    if (this.client.isOpen) return;
    if (!this.connection) {
      this.connection = this.client.connect()
        .then(() => undefined)
        .finally(() => {
          this.connection = undefined;
        });
    }
    await this.connection;
  }

  async isReady() {
    try {
      await this.connect();
      return this.client.isReady;
    } catch {
      return false;
    }
  }

  async consume(input: RateLimitConsumeInput): Promise<RateLimitDecision> {
    try {
      await this.connect();
      const result = await this.client.eval(
        "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); end; local ttl = redis.call('PTTL', KEYS[1]); return {count, ttl};",
        { keys: [input.key], arguments: [String(input.windowMs)] },
      ) as [number, number];
      const count = Number(result[0]);
      const ttl = Math.max(0, Number(result[1]));
      const allowed = count <= input.limit;
      return {
        allowed,
        limit: input.limit,
        remaining: Math.max(0, input.limit - count),
        resetAt: new Date(Date.now() + ttl),
        retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(ttl / 1_000)),
      };
    } catch {
      return deniedDecision(input);
    }
  }
}