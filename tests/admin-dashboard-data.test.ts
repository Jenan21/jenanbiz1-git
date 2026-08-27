import { describe, expect, it } from "vitest";
import {
  summarizeRobotMetrics,
  type RobotRecord,
} from "@/lib/admin/robot-intelligence";

describe("summarizeRobotMetrics", () => {
  it("ranks visible robots and computes accurate dashboard values", () => {
    const robots: RobotRecord[] = [
      { id: "r1", name: "Core Dev Prime", intelligence: 98, skill: 96, experience: 93, status: "ACTIVE" },
      { id: "r2", name: "Signal Forge", intelligence: 97, skill: 95, experience: 92, status: "ACTIVE" },
      { id: "r3", name: "Trust Pilot", intelligence: 95, skill: 94, experience: 90, status: "ACTIVE" },
      { id: "r4", name: "Weak Bot", intelligence: 61, skill: 58, experience: 52, status: "HIDDEN" },
      { id: "r5", name: "Rookie Bot", intelligence: 68, skill: 63, experience: 60, status: "REVIEW" },
    ];

    const summary = summarizeRobotMetrics(robots);

    expect(summary.totalRobots).toBe(5);
    expect(summary.visibleRobots).toHaveLength(3);
    expect(summary.visibleRobots[0].name).toBe("Core Dev Prime");
    expect(summary.averageIntelligence).toBeGreaterThan(85);
    expect(summary.dailyGeneration).toBe(1000);
    expect(summary.approvalRate).toBeGreaterThan(70);
    expect(summary.hiddenRobots).toBe(1);
  });
});
