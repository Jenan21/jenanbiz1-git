import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  claimAcademyWork,
  completeAcademyWork,
  createSandboxLabRun,
  enqueueAcademyWork,
  ensureAcademyQueue,
  executeLocalSandboxLabRun,
  failAcademyWork,
  processAcademyQueueOnce,
} from "@/services/academy/queue-service";

const suffix = crypto.randomUUID().slice(0, 8);
let academyId: string | undefined;
const robotIds: string[] = [];

afterAll(async () => {
  if (robotIds.length) await db.robot.deleteMany({ where: { id: { in: robotIds } } });
  if (academyId) await db.academy.delete({ where: { id: academyId } });
  await db.$disconnect();
});

describe("academy queue and sandbox foundation", () => {
  it("processes idempotent leased work and preserves AI-provider boundaries", async () => {
    const academy = await db.academy.create({ data: { name: `Queue academy ${suffix}`, slug: `queue-academy-${suffix}` } });
    academyId = academy.id;
    const field = await db.academyField.create({ data: { academyId: academy.id, name: "Operations", key: `operations-${suffix}` } });
    const specialization = await db.specialization.create({ data: { fieldId: field.id, name: "Execution", key: `execution-${suffix}` } });
    const course = await db.academyCourse.create({ data: { academyId: academy.id, specializationId: specialization.id, title: "Sandbox course", code: `SANDBOX-${suffix}` } });
    const localLab = await db.academyLab.create({ data: { courseId: course.id, title: "Local lab", sequence: 1, providerReadiness: "NOT_REQUIRED" } });
    const aiLab = await db.academyLab.create({ data: { courseId: course.id, title: "AI lab", sequence: 2, providerReadiness: "AWAITING_AI_PROVIDER" } });
    const robot = await db.robot.create({ data: { name: `Queue candidate ${suffix}`, slug: `queue-candidate-${suffix}` } });
    robotIds.push(robot.id);
    const profile = await db.robotAcademicProfile.create({ data: { robotId: robot.id, primarySpecializationId: specialization.id } });

    const queue = await ensureAcademyQueue({ academyId: academy.id, key: `exam-${suffix}`, name: "Exam queue", concurrency: 1 });
    const first = await enqueueAcademyWork({ queueId: queue.id, kind: "EXAMINATION", idempotencyKey: `dead-${suffix}`, priority: 100, profileId: profile.id, maxAttempts: 1 });
    const duplicate = await enqueueAcademyWork({ queueId: queue.id, kind: "EXAMINATION", idempotencyKey: `dead-${suffix}`, priority: 1, profileId: profile.id });
    expect(duplicate.id).toBe(first.id);
    const second = await enqueueAcademyWork({ queueId: queue.id, kind: "CERTIFICATION", idempotencyKey: `complete-${suffix}`, priority: 50, profileId: profile.id });

    const deadLease = await claimAcademyWork(queue.id, 10_000);
    expect(deadLease?.id).toBe(first.id);
    expect(await claimAcademyWork(queue.id, 10_000)).toBeNull();
    const dead = await failAcademyWork({ itemId: deadLease!.id, leaseToken: deadLease!.leaseToken!, error: "intentional integration failure" });
    expect(dead.status).toBe("DEAD_LETTER");
    const completeLease = await claimAcademyWork(queue.id, 10_000);
    expect(completeLease?.id).toBe(second.id);
    expect((await completeAcademyWork({ itemId: completeLease!.id, leaseToken: completeLease!.leaseToken! })).status).toBe("COMPLETED");
    const processedItem = await enqueueAcademyWork({ queueId: queue.id, kind: "RETRAINING", idempotencyKey: `process-${suffix}`, priority: 10, profileId: profile.id });
    const processed = await processAcademyQueueOnce(queue.id, async (item) => {
      expect(item.id).toBe(processedItem.id);
    });
    expect(processed.item?.status).toBe("COMPLETED");

    const localRun = await createSandboxLabRun({ profileId: profile.id, labId: localLab.id, idempotencyKey: `local-${suffix}`, input: { check: "local" } });
    expect((await createSandboxLabRun({ profileId: profile.id, labId: localLab.id, idempotencyKey: `local-${suffix}` })).id).toBe(localRun.id);
    expect((await executeLocalSandboxLabRun(localRun.id, async () => ({ passed: true, evidence: { source: "local-evaluator" }, output: { result: "passed" } }))).status).toBe("PASSED");
    const deferredRun = await createSandboxLabRun({ profileId: profile.id, labId: aiLab.id, idempotencyKey: `ai-${suffix}` });
    expect(deferredRun.status).toBe("AWAITING_AI_PROVIDER");
    await expect(executeLocalSandboxLabRun(deferredRun.id, async () => ({ passed: true, evidence: { source: "not-ai" } }))).rejects.toThrow("awaits AI provider");
  });
});