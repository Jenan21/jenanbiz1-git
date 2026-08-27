import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCandidateBatch, listCandidateBatchMembers } from "@/services/academy/workforce-service";

const enabled = process.env.RUN_MASS_INTAKE === "YES";
const suffix = crypto.randomUUID().slice(0, 8);
const candidateCount = 10_000;
let academyId: string | undefined;
let robotIds: string[] = [];

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) result.push(items.slice(offset, offset + size));
  return result;
}

afterAll(async () => {
  if (robotIds.length) await db.robot.deleteMany({ where: { id: { in: robotIds } } });
  if (academyId) await db.academy.delete({ where: { id: academyId } });
  await db.$disconnect();
});

describe.skipIf(!enabled)("academy mass candidate intake", () => {
  it("persists and paginates 10,000 candidate records without runtime allocation", async () => {
    const started = performance.now();
    const academy = await db.academy.create({ data: { name: `Mass intake ${suffix}`, slug: `mass-intake-${suffix}` } });
    academyId = academy.id;
    const field = await db.academyField.create({ data: { academyId: academy.id, name: "Operations", key: `operations-${suffix}` } });
    const specialization = await db.specialization.create({ data: { fieldId: field.id, name: "Candidate pool", key: `candidate-pool-${suffix}` } });
    const demand = await db.workforceDemand.create({ data: { title: "Mass intake demand", requiredCount: candidateCount, priority: 100, specializationId: specialization.id } });
    const batch = await createCandidateBatch({ demandId: demand.id, name: "10k candidate intake", requestedCount: candidateCount, priority: 100 });

    const candidates = Array.from({ length: candidateCount }, (_, index) => ({
      robotId: `mass-robot-${suffix}-${String(index).padStart(5, "0")}`,
      profileId: `mass-profile-${suffix}-${String(index).padStart(5, "0")}`,
      slug: `mass-candidate-${suffix}-${index}`,
    }));
    robotIds = candidates.map((candidate) => candidate.robotId);
    for (const group of chunks(candidates, 500)) {
      await db.robot.createMany({ data: group.map((candidate) => ({ id: candidate.robotId, name: `Candidate ${candidate.robotId}`, slug: candidate.slug })) });
      await db.robotAcademicProfile.createMany({ data: group.map((candidate) => ({ id: candidate.profileId, robotId: candidate.robotId, primarySpecializationId: specialization.id, status: "CANDIDATE" })) });
      await db.candidateBatchMember.createMany({ data: group.map((candidate) => ({ batchId: batch.id, profileId: candidate.profileId })) });
    }

    expect(await db.candidateBatchMember.count({ where: { batchId: batch.id } })).toBe(candidateCount);
    const firstPage = await listCandidateBatchMembers({ batchId: batch.id, limit: 100 });
    expect(firstPage.items).toHaveLength(100);
    expect(firstPage.nextCursor).toBeTruthy();
    const secondPage = await listCandidateBatchMembers({ batchId: batch.id, cursorProfileId: firstPage.nextCursor!, limit: 100 });
    expect(secondPage.items).toHaveLength(100);
    expect(new Set([...firstPage.items, ...secondPage.items].map((item) => item.profileId)).size).toBe(200);
    expect(await db.agentRuntimeAllocation.count({ where: { robotId: { in: robotIds } } })).toBe(0);
    expect(performance.now() - started).toBeLessThan(120_000);
  }, 180_000);
});