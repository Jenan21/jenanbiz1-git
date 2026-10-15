import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { session: { findMany: mocks.findMany }, project: { count: mocks.count } } }));

import { getHomeStats } from "@/services/platform/home-stats-service";

const now = new Date("2026-10-15T08:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("home statistics", () => {
  it("counts distinct members active in the last 15 minutes and the projects that are not archived", async () => {
    mocks.findMany.mockResolvedValue([{ userId: "a" }, { userId: "b" }]);
    mocks.count.mockResolvedValue(5);
    await expect(getHomeStats(now)).resolves.toEqual({ activeUsers: 2, projects: 5 });

    const sessionQuery = mocks.findMany.mock.calls[0]![0] as { where: { updatedAt: { gte: Date }; expiresAt: { gt: Date } }; distinct: string[] };
    expect(sessionQuery.distinct).toEqual(["userId"]);
    expect(now.getTime() - sessionQuery.where.updatedAt.gte.getTime()).toBe(15 * 60 * 1000);
    expect(sessionQuery.where.expiresAt.gt).toEqual(now);
    expect(mocks.count.mock.calls[0]![0]).toEqual({ where: { status: { not: "ARCHIVED" } } });
  });

  it("reports zero as a real zero", async () => {
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    await expect(getHomeStats(now)).resolves.toEqual({ activeUsers: 0, projects: 0 });
  });

  it("answers null for both when the database fails, instead of an invented number", async () => {
    mocks.findMany.mockRejectedValue(new Error("connection refused"));
    mocks.count.mockResolvedValue(5);
    await expect(getHomeStats(now)).resolves.toEqual({ activeUsers: null, projects: null });
  });
});
