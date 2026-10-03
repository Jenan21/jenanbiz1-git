import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";

const provider = new MemoryRateLimitProvider();

vi.mock("@/lib/rate-limit/auth-rate-limit", () => ({
  getRateLimitProvider: () => provider,
}));

import { checkProjectRateLimit } from "@/lib/rate-limit/project-rate-limit";

describe("project rate limits", () => {
  it("applies a narrower request budget to geographic intelligence", async () => {
    const request = new NextRequest("http://localhost/api/projects", { headers: { "x-real-ip": "192.0.2.10" } });
    for (let index = 0; index < 8; index += 1) {
      expect((await checkProjectRateLimit("intelligence", request, "user-intelligence")).allowed).toBe(true);
    }
    await expect(checkProjectRateLimit("intelligence", request, "user-intelligence")).resolves.toMatchObject({ allowed: false, retryAfterSeconds: expect.any(Number) });
  });

  it("keeps budgets isolated by project operation", async () => {
    const request = new NextRequest("http://localhost/api/projects", { headers: { "x-real-ip": "192.0.2.11" } });
    await checkProjectRateLimit("start", request, "user-operations");
    await expect(checkProjectRateLimit("assessment", request, "user-operations")).resolves.toMatchObject({ allowed: true });
  });
});