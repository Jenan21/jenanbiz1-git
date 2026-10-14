import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, proxy } from "@/proxy";
import { setRateLimitProvider } from "@/lib/rate-limit/auth-rate-limit";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";
import {
  GATE_COOKIE,
  GATE_FAILURE_LIMIT,
  expectedAuthorization,
  gateKey,
  signGateCookie,
} from "@/lib/security/site-gate";

const origin = "https://app.example.com";
const basic = (user: string, pass: string) => expectedAuthorization(user, pass);

function request(path = "/", init: { authorization?: string; cookie?: string; ip?: string } = {}) {
  const headers = new Headers();
  if (init.authorization) headers.set("authorization", init.authorization);
  if (init.cookie) headers.set("cookie", init.cookie);
  headers.set("x-forwarded-for", init.ip ?? "198.51.100.10");
  return new NextRequest(`${origin}${path}`, { headers });
}

describe("private site access", () => {
  beforeEach(() => {
    setRateLimitProvider(new MemoryRateLimitProvider());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stays disabled when no access credentials are configured", async () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "");
    expect((await proxy(request())).status).toBe(200);
  });

  it("refuses a production deployment without the gate until the public launch is approved", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SITE_ACCESS_USERNAME", "");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "");
    for (const approval of ["", "true", "yes", "approve"]) {
      vi.stubEnv("PUBLIC_LAUNCH", approval);
      expect((await proxy(request("/login"))).status, `PUBLIC_LAUNCH=${approval}`).toBe(503);
    }
    vi.stubEnv("PUBLIC_LAUNCH", "approved");
    expect((await proxy(request("/login"))).status).toBe(200);
  });

  it("keeps the gate in force in production even when the launch is approved", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_LAUNCH", "approved");
    vi.stubEnv("SITE_ACCESS_USERNAME", "jenanpro");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "private-password");
    expect((await proxy(request("/register"))).status).toBe(401);
  });

  it("fails closed when protection is only partially configured", async () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "jenanpro");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "");
    expect((await proxy(request())).status).toBe(503);
  });

  it("challenges invalid credentials and accepts the configured pair", async () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "jenanpro");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "private-password");
    const unauthorized = await proxy(request());
    const wrong = await proxy(request("/", { authorization: basic("jenanpro", "wrong") }));
    const authorized = await proxy(request("/", { authorization: basic("jenanpro", "private-password") }));

    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("Jenan PRO Private Preview");
    expect(wrong.status).toBe(401);
    expect(authorized.status).toBe(200);
  });

  it("accepts credentials with characters outside Latin-1, as the UTF-8 challenge promises", async () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "جنان");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "كلمة-مرور-سرية-٢٠٢٦");
    const response = await proxy(request("/", { authorization: basic("جنان", "كلمة-مرور-سرية-٢٠٢٦") }));
    expect(response.status).toBe(200);
  });

  it("remembers a successful sign-in in a signed, HttpOnly cookie that later requests can use alone", async () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "jenanpro");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "private-password");
    const first = await proxy(request("/", { authorization: basic("jenanpro", "private-password") }));
    const cookie = first.cookies.get(GATE_COOKIE);
    expect(cookie?.value).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(first.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(first.headers.get("set-cookie")).toMatch(/SameSite=lax/i);

    const next = await proxy(request("/dashboard", { cookie: `${GATE_COOKIE}=${cookie?.value}` }));
    expect(next.status).toBe(200);
    expect(next.headers.get("set-cookie")).toBeNull();
  });

  it("rejects forged, expired and rotated-password cookies", async () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "jenanpro");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "private-password");
    const key = gateKey("jenanpro", "private-password");
    const stale = signGateCookie(key, Date.now() - 13 * 60 * 60 * 1000);
    const forged = signGateCookie(gateKey("jenanpro", "guess"), Date.now());
    for (const value of [stale, forged, "garbage", "1.abc"]) {
      expect((await proxy(request("/", { cookie: `${GATE_COOKIE}=${value}` }))).status, value).toBe(401);
    }

    const issued = signGateCookie(key, Date.now());
    vi.stubEnv("SITE_ACCESS_PASSWORD", "a-new-private-password");
    expect((await proxy(request("/", { cookie: `${GATE_COOKIE}=${issued}` }))).status).toBe(401);
  });

  it("stops evaluating credentials after too many wrong guesses, even a correct one", async () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "jenanpro");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "private-password");
    for (let attempt = 0; attempt < GATE_FAILURE_LIMIT; attempt += 1) {
      expect((await proxy(request("/", { authorization: basic("jenanpro", `guess-${attempt}`) }))).status).toBe(401);
    }
    const blockedWrong = await proxy(request("/", { authorization: basic("jenanpro", "guess-more") }));
    const blockedRight = await proxy(request("/", { authorization: basic("jenanpro", "private-password") }));
    expect(blockedWrong.status).toBe(429);
    expect(blockedRight.status).toBe(429);
    expect(Number(blockedRight.headers.get("retry-after"))).toBeGreaterThan(0);

    // another client is unaffected, and a request without credentials still gets the plain challenge
    const other = await proxy(request("/", { authorization: basic("jenanpro", "private-password"), ip: "203.0.113.77" }));
    expect(other.status).toBe(200);
    expect((await proxy(request("/"))).status).toBe(401);
  });

  it("does not count requests that carry no credentials", async () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "jenanpro");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "private-password");
    for (let i = 0; i < GATE_FAILURE_LIMIT * 3; i += 1) expect((await proxy(request("/"))).status).toBe(401);
    expect((await proxy(request("/", { authorization: basic("jenanpro", "private-password") }))).status).toBe(200);
  });

  it("keeps the site reachable for the owner when the throttle store is down", async () => {
    vi.stubEnv("SITE_ACCESS_USERNAME", "jenanpro");
    vi.stubEnv("SITE_ACCESS_PASSWORD", "private-password");
    const down = {
      async consume() {
        throw new Error("redis unavailable");
      },
      async peek() {
        return { allowed: false, limit: 10, remaining: 0, resetAt: new Date(), retryAfterSeconds: 60, degraded: true };
      },
      async isReady() {
        return false;
      },
    };
    setRateLimitProvider(down);
    expect((await proxy(request("/", { authorization: basic("jenanpro", "private-password") }))).status).toBe(200);
    expect((await proxy(request("/", { authorization: basic("jenanpro", "wrong") }))).status).toBe(401);
  });
});

describe("private site access coverage", () => {
  const covered = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

  it("covers the public page, sign-in, registration, recovery, OAuth and the application", () => {
    for (const path of [
      "/",
      "/login",
      "/register",
      "/auth",
      "/auth/forgot",
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/forgot",
      "/api/auth/oauth/google/start",
      "/api/auth/oauth/apple/callback",
      "/api/platform/activity",
      "/api/metrics",
      "/dashboard",
      "/assets/jenan-pro-logo.jpg",
    ]) {
      expect(covered(path), `${path} must stay behind the private gate`).toBe(true);
    }
  });

  it("leaves only the health probes and framework assets open", () => {
    for (const path of [
      "/api/health/live",
      "/api/health/ready",
      "/_next/static/chunks/app.js",
      "/_next/image",
      "/favicon.ico",
      "/icon.png",
      "/apple-icon.png",
    ]) {
      expect(covered(path), `${path} is meant to be open`).toBe(false);
    }
  });
});
