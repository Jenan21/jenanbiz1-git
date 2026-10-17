import { hasPlatformAdminAccess, memberHasPermission } from "@/lib/auth/authorization";
import { db, type DbExecutor } from "@/lib/db";
import type { SystemRole, DataCenterSource } from "@/generated/prisma/client";
import { DataCenterError, type DataCenterActor } from "./contracts";

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
  const orgs = await authorizedOrganizationIds(actor, "data-center.read", tx);
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
  const own = source.scope === "PRIVATE" && source.ownerId === actor.id;
  const org = source.scope === "ORGANIZATION" && (await authorizedOrganizationIds(actor, write ? "data-center.write" : "data-center.read", tx)).includes(source.organizationId!);
  if (!own && !org && !(source.scope === "PLATFORM" && !write)) throw new DataCenterError("SOURCE_NOT_FOUND", 404);
  return source;
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
