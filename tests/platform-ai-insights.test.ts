import { describe, expect, it } from "vitest";
import { buildPlatformObservations } from "@/lib/ai/platform-intelligence";

describe("buildPlatformObservations", () => {
  it("creates traceable operational observations from persisted metrics", () => {
    const observations = buildPlatformObservations({
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

    expect(observations.length).toBeGreaterThanOrEqual(3);
    expect(observations[0].title.length).toBeGreaterThan(0);
    expect(observations[0].summary.length).toBeGreaterThan(0);
    expect(observations.every((observation) => observation.source === "PERSISTED_RECORDS")).toBe(true);
  });
});
