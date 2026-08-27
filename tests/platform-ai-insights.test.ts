import { describe, expect, it } from "vitest";
import { buildFallbackPlatformInsights } from "@/lib/ai/platform-intelligence";

describe("buildFallbackPlatformInsights", () => {
  it("creates actionable intelligence from live platform metrics", () => {
    const insights = buildFallbackPlatformInsights({
      totalRobots: 12,
      visibleRobots: 8,
      reviewRobots: 2,
      hiddenRobots: 2,
      averageIntelligence: 91,
      committeeApprovalRate: 83,
      activeTasks: 6,
      pendingTasks: 3,
      totalUsers: 140,
      totalOrganizations: 7,
    });

    expect(insights.length).toBeGreaterThanOrEqual(3);
    expect(insights[0].title.length).toBeGreaterThan(0);
    expect(insights[0].summary.length).toBeGreaterThan(0);
    expect(insights[0].confidence).toBeGreaterThan(0);
  });
});
