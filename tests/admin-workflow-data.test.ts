import { describe, expect, it } from "vitest";
import {
  buildCommitteeSummary,
  buildDecisionQueue,
  type CommitteeRecord,
  type WorkflowTaskRecord,
} from "@/lib/admin/platform-workflow";

describe("admin workflow data", () => {
  it("builds a real committee summary and action queue from platform records", () => {
    const committeeRecords: CommitteeRecord[] = [
      { robotName: "Core Dev Prime", reviewer: "Board A", score: 98, verdict: "APPROVE", notes: "Stable" },
      { robotName: "Signal Forge", reviewer: "Board B", score: 97, verdict: "APPROVE", notes: "Strong" },
      { robotName: "Trust Pilot", reviewer: "Board C", score: 89, verdict: "DEFER", notes: "Needs review" },
    ];

    const taskRecords: WorkflowTaskRecord[] = [
      { title: "Build platform core", robotName: "Core Dev Prime", status: "IN_PROGRESS", priority: "HIGH" },
      { title: "Growth optimization", robotName: "Signal Forge", status: "PENDING_APPROVAL", priority: "HIGH" },
      { title: "Trust loop", robotName: "Trust Pilot", status: "ACTIVE", priority: "MEDIUM" },
    ];

    const committee = buildCommitteeSummary(committeeRecords);
    const decisions = buildDecisionQueue(taskRecords);

    expect(committee.averageScore).toBe(95);
    expect(committee.approvalRate).toBe(67);
    expect(committee.members).toHaveLength(3);
    expect(decisions[0].title).toBe("Build platform core");
    expect(decisions[1].status).toBe("PENDING_APPROVAL");
    expect(decisions[2].status).toBe("ACTIVE");
  });
});
