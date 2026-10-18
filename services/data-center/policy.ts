import { hasPlatformAdminAccess, memberHasPermission } from "@/lib/auth/authorization";
import { db, type DbExecutor } from "@/lib/db";
import type { SystemRole, DataCenterSource } from "@/generated/prisma/client";
import { DataCenterError, type DataCenterActor } from "./contracts";

export const dataCenterPermissions = {
  view: "data-center.view", import: "data-center.import", edit: "data-center.edit",
  review: "data-center.review", approve: "data-center.approve", publish: "data-center.publish",
  archive: "data-center.archive", export: "data-center.export", manageSources: "data-center.manage-sources",
  manageRobotAccess: "data-center.manage-robot-access",
} as const;
export type DataCenterOperation = keyof typeof dataCenterPermissions;
export function isDataCenterAdmin(actor: DataCenterActor) {
  return actor.kind === "HUMAN" && hasPlatformAdminAccess(actor.systemRole as SystemRole);
}
export function requireDataCenterPrincipal(actor: DataCenterActor) {
  if (actor.kind !== "HUMAN" && actor.kind !== "AI") throw new DataCenterError("TRUSTED_PRINCIPAL_KIND_REQUIRED", 403);
}
export function requireDataCenterAdmin(actor: DataCenterActor) {
  if (!isDataCenterAdmin(actor)) throw new DataCenterError("ADMIN_REQUIRED", 403);
}
export async function authorizedOrganizationIds(actor: DataCenterActor, permission = "data-center.read", tx: DbExecutor = db) {
  const memberships = await tx.organizationMember.findMany({
    where: { userId: actor.id, status: "ACTIVE" }, include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  return memberships.filter((m) => memberHasPermission(m, permission)).map((m) => m.organizationId);
}
export async function sourceScopeWhere(actor: DataCenterActor, tx: DbExecutor = db) {
  requireDataCenterPrincipal(actor);
  if (isDataCenterAdmin(actor)) return {};
  if (actor.kind === "AI") return { id: { in: await robotSourceIds(actor, tx) } };
  const orgs = [...await authorizedOrganizationIds(actor, dataCenterPermissions.view, tx), ...await authorizedOrganizationIds(actor, "data-center.read", tx)];
  return { OR: [
    { scope: "PLATFORM" as const },
    { scope: "PRIVATE" as const, ownerId: actor.id },
    { scope: "ORGANIZATION" as const, organizationId: { in: orgs } },
  ] };
}
export async function assertSourceAccess(source: DataCenterSource | null, actor: DataCenterActor, write = false, tx: DbExecutor = db) {
  requireDataCenterPrincipal(actor);
  if (!source) throw new DataCenterError("SOURCE_NOT_FOUND", 404);
  if (isDataCenterAdmin(actor)) return source;
  if (actor.kind === "AI") {
    if (!(await robotSourceIds(actor, tx)).includes(source.id)) throw new DataCenterError("SOURCE_NOT_FOUND", 404);
    return source;
  }
  const own = source.scope === "PRIVATE" && source.ownerId === actor.id;
  const org = source.scope === "ORGANIZATION" && (await authorizedOrganizationIds(actor, write ? dataCenterPermissions.edit : dataCenterPermissions.view, tx)).includes(source.organizationId!);
  if (!own && !org && !(source.scope === "PLATFORM" && !write)) throw new DataCenterError("SOURCE_NOT_FOUND", 404);
  return source;
}
export async function robotSourceIds(actor: DataCenterActor, tx: DbExecutor = db) {
  if (!actor.robotId || !actor.roleKey || !actor.specialty || !actor.missionId)
    throw new DataCenterError("EXPLICIT_ROBOT_GRANT_REQUIRED", 403);
  const mission = await tx.mission.findFirst({ where: { id: actor.missionId, assignedRobots: { some: { id: actor.robotId } } }, select: { id: true } });
  if (!mission) throw new DataCenterError("ROBOT_MISSION_ASSIGNMENT_REQUIRED", 403);
  const grants = await tx.dataCenterRobotGrant.findMany({ where: {
    principalId: actor.id, robotId: actor.robotId, roleKey: actor.roleKey, specialty: actor.specialty,
    missionId: actor.missionId, revokedAt: null, expiresAt: { gt: new Date() },
  }, select: { sourceId: true } });
  if (!grants.length) throw new DataCenterError("EXPLICIT_ROBOT_GRANT_REQUIRED", 403);
  return grants.map((g) => g.sourceId);
}
export async function requireDataCenterOperation(actor: DataCenterActor, operation: DataCenterOperation, source?: DataCenterSource, tx: DbExecutor = db) {
  requireDataCenterPrincipal(actor);
  if (isDataCenterAdmin(actor)) return;
  if (actor.kind === "AI") {
    if (!["view", "edit"].includes(operation)) throw new DataCenterError("HUMAN_OPERATION_REQUIRED", 403);
    const ids = await robotSourceIds(actor, tx);
    if (source && !ids.includes(source.id)) throw new DataCenterError("SOURCE_NOT_FOUND", 404);
    return;
  }
  if (source?.scope === "PRIVATE" && source.ownerId === actor.id && ["view", "edit", "import", "export", "archive", "manageSources"].includes(operation)) return;
  const orgs = await authorizedOrganizationIds(actor, dataCenterPermissions[operation], tx);
  if (source ? source.scope === "ORGANIZATION" && orgs.includes(source.organizationId!) : orgs.length > 0) return;
  throw new DataCenterError(`PERMISSION_REQUIRED:${dataCenterPermissions[operation]}`, 403);
}
export function dataCenterFreshness(input: { sourceDate?: Date | null; sourcePublishedAt?: Date | null; freshnessDays: number; expiresAt?: Date | null; effectiveTo?: Date | null }, now = new Date()) {
  const date = input.sourceDate ?? input.sourcePublishedAt;
  if ((input.expiresAt && input.expiresAt <= now) || (input.effectiveTo && input.effectiveTo <= now)) return "EXPIRED" as const;
  if (!date) return "UNKNOWN" as const;
  return now.getTime() - date.getTime() > input.freshnessDays * 86_400_000 ? "STALE" as const : "FRESH" as const;
}
export function deterministicConfidence(input: {
  evidenceStatus: string; provenanceCount: number; sourcePublishedAt?: Date | null;
  freshnessDays: number; now?: Date; origin: string; expiresAt?: Date | null;
  sourceKind?: string; completeness?: number; consistency?: number;
}) {
  const now = input.now ?? new Date();
  const evidence = ({ VERIFIED: 35, ESTIMATED: 18, DERIVED: 25, UNVERIFIED: 4, CONFLICTED: 0 } as Record<string, number>)[input.evidenceStatus] ?? 0;
  const provenance = Math.min(15, input.provenanceCount * 3);
  const ageDays = input.sourcePublishedAt ? Math.max(0, (now.getTime() - input.sourcePublishedAt.getTime()) / 86_400_000) : null;
  const expired = !!input.expiresAt && input.expiresAt <= now;
  const freshness = expired || ageDays === null ? 0 : Math.max(0, Math.round(15 * (1 - ageDays / input.freshnessDays)));
  const origin = input.origin === "AI" ? 0 : 5;
  const sourceReliability = ({ OFFICIAL: 10, ACADEMY: 8, API: 5, FILE: 3, MANUAL: 2, GENERATED: 0 } as Record<string, number>)[input.sourceKind ?? ""] ?? 0;
  const completeness = Math.max(0, Math.min(10, Math.floor(input.completeness ?? 0)));
  const consistency = input.evidenceStatus === "CONFLICTED" ? 0 : Math.max(0, Math.min(10, Math.floor(input.consistency ?? 0)));
  return { score: input.evidenceStatus === "CONFLICTED" ? 0 : evidence + provenance + freshness + origin + sourceReliability + completeness + consistency,
    factors: { evidence, provenance, freshness, origin, sourceReliability, completeness, consistency }, evaluatedAt: now.toISOString(), ageDays,
    policyVersion: "dc-confidence-v2-seven-factors", expired, explanation: "Heuristic, not a probability or verification: evidence 0–35; provenance 0–15; dated freshness 0–15; non-AI origin 0–5; declared source class 0–10; metadata completeness 0–10; independently assessed consistency 0–10. Unknown dates/consistency score zero. Source class is not independent certification." };
}
export function assertEvidence(input: { evidenceStatus: string; origin: string; provenance: unknown[] }, actor: DataCenterActor) {
  if (input.evidenceStatus === "VERIFIED" && (actor.kind === "AI" || input.origin === "AI" || !isDataCenterAdmin(actor) || !input.provenance.length))
    throw new DataCenterError("VERIFICATION_REQUIRES_HUMAN_ADMIN_AND_EVIDENCE", 403);
  if (input.evidenceStatus === "DERIVED" && !input.provenance.length) throw new DataCenterError("DERIVATION_PROVENANCE_REQUIRED");
}
