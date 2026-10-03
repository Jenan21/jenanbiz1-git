import { AcademyLifecycleStatus, Prisma, RobotStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

const publicRobotSelect = {
  id: true,
  name: true,
  intelligence: true,
  skill: true,
  experience: true,
  updatedAt: true,
  academicProfile: {
    select: {
      status: true,
      qualityScore: true,
      reliabilityScore: true,
      safetyScore: true,
      trustScore: true,
      lastVerifiedAt: true,
      operationalAt: true,
      primarySpecialization: { select: { name: true, description: true, field: { select: { name: true } } } },
      skills: { select: { level: true, skill: { select: { name: true, description: true } } }, orderBy: { updatedAt: "desc" as const } },
      certifications: { where: { status: "CERTIFIED" as const }, select: { status: true, awardedAt: true, expiresAt: true, certification: { select: { name: true } } } },
      geographyProfiles: { select: { proficiency: true, market: true, language: true, knowledgeFreshness: true, geographyNode: { select: { name: true, type: true, code: true } } } },
    },
  },
} satisfies Prisma.RobotSelect;

type PublicRobot = Prisma.RobotGetPayload<{ select: typeof publicRobotSelect }>;

export type PublicRobotSearch = { environment?: string; location?: string; query?: string; sector?: string };

function searchable(robot: PublicRobot) {
  const profile = robot.academicProfile;
  return [
    robot.name,
    profile?.primarySpecialization?.name,
    profile?.primarySpecialization?.field.name,
    ...profile?.skills.flatMap((skill) => [skill.skill.name, skill.skill.description]) ?? [],
    ...profile?.geographyProfiles.flatMap((geography) => [geography.geographyNode.name, geography.market, geography.language]) ?? [],
  ].filter(Boolean).join(" ").toLowerCase();
}

export async function listPublicRobots(filters: PublicRobotSearch = {}): Promise<PublicRobot[]> {
  const robots = await db.robot.findMany({
    where: { status: RobotStatus.ACTIVE, isVisible: true, academicProfile: { is: { status: { in: [AcademyLifecycleStatus.CERTIFIED, AcademyLifecycleStatus.OPERATIONAL] } } } },
    select: publicRobotSelect,
    orderBy: [{ intelligence: "desc" }, { skill: "desc" }, { experience: "desc" }],
    take: 100,
  });
  const terms = [filters.query, filters.sector, filters.location, filters.environment].map((term) => term?.trim().toLowerCase()).filter((term): term is string => Boolean(term));
  return terms.length ? robots.filter((robot) => terms.every((term) => searchable(robot).includes(term))) : robots;
}

export async function recommendPublicRobots(filters: PublicRobotSearch, budgetMinor?: number) {
  const robots = await listPublicRobots();
  const terms = [filters.query, filters.sector, filters.location, filters.environment].map((term) => term?.trim().toLowerCase()).filter((term): term is string => Boolean(term));
  return robots.map((robot) => {
    const text = searchable(robot);
    const matchedTerms = terms.filter((term) => text.includes(term));
    const profile = robot.academicProfile!;
    const verifiedScore = Math.round((profile.qualityScore + profile.reliabilityScore + profile.safetyScore + profile.trustScore) / 4);
    const criteriaScore = terms.length ? Math.round(matchedTerms.length / terms.length * 55) : 25;
    const score = Math.min(100, Math.round(verifiedScore * 0.45 + criteriaScore));
    return {
      robot,
      score,
      reasons: [profile.primarySpecialization?.name, ...matchedTerms].filter((reason): reason is string => Boolean(reason)),
      gaps: terms.filter((term) => !matchedTerms.includes(term)),
      budgetCompatibility: budgetMinor ? "UNAVAILABLE" as const : "NOT_PROVIDED" as const,
    };
  }).sort((left, right) => right.score - left.score);
}

export async function createRobotInformationRequest(input: { budgetMinor?: number; environment?: string; location?: string; robotId: string; sector?: string; task: string }, requesterId: string) {
  const robot = await db.robot.findFirst({ where: { id: input.robotId, status: RobotStatus.ACTIVE, isVisible: true, academicProfile: { is: { status: { in: [AcademyLifecycleStatus.CERTIFIED, AcademyLifecycleStatus.OPERATIONAL] } } } }, select: { id: true } });
  if (!robot) throw new Error("Public robot not found");
  return db.$transaction(async (transaction) => {
    const request = await transaction.robotInformationRequest.create({ data: { requesterId, robotId: robot.id, task: input.task.trim(), sector: input.sector?.trim() || undefined, location: input.location?.trim() || undefined, environment: input.environment?.trim() || undefined, budgetMinor: input.budgetMinor } });
    await transaction.auditLog.create({ data: { actorId: requesterId, action: "robotics.information.requested", entityType: "RobotInformationRequest", entityId: request.id, metadata: { robotId: robot.id } } });
    return request;
  });
}

export async function listRobotInformationRequests(userId: string) {
  return db.robotInformationRequest.findMany({ where: { requesterId: userId }, select: { id: true, robotId: true, task: true, sector: true, location: true, environment: true, budgetMinor: true, status: true, createdAt: true, updatedAt: true, robot: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
}