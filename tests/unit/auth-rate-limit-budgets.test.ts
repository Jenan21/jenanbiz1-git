import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { checkAuthRateLimit, setRateLimitProvider } from "@/lib/rate-limit/auth-rate-limit";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";

function request(headers: Record<string, string>) {
  return new NextRequest("https://app.example.com/api/auth/login", { headers });
}

const from = (ip: string) => request({ "x-forwarded-for": ip });

describe("auth rate limit budgets", () => {
  beforeEach(() => setRateLimitProvider(new MemoryRateLimitProvider()));

  it("keeps the tight budget for one client trying one account", async () => {
    let denied = 0;
    for (let i = 0; i < 12; i += 1) if (!(await checkAuthRateLimit("login", from("198.51.100.1"), "a@example.com")).allowed) denied += 1;
    expect(denied).toBe(4); // 8 per minute for the same address and account
  });

  it("limits one address that sprays many accounts", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 70; i += 1) results.push((await checkAuthRateLimit("login", from("198.51.100.2"), `user${i}@example.com`)).allowed);
    expect(results.slice(0, 60).every(Boolean)).toBe(true);
    expect(results.slice(60).every((allowed) => !allowed)).toBe(true);
  });

  it("limits one account attacked from many addresses", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 40; i += 1) results.push((await checkAuthRateLimit("login", from(`203.0.113.${i + 1}`), "victim@example.com")).allowed);
    expect(results.slice(0, 30).every(Boolean)).toBe(true);
    expect(results.slice(30).every((allowed) => !allowed)).toBe(true);
  });

  it("ignores letter case and spaces in the account when counting", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 8; i += 1) {
      results.push((await checkAuthRateLimit("forgot", from(`203.0.113.${i + 1}`), i % 2 ? " Victim@Example.com " : "victim@example.com")).allowed);
    }
    // five password-recovery requests per account per hour, wherever they come from
    expect(results.slice(0, 5).every(Boolean)).toBe(true);
    expect(results.slice(5).every((allowed) => !allowed)).toBe(true);
  });

  it("caps mass registration from one address", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 34; i += 1) {
      results.push((await checkAuthRateLimit("register", from("198.51.100.9"), `new${i}@example.com`)).allowed);
    }
    // distinct accounts never trip the per-account budgets; the per-address hourly budget (30) does
    expect(results.filter(Boolean)).toHaveLength(30);
    expect(results.slice(30).every((allowed) => !allowed)).toBe(true);
  });

  it("trusts the platform's forwarded address over a client-supplied header", async () => {
    // the client rotates X-Forwarded-For, the platform header stays the same: still one client
    let denied = 0;
    for (let i = 0; i < 12; i += 1) {
      const decision = await checkAuthRateLimit(
        "login",
        request({ "x-vercel-forwarded-for": "198.51.100.77", "x-forwarded-for": `10.0.0.${i + 1}` }),
        "same@example.com",
      );
      if (!decision.allowed) denied += 1;
    }
    expect(denied).toBe(4);
  });

  it("answers with the longest wait among the exhausted budgets", async () => {
    for (let i = 0; i < 31; i += 1) await checkAuthRateLimit("login", from(`203.0.113.${i + 1}`), "wait@example.com");
    const decision = await checkAuthRateLimit("login", from("203.0.113.200"), "wait@example.com");
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterSeconds).toBeGreaterThan(60); // the per-account window is 15 minutes
  });
});
