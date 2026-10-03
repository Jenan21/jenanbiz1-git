import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  databaseQuery: vi.fn(),
  organizationsCount: vi.fn(),
  rateLimitReady: vi.fn(),
  robotsCount: vi.fn(),
  tasksCount: vi.fn(),
  usersCount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: mocks.databaseQuery,
    organization: { count: mocks.organizationsCount },
    robot: { count: mocks.robotsCount },
    robotTask: { count: mocks.tasksCount },
    user: { count: mocks.usersCount },
  },
}));

vi.mock("@/lib/rate-limit/auth-rate-limit", () => ({
  isRateLimitProviderReady: mocks.rateLimitReady,
}));

import { GET as getMetrics } from "@/app/api/metrics/route";
import { GET as getReady } from "@/app/api/health/ready/route";

const originalMetricsToken = process.env.METRICS_TOKEN;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.METRICS_TOKEN = "test-metrics-token";
  mocks.databaseQuery.mockResolvedValue([{ healthy: 1 }]);
  mocks.rateLimitReady.mockResolvedValue(true);
  mocks.usersCount.mockResolvedValue(12);
  mocks.organizationsCount.mockResolvedValue(4);
  mocks.robotsCount.mockResolvedValue(7);
  mocks.tasksCount.mockResolvedValue(9);
});

afterEach(() => {
  if (originalMetricsToken) process.env.METRICS_TOKEN = originalMetricsToken;
  else delete process.env.METRICS_TOKEN;
});

describe("production observability routes", () => {
  it("reports ready only when database and distributed rate limiting are ready", async () => {
    const readyResponse = await getReady();
    expect(readyResponse.status).toBe(200);
    await expect(readyResponse.json()).resolves.toEqual({
      status: "ready",
      checks: { database: true, rateLimit: true },
    });

    mocks.rateLimitReady.mockResolvedValue(false);
    const notReadyResponse = await getReady();
    expect(notReadyResponse.status).toBe(503);
    await expect(notReadyResponse.json()).resolves.toEqual({
      status: "not_ready",
      checks: { database: true, rateLimit: false },
    });
  });

  it("requires a metrics bearer token before reading counters", async () => {
    const unauthorizedResponse = await getMetrics(new NextRequest("http://localhost/api/metrics"));
    expect(unauthorizedResponse.status).toBe(401);
    expect(mocks.usersCount).not.toHaveBeenCalled();

    const authorizedResponse = await getMetrics(new NextRequest("http://localhost/api/metrics", {
      headers: { authorization: "Bearer test-metrics-token" },
    }));
    expect(authorizedResponse.status).toBe(200);
    await expect(authorizedResponse.json()).resolves.toMatchObject({
      records: { users: 12, organizations: 4, robots: 7, tasks: 9 },
      dependencies: { rateLimit: "ready" },
    });
  });
});