import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { MissionRetryBackoff, RobotStatus, SystemRole, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  addMissionDependency,
  addMissionFallbackPolicy,
  addMissionSubtask,
  completeMissionRun,
  configureMissionRetryPolicy,
  createMissionRun,
  decideMissionApproval,
  escalateMissionRun,
  failMissionAttempt,
  getMissionRunSnapshot,
  queueMissionRun,
  recordMissionRunCost,
  recordMissionRunEvidence,
  requestMissionApproval,
  retryDelaySeconds,
  startMissionRun,
} from "@/services/orchestration/mission-engine";

describe("persistent mission engine", () => {
  let actorId = "";
  let missionId = "";
  let robotId = "";

  it("tracks dependencies, retries, fallback, approval, evidence, cost, and history", async () => {
    const actor = await db.user.create({ data: { email: `mission.engine.${randomUUID()}@example.test`, status: UserStatus.ACTIVE, systemRole: SystemRole.ADMIN } });
    actorId = actor.id;
    const robot = await db.robot.create({ data: { name: "Mission Engine Test Robot", slug: `mission-engine-${randomUUID()}`, status: RobotStatus.ACTIVE } });
    robotId = robot.id;
    const mission = await db.mission.create({ data: { name: "Persistent mission engine acceptance" } });
    missionId = mission.id;

    const run = await createMissionRun(mission.id, actor.id);
    const research = await addMissionSubtask({ key: "research", runId: run.id, sequence: 1, title: "Research" }, actor.id);
    const report = await addMissionSubtask({ key: "report", runId: run.id, sequence: 2, title: "Report" }, actor.id);
    await addMissionDependency({ predecessorId: research.id, runId: run.id, successorId: report.id }, actor.id);
    await expect(addMissionDependency({ predecessorId: report.id, runId: run.id, successorId: research.id }, actor.id)).rejects.toThrow("cycle");

    await configureMissionRetryPolicy({ backoff: MissionRetryBackoff.EXPONENTIAL, baseDelaySeconds: 10, maximumDelaySeconds: 60, maxAttempts: 2, missionId: mission.id, retryableErrors: ["TIMEOUT"] }, actor.id);
    await addMissionFallbackPolicy({ missionId: mission.id, model: "fallback-model", name: "Secondary provider", priority: 1, provider: "internal-test" }, actor.id);
    expect(retryDelaySeconds({ attempt: 3, backoff: MissionRetryBackoff.EXPONENTIAL, baseDelaySeconds: 10, maximumDelaySeconds: 30 })).toBe(30);

    await queueMissionRun(run.id, actor.id);
    let active = await startMissionRun(run.id, actor.id);
    expect(active.status).toBe("RUNNING");
    active = await failMissionAttempt(run.id, "TIMEOUT", actor.id);
    expect(active.status).toBe("RETRY");
    await startMissionRun(run.id, actor.id);
    active = await failMissionAttempt(run.id, "TIMEOUT", actor.id);
    expect(active.status).toBe("FALLBACK");
    active = await startMissionRun(run.id, actor.id);
    expect(active.attempts.at(-1)?.provider).toBe("internal-test");

    active = await requestMissionApproval(run.id, "FINAL_OUTPUT", actor.id);
    const approval = active.approvals[0];
    expect(active.status).toBe("WAITING_APPROVAL");
    await escalateMissionRun({ approvalId: approval.id, assignedRole: SystemRole.SUPER_ADMIN, reason: "High-impact decision", runId: run.id }, actor.id);
    active = await decideMissionApproval({ approvalId: approval.id, approve: true, rationale: "Evidence reviewed and accepted" }, actor.id);
    expect(active.status).toBe("RUNNING");

    const currentAttempt = active.attempts.find((item) => item.status === "RUNNING");
    await recordMissionRunEvidence({ attemptId: currentAttempt?.id, description: "Verified execution output", robotId: robot.id, runId: run.id, type: "RESULT", verified: true }, actor.id);
    await recordMissionRunCost({ attemptId: currentAttempt?.id, computeCostMinor: 125, currency: "USD", inputTokens: 100, outputTokens: 50, provider: "internal-test", robotId: robot.id, runId: run.id }, actor.id);
    active = await completeMissionRun(run.id, { result: "accepted" }, actor.id);
    expect(active.status).toBe("COMPLETED");

    const snapshot = await getMissionRunSnapshot(run.id);
    expect(snapshot?.attempts.map((item) => item.status)).toEqual(["FAILED", "FAILED", "SUCCEEDED"]);
    expect(snapshot?.dependencies).toHaveLength(1);
    expect(snapshot?.approvals[0]?.status).toBe("APPROVED");
    expect(snapshot?.escalations).toHaveLength(1);
    expect(snapshot?.evidence[0]).toMatchObject({ verified: true, attemptId: currentAttempt?.id });
    expect(snapshot?.costs[0]).toMatchObject({ computeCostMinor: 125, attemptId: currentAttempt?.id });
    expect(snapshot?.history.map((item) => item.event)).toEqual(expect.arrayContaining(["RUN_CREATED", "RUN_QUEUED", "RUN_STARTED", "RETRY_SCHEDULED", "RETRY_STARTED", "FALLBACK_SELECTED", "FALLBACK_STARTED", "APPROVAL_REQUESTED", "RUN_ESCALATED", "APPROVAL_GRANTED", "EVIDENCE_RECORDED", "COST_RECORDED", "RUN_COMPLETED"]));
  });

  afterAll(async () => {
    if (robotId) {
      await db.evidence.deleteMany({ where: { robotId } });
      await db.costRecord.deleteMany({ where: { robotId } });
    }
    if (missionId) await db.mission.delete({ where: { id: missionId } }).catch(() => undefined);
    if (robotId) await db.robot.delete({ where: { id: robotId } }).catch(() => undefined);
    if (actorId) {
      await db.auditLog.deleteMany({ where: { actorId } });
      await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });
});