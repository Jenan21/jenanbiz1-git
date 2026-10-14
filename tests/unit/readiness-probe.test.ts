import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { $queryRaw: vi.fn() } }));
vi.mock("@/lib/rate-limit/auth-rate-limit", () => ({ isRateLimitProviderReady: vi.fn() }));

import { createReadinessProbe, READINESS_CACHE_MS } from "@/lib/health/readiness";

describe("readiness probe", () => {
  it("answers many concurrent callers with one check of each dependency", async () => {
    const database = vi.fn(async () => true);
    const rateLimit = vi.fn(async () => true);
    const probe = createReadinessProbe({ checks: { database, rateLimit } });
    const reports = await Promise.all(Array.from({ length: 200 }, () => probe()));
    expect(reports.every((report) => report.ready)).toBe(true);
    expect(database).toHaveBeenCalledTimes(1);
    expect(rateLimit).toHaveBeenCalledTimes(1);
  });

  it("serves the last answer for a few seconds and then checks again", async () => {
    let clock = 1_000;
    const database = vi.fn(async () => true);
    const probe = createReadinessProbe({ checks: { database, rateLimit: async () => true }, now: () => clock });
    await probe();
    clock += READINESS_CACHE_MS - 1;
    await probe();
    expect(database).toHaveBeenCalledTimes(1);
    clock += 2;
    await probe();
    expect(database).toHaveBeenCalledTimes(2);
  });

  it("reports a dependency that fails or never answers as down, without hanging", async () => {
    const probe = createReadinessProbe({
      checks: { database: () => new Promise<boolean>(() => undefined), rateLimit: async () => { throw new Error("redis down"); } },
      timeoutMs: 30,
    });
    const report = await probe();
    expect(report).toEqual({ checks: { database: false, rateLimit: false }, ready: false });
  });

  it("recovers on the next check after an outage", async () => {
    let clock = 0;
    let up = false;
    const probe = createReadinessProbe({ checks: { database: async () => up, rateLimit: async () => true }, now: () => clock });
    expect((await probe()).ready).toBe(false);
    up = true;
    clock += READINESS_CACHE_MS + 1;
    expect((await probe()).ready).toBe(true);
  });
});
