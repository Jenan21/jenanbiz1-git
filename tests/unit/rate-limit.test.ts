import { describe, expect, it } from "vitest";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";

describe("MemoryRateLimitProvider", () => {
  it("allows requests inside a window then returns a retry delay", async () => {
    const provider = new MemoryRateLimitProvider();
    const input = { key: "login:test", limit: 2, windowMs: 1_000, now: 100 };
    expect((await provider.consume(input)).allowed).toBe(true);
    expect((await provider.consume(input)).remaining).toBe(0);
    expect(await provider.consume(input)).toMatchObject({
      allowed: false,
      retryAfterSeconds: 1,
    });
  });

  it("starts a fresh counter after the window expires", async () => {
    const provider = new MemoryRateLimitProvider();
    await provider.consume({
      key: "register:test",
      limit: 1,
      windowMs: 50,
      now: 0,
    });
    expect(
      (
        await provider.consume({
          key: "register:test",
          limit: 1,
          windowMs: 50,
          now: 51,
        })
      ).allowed,
    ).toBe(true);
  });
});
