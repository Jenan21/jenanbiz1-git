import { describe, expect, it } from "vitest";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";
import {
  GATE_COOKIE_MAX_AGE_SECONDS,
  clientAddress,
  credentialsMatch,
  credentialsMatchToken,
  expectedAuthorization,
  failureKey,
  gateKey,
  safeEqual,
  signGateCookie,
  verifyGateCookie,
} from "@/lib/security/site-gate";

describe("site gate helpers", () => {
  it("compares in constant time and handles different lengths", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("secret", "secret-longer")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });

  it("builds the Basic header as UTF-8 and matches it", () => {
    expect(expectedAuthorization("a", "b")).toBe(`Basic ${Buffer.from("a:b").toString("base64")}`);
    expect(credentialsMatch(expectedAuthorization("جنان", "سر"), "جنان", "سر")).toBe(true);
    expect(credentialsMatch(null, "a", "b")).toBe(false);
    expect(credentialsMatch("Basic Zm9vOmJhcg==", "a", "b")).toBe(false);
  });

  it("checks a bearer token in constant time", () => {
    expect(credentialsMatchToken("Bearer s3cret-token", "s3cret-token")).toBe(true);
    expect(credentialsMatchToken("Bearer s3cret-token ", "s3cret-token")).toBe(false);
    expect(credentialsMatchToken("bearer s3cret-token", "s3cret-token")).toBe(false);
    expect(credentialsMatchToken("s3cret-token", "s3cret-token")).toBe(false);
    expect(credentialsMatchToken(null, "s3cret-token")).toBe(false);
    expect(credentialsMatchToken("Bearer wrong", "s3cret-token")).toBe(false);
  });

  it("signs a cookie that verifies only with the same key, inside its lifetime", () => {
    const key = gateKey("user", "pass");
    const now = 1_800_000_000_000;
    const cookie = signGateCookie(key, now);
    expect(verifyGateCookie(key, cookie, now)).toBe(true);
    expect(verifyGateCookie(key, cookie, now + (GATE_COOKIE_MAX_AGE_SECONDS - 1) * 1000)).toBe(true);
    expect(verifyGateCookie(key, cookie, now + (GATE_COOKIE_MAX_AGE_SECONDS + 5) * 1000)).toBe(false);
    expect(verifyGateCookie(key, cookie, now - 60_000)).toBe(false);
    expect(verifyGateCookie(gateKey("user", "other"), cookie, now)).toBe(false);
    expect(verifyGateCookie(key, undefined, now)).toBe(false);
    expect(verifyGateCookie(key, `${cookie}0`, now)).toBe(false);
  });

  it("separates credentials that would concatenate to the same string", () => {
    expect(gateKey("ab", "c").equals(gateKey("a", "bc"))).toBe(false);
  });

  it("reads the client address from the platform header first", () => {
    const headers = (entries: Record<string, string>) => new Headers(entries);
    expect(clientAddress(headers({ "x-vercel-forwarded-for": "203.0.113.5", "x-forwarded-for": "10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientAddress(headers({ "x-forwarded-for": "198.51.100.2, 10.0.0.1" }))).toBe("198.51.100.2");
    expect(clientAddress(headers({ "x-real-ip": "192.0.2.9" }))).toBe("192.0.2.9");
    expect(clientAddress(headers({}))).toBe("unknown");
  });

  it("derives an opaque, stable failure key per address", () => {
    expect(failureKey("203.0.113.5")).toBe(failureKey("203.0.113.5"));
    expect(failureKey("203.0.113.5")).not.toBe(failureKey("203.0.113.6"));
    expect(failureKey("203.0.113.5")).not.toContain("203.0.113.5");
  });
});

describe("rate limit peek", () => {
  it("reads the counter without consuming a slot", async () => {
    const provider = new MemoryRateLimitProvider();
    const input = { key: "k", limit: 2, windowMs: 60_000, now: 1_000 };
    expect((await provider.peek(input)).allowed).toBe(true);
    expect((await provider.peek(input)).remaining).toBe(2);
    await provider.consume(input);
    await provider.consume(input);
    const blocked = await provider.peek(input);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect((await provider.peek({ ...input, now: 1_000 + 61_000 })).allowed).toBe(true);
  });
});
