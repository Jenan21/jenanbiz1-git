import { describe, expect, it } from "vitest";
import {
  formatBranchDate,
  summarizeBranchMetrics,
} from "@/lib/admin/branch-metrics";

describe("branch metrics helpers", () => {
  it("summarizes branch totals with newest first assumption", () => {
    const branches = [
      {
        memberCount: 12,
        activeMembers: 9,
        subscriptionCount: 7,
        createdAt: "2026-02-01T00:00:00.000Z",
      },
      {
        memberCount: 8,
        activeMembers: 6,
        subscriptionCount: 4,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const summary = summarizeBranchMetrics(branches);
    expect(summary.branchCount).toBe(2);
    expect(summary.members).toBe(20);
    expect(summary.activeMembers).toBe(15);
    expect(summary.subscriptions).toBe(11);
    expect(summary.newestBranch?.createdAt).toBe(branches[0].createdAt);
  });

  it("formats dates safely and falls back for invalid values", () => {
    expect(formatBranchDate("2026-02-01T00:00:00.000Z", "en-US")).toMatch(
      /2026/,
    );
    expect(formatBranchDate("", "en-US")).toBe("—");
    expect(formatBranchDate("invalid-date", "en-US")).toBe("—");
  });
});
