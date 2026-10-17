import { hasPlatformAdminAccess, memberHasPermission } from "@/lib/auth/authorization";
import { db, type DbExecutor } from "@/lib/db";
import type { SystemRole, DataCenterSource } from "@/generated/prisma/client";
import { DataCenterError, type DataCenterActor } from "./contracts";

export function isDataCenterAdmin(actor: DataCenterActor) {
  return actor.kind !== "AI" && hasPlatformAdminAccess(actor.systemRole as SystemRole);
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
  if (isDataCenterAdmin(actor)) return {};
  const orgs = await authorizedOrganizationIds(actor, "data-center.read", tx);
  return { OR: [
    { scope: "PLATFORM" as const },
    { scope: "PRIVATE" as const, ownerId: actor.id },
    { scope: "ORGANIZATION" as const, organizationId: { in: orgs } },
  ] };
}
export async function assertSourceAccess(source: DataCenterSource | null, actor: DataCenterActor, write = false, tx: DbExecutor = db) {
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
}) {
  const now = input.now ?? new Date();
  const evidence = ({ VERIFIED: 50, ESTIMATED: 25, DERIVED: 35, UNVERIFIED: 5, CONFLICTED: 0 } as Record<string, number>)[input.evidenceStatus] ?? 0;
  const provenance = Math.min(20, input.provenanceCount * 5);
  const ageDays = input.sourcePublishedAt ? Math.max(0, (now.getTime() - input.sourcePublishedAt.getTime()) / 86_400_000) : null;
  const expired = !!input.expiresAt && input.expiresAt <= now;
  const freshness = expired || ageDays === null ? 0 : Math.max(0, Math.round(20 * (1 - ageDays / input.freshnessDays)));
  const origin = input.origin === "AI" ? 0 : 10;
  return { score: input.evidenceStatus === "CONFLICTED" ? 0 : evidence + provenance + freshness + origin,
    factors: { evidence, provenance, freshness, origin }, evaluatedAt: now.toISOString(), ageDays,
    policyVersion: "dc-confidence-v1", expired, explanation: "Evidence 0–50; provenance 0–20; dated freshness 0–20; non-AI origin 0–10. Missing dates score zero freshness. Not a verification." };
}
export function assertEvidence(input: { evidenceStatus: string; origin: string; provenance: unknown[] }, actor: DataCenterActor) {
  if (input.evidenceStatus === "VERIFIED" && (actor.kind === "AI" || input.origin === "AI" || !isDataCenterAdmin(actor) || !input.provenance.length))
    throw new DataCenterError("VERIFICATION_REQUIRES_HUMAN_ADMIN_AND_EVIDENCE", 403);
  if (input.evidenceStatus === "DERIVED" && !input.provenance.length) throw new DataCenterError("DERIVATION_PROVENANCE_REQUIRED");
}
