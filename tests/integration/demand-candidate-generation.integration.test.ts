import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { generateCandidatesForDemand } from "@/services/academy/workforce-service";

const suffix = crypto.randomUUID().slice(0, 8);
let academyId: string | undefined;
const robotIds: string[] = [];

afterAll(async () => {
  if (robotIds.length) await db.robot.deleteMany({ where: { id: { in: robotIds } } });
  if (academyId) await db.academy.delete({ where: { id: academyId } });
  await db.$disconnect();
});

describe("demand-driven candidate generation", () => {
  it("creates exactly the open gap and starts academy education", async () => {
    const academy = await db.academy.create({ data: { name: `Demand academy ${suffix}`, slug: `demand-academy-${suffix}` } });
    academyId = academy.id;
    const field = await db.academyField.create({ data: { academyId: academy.id, name: "Backend", key: `backend-${suffix}` } });
    const specialization = await db.specialization.create({ data: { fieldId: field.id, name: "Platform", key: `platform-${suffix}` } });
    const course = await db.academyCourse.create({ data: { academyId: academy.id, fieldId: field.id, specializationId: specialization.id, title: "Platform foundations", code: `PLATFORM-${suffix}` } });
    const cohort = await db.academyCohort.create({ data: { academyId: academy.id, name: "Platform cohort", key: `platform-cohort-${suffix}`, status: "OPEN", capacity: 2 } });
    const queue = await db.academyWorkQueue.create({ data: { academyId: academy.id, name: "Admissions", key: "admission", concurrency: 2 } });
    const demand = await db.workforceDemand.create({ data: { title: "Platform team need", requiredCount: 2, priority: 90, specializationId: specialization.id } });

    const result = await generateCandidatesForDemand(demand.id);
    expect(result.generated).toBe(2);
    expect(result.batch).toBeTruthy();
    const members = await db.candidateBatchMember.findMany({ where: { batchId: result.batch! }, include: { profile: true } });
    robotIds.push(...(await db.robot.findMany({ where: { academicProfile: { id: { in: members.map((member) => member.profileId) } } }, select: { id: true } })).map((robot) => robot.id));
    expect(members).toHaveLength(2);
    expect(members.every((member) => member.profile.status === "ENROLLED")).toBe(true);
    expect(await db.courseCompletion.count({ where: { profileId: { in: members.map((member) => member.profileId) }, courseId: course.id, status: "ASSIGNED" } })).toBe(2);
    expect(await db.cohortEnrollment.count({ where: { cohortId: cohort.id, profileId: { in: members.map((member) => member.profileId) } } })).toBe(2);
    expect(await db.academyQueueItem.count({ where: { queueId: queue.id, profileId: { in: members.map((member) => member.profileId) }, kind: "ENROLLMENT" } })).toBe(2);
    expect(await db.agentRuntimeAllocation.count({ where: { robotId: { in: robotIds } } })).toBe(0);
  });
});