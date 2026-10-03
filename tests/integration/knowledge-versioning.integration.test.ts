import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { RobotStatus, SystemRole, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  compareKnowledgeVersions,
  createKnowledgeVersion,
  createVersionedKnowledge,
  getKnowledgeSnapshot,
  linkKnowledgeEvidence,
  reviewKnowledgeVersion,
  rollbackKnowledge,
} from "@/services/intelligence/knowledge-version-service";

describe("knowledge versioning", () => {
  let actorId = "";
  let knowledgeId = "";
  let robotId = "";

  it("keeps immutable versions, evidence, reviews, diffs, and rollback history", async () => {
    const actor = await db.user.create({ data: { email: `knowledge.${randomUUID()}@example.test`, status: UserStatus.ACTIVE, systemRole: SystemRole.ADMIN } });
    actorId = actor.id;
    const robot = await db.robot.create({ data: { name: "Knowledge Test Robot", slug: `knowledge-${randomUUID()}`, status: RobotStatus.ACTIVE } });
    robotId = robot.id;
    const evidence = await db.evidence.create({ data: { description: "Verified source evidence", robotId: robot.id, type: "SOURCE", verified: true } });

    const knowledge = await createVersionedKnowledge({ confidence: 70, content: "Line one\nOriginal line", source: "Verified Registry", sourcePublishedAt: new Date("2026-09-01T00:00:00.000Z"), sourceUrl: "https://example.com/source", title: "Versioned knowledge" }, actor.id);
    knowledgeId = knowledge.id;
    await createKnowledgeVersion({ changeSummary: "Updated verified facts", confidence: 85, content: "Line one\nUpdated line", knowledgeId: knowledge.id, references: [{ title: "Evidence record" }], source: "Verified Registry", sourcePublishedAt: new Date("2026-09-02T00:00:00.000Z"), sourceUrl: "https://example.com/source/v2", title: "Versioned knowledge" }, actor.id);
    await linkKnowledgeEvidence({ evidenceId: evidence.id, knowledgeId: knowledge.id, note: "Supports v2", version: 2 }, actor.id);
    await reviewKnowledgeVersion({ knowledgeId: knowledge.id, notes: "Source and evidence verified", state: "APPROVED" }, actor.id);

    const diff = await compareKnowledgeVersions(knowledge.id, 1, 2);
    expect(diff.lines).toEqual([{ line: 2, before: "Original line", after: "Updated line", changed: true }]);
    const rolledBack = await rollbackKnowledge({ knowledgeId: knowledge.id, reason: "Restore verified baseline", targetVersion: 1 }, actor.id);
    expect(rolledBack.currentVersion).toBe(3);
    expect(rolledBack.content).toBe("Line one\nOriginal line");
    expect(rolledBack.approvalState).toBe("DRAFT");

    const snapshot = await getKnowledgeSnapshot(knowledge.id);
    expect(snapshot?.versions.map((item) => item.version)).toEqual([3, 2, 1]);
    expect(snapshot?.versions[0]?.rollbackFrom).toBe(1);
    expect(snapshot?.reviews[0]).toMatchObject({ state: "APPROVED", notes: "Source and evidence verified" });
    expect(snapshot?.evidenceLinks[0]?.evidenceId).toBe(evidence.id);
    const auditActions = await db.auditLog.findMany({ where: { actorId: actor.id, entityId: knowledge.id }, select: { action: true } });
    expect(auditActions.map((item) => item.action)).toEqual(expect.arrayContaining(["knowledge.created", "knowledge.version.created", "knowledge.evidence.linked", "knowledge.reviewed", "knowledge.rolled_back"]));
  });

  afterAll(async () => {
    if (knowledgeId) await db.sharedKnowledge.delete({ where: { id: knowledgeId } }).catch(() => undefined);
    if (robotId) await db.robot.delete({ where: { id: robotId } }).catch(() => undefined);
    if (actorId) {
      await db.auditLog.deleteMany({ where: { actorId } });
      await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });
});