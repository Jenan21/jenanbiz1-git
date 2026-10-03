import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  checkAuthRateLimit,
  createLocalRateLimitProvider,
  setRateLimitProvider,
} from "@/lib/rate-limit/auth-rate-limit";

function request(ip: string) {
  return new NextRequest("https://app.test/api/auth/login", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("independent authentication rate limits", () => {
  beforeEach(() => setRateLimitProvider(createLocalRateLimitProvider()));

  it("cannot reset an account's attempt budget by rotating IPs or email casing", async () => {
    for (let index = 0; index < 8; index++) {
      expect(
        (
          await checkAuthRateLimit(
            "login",
            request(`192.0.2.${index}`),
            " Owner@Example.Test ",
          )
        ).allowed,
      ).toBe(true);
    }
    const denied = await checkAuthRateLimit(
      "login",
      request("198.51.100.1"),
      "owner@example.test",
    );
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("cannot evade the registration IP budget by rotating emails", async () => {
    for (let index = 0; index < 20; index++) {
      expect(
        (
          await checkAuthRateLimit(
            "register",
            request("192.0.2.1"),
            `user${index}@example.test`,
          )
        ).allowed,
      ).toBe(true);
    }
    expect(
      (
        await checkAuthRateLimit(
          "register",
          request("192.0.2.1"),
          "another@example.test",
        )
      ).allowed,
    ).toBe(false);
    expect(
      (
        await checkAuthRateLimit(
          "register",
          request("192.0.2.2"),
          "independent@example.test",
        )
      ).allowed,
    ).toBe(true);
  });

  it("keeps recovery request and confirmation budgets separate", async () => {
    for (let index = 0; index < 4; index++)
      await checkAuthRateLimit(
        "forgot",
        request("192.0.2.1"),
        "owner@example.test",
      );
    expect(
      (
        await checkAuthRateLimit(
          "forgot",
          request("192.0.2.1"),
          "owner@example.test",
        )
      ).allowed,
    ).toBe(false);
    expect(
      (
        await checkAuthRateLimit(
          "reset",
          request("192.0.2.1"),
          "owner@example.test",
        )
      ).allowed,
    ).toBe(true);
  });

  it("fails closed when the distributed provider denies requests", async () => {
    setRateLimitProvider({
      async isReady() {
        return false;
      },
      async consume(input) {
        return {
          allowed: false,
          limit: input.limit,
          remaining: 0,
          resetAt: new Date(),
          retryAfterSeconds: 60,
        };
      },
    });
    expect(
      (
        await checkAuthRateLimit(
          "login",
          request("192.0.2.1"),
          "owner@example.test",
        )
      ).allowed,
    ).toBe(false);
  });
});
