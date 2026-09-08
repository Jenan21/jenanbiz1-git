import { createClient, type RedisClientType } from "redis";
import type { RateLimitConsumeInput, RateLimitDecision, RateLimitProvider } from "@/lib/rate-limit/contracts";

const consumeScript = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end
return {count, redis.call("PTTL", KEYS[1])}
`;

export class RedisRateLimitProvider implements RateLimitProvider {
  private readonly client: RedisClientType;
  private connecting: Promise<void> | null = null;

  constructor(url: string) {
    this.client = createClient({ url });
    this.client.on("error", (error) => console.error("Redis rate-limit client error", error));
  }

  private async connect() {
    if (this.client.isOpen) return;
    this.connecting ??= this.client.connect()
      .then(() => undefined)
      .finally(() => {
        this.connecting = null;
      });
    await this.connecting;
  }

  async isReady() {
    try {
      await this.connect();
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async consume({ key, limit, windowMs, now = Date.now() }: RateLimitConsumeInput): Promise<RateLimitDecision> {
    await this.connect();
    const result = await this.client.eval(consumeScript, {
      keys: [key],
      arguments: [String(windowMs)],
    });
    if (!Array.isArray(result) || result.length !== 2)
      throw new Error("Redis rate-limit script returned an invalid result");
    const count = Number(result[0]);
    const ttlMs = Number(result[1]);
    const remainingTtlMs = Math.max(0, ttlMs);
    const allowed = count <= limit;
    return {
      allowed,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt: new Date(now + remainingTtlMs),
      retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(remainingTtlMs / 1000)),
    };
  }

  async close() {
    if (this.client.isOpen) await this.client.quit();
  }
}