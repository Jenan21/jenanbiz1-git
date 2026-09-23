import { Prisma, RobotStatus, TaskStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";

export const platformRobotSections = [
  { key: "projects", ar: "المشاريع", en: "Projects" },
  { key: "academy", ar: "الأكاديمية", en: "Academy" },
  { key: "market", ar: "سوق جنان", en: "Market" },
  { key: "talent", ar: "الوظائف والمواهب", en: "Talent" },
  { key: "marketing", ar: "التسويق والنمو", en: "Marketing" },
  { key: "software", ar: "البرمجيات", en: "Software" },
  { key: "programs", ar: "برامج جنان", en: "Programs" },
  { key: "account", ar: "حساب المستخدم", en: "Account" },
  { key: "admin", ar: "لوحة الأدمن", en: "Admin" },
] as const;

export const robotCoverageRoles = [
  { key: "OPERATIONS", ar: "تشغيل", en: "Operations" },
  { key: "MAINTENANCE", ar: "صيانة", en: "Maintenance" },
  { key: "DEVELOPMENT", ar: "تطوير", en: "Development" },
  { key: "INNOVATION", ar: "ابتكار", en: "Innovation" },
] as const;

type SectionKey = (typeof platformRobotSections)[number]["key"];
type CoverageRole = (typeof robotCoverageRoles)[number]["key"];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function robotName(section: SectionKey, role: CoverageRole) {
  const sectionLabel = platformRobotSections.find((item) => item.key === section)?.en ?? section;
  const roleLabel = robotCoverageRoles.find((item) => item.key === role)?.en ?? role;
  return `Jenan Pro ${sectionLabel} ${roleLabel} Robot`;
}

function mission(section: SectionKey, role: CoverageRole) {
  const sectionLabel = platformRobotSections.find((item) => item.key === section)?.en ?? section;
  return `${role} coverage for ${sectionLabel}: monitor, improve, report, and escalate recommendations.`;
}

export async function ensurePlatformRobotCoverage(actorId?: string) {
  const created: string[] = [];
  const ensured: string[] = [];
  await db.$transaction(async (transaction) => {
    for (const section of platformRobotSections) {
      for (const role of robotCoverageRoles) {
        const team = `platform:${section.key}:${role.key}`;
        const existing = await transaction.robot.findFirst({ where: { team }, select: { id: true, name: true } });
        if (existing) {
          ensured.push(existing.id);
          continue;
        }
        const name = robotName(section.key, role.key);
        const robot = await transaction.robot.create({
          data: {
            experience: 88,
            intelligence: role.key === "INNOVATION" ? 94 : 90,
            isVisible: true,
            name,
            notes: JSON.stringify({ role: role.key, section: section.key, type: "platform-coverage" }),
            skill: role.key === "DEVELOPMENT" ? 94 : 90,
            slug: `${slug(name)}-${crypto.randomUUID().slice(0, 8)}`,
            status: RobotStatus.ACTIVE,
            team,
          },
        });
        await transaction.robotTask.create({
          data: {
            description: mission(section.key, role.key),
            priority: role.key === "MAINTENANCE" ? "HIGH" : "MEDIUM",
            robotId: robot.id,
            status: TaskStatus.ACTIVE,
            title: `${section.en} ${role.en} coverage`,
          },
        });
        if (actorId) {
          await transaction.auditLog.create({
            data: {
              actorId,
              action: "robot.coverage.created",
              entityId: robot.id,
              entityType: "Robot",
              metadata: { role: role.key, section: section.key } as Prisma.InputJsonValue,
            },
          });
        }
        created.push(robot.id);
      }
    }
  });
  return { created, ensured, required: platformRobotSections.length * robotCoverageRoles.length };
}

export async function getPlatformRobotCoverage() {
  const robots = await db.robot.findMany({
    where: { team: { startsWith: "platform:" } },
    include: { tasks: { select: { id: true, status: true, title: true } } },
    orderBy: [{ team: "asc" }, { createdAt: "asc" }],
  });
  const coverage = platformRobotSections.map((section) => {
    const roles = robotCoverageRoles.map((role) => {
      const team = `platform:${section.key}:${role.key}`;
      const robot = robots.find((item) => item.team === team);
      return {
        role: role.key,
        roleLabel: role.ar,
        robot: robot ? { id: robot.id, name: robot.name, status: robot.status, tasks: robot.tasks.length } : null,
      };
    });
    return {
      complete: roles.every((role) => Boolean(role.robot)),
      roles,
      section: section.key,
      sectionLabel: section.ar,
    };
  });
  const covered = coverage.filter((item) => item.complete).length;
  return { covered, coverage, required: platformRobotSections.length, rolesPerSection: robotCoverageRoles.length, totalRobots: robots.length };
}