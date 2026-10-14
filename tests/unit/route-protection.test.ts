import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { publicErrorMessage } from "@/lib/http/safe-error";
import { setRateLimitProvider } from "@/lib/rate-limit/auth-rate-limit";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";
import { enforceRouteRateLimit } from "@/lib/rate-limit/route-rate-limit";

describe("publicErrorMessage", () => {
  let logged: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    logged.mockRestore();
  });

  it("passes through errors that service code raised on purpose", () => {
    expect(publicErrorMessage(new Error("Listing not found"))).toBe("Listing not found");
    expect(logged).not.toHaveBeenCalled();
  });

  it("hides database errors but logs them with a reference", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Invalid `prisma.marketListing.create()` invocation in /var/task/.next/server/chunks/x.js:12", {
      code: "P2000",
      clientVersion: "7.9.1",
    });
    const message = publicErrorMessage(error, "Unable to save the listing");
    expect(message).toMatch(/^Unable to save the listing \(ref [0-9a-f]{8}\)$/);
    expect(message).not.toMatch(/prisma|invocation|\.js/i);
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it("hides runtime errors, stack-like text, SQL and oversized messages", () => {
    for (const error of [
      new TypeError("Cannot read properties of undefined (reading 'id')"),
      new Error("failed at\n    at run (C:/app/services/x.ts:44:9)"),
      new Error("ECONNREFUSED 10.0.0.4:5432"),
      new Error("SELECT * FROM \"User\" WHERE id = 1 failed"),
      new Error("x".repeat(400)),
      new Error("   "),
      "a thrown string",
      null,
    ]) {
      expect(publicErrorMessage(error), String(error)).toMatch(/^The request could not be completed\. \(ref [0-9a-f]{8}\)$/);
    }
  });

  it("does not trust subclasses of Error", () => {
    class Custom extends Error {}
    expect(publicErrorMessage(new Custom("details about internals"))).toMatch(/\(ref [0-9a-f]{8}\)$/);
  });
});

describe("enforceRouteRateLimit", () => {
  beforeEach(() => setRateLimitProvider(new MemoryRateLimitProvider()));

  const request = (ip = "198.51.100.1") => ({ headers: new Headers({ "x-forwarded-for": ip }) });

  it("lets requests through until the budget is spent, then answers 429 with Retry-After", async () => {
    const policy = { scope: "test:heavy", limit: 3, windowMs: 60_000, userId: "user-1" };
    for (let i = 0; i < 3; i += 1) expect(await enforceRouteRateLimit(request(), policy)).toBeNull();
    const blocked = await enforceRouteRateLimit(request(), policy);
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await blocked?.json()).toEqual({ error: "RATE_LIMITED" });
  });

  it("budgets each user and each scope separately", async () => {
    const base = { scope: "test:a", limit: 1, windowMs: 60_000 };
    expect(await enforceRouteRateLimit(request(), { ...base, userId: "u1" })).toBeNull();
    expect((await enforceRouteRateLimit(request(), { ...base, userId: "u1" }))?.status).toBe(429);
    expect(await enforceRouteRateLimit(request(), { ...base, userId: "u2" })).toBeNull();
    expect(await enforceRouteRateLimit(request(), { ...base, scope: "test:b", userId: "u1" })).toBeNull();
  });

  it("counts anonymous callers by client address", async () => {
    const policy = { scope: "test:anon", limit: 1, windowMs: 60_000 };
    expect(await enforceRouteRateLimit(request("203.0.113.1"), policy)).toBeNull();
    expect((await enforceRouteRateLimit(request("203.0.113.1"), policy))?.status).toBe(429);
    expect(await enforceRouteRateLimit(request("203.0.113.2"), policy)).toBeNull();
  });
});
