import { hasPermission } from "@/lib/auth/authorization";
import type { DataCenterUser } from "./contracts";

export class DataCenterError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "DATA_CENTER_ERROR") { super(message); }
}
export interface ScopedRecord { scope: string; organizationId: string | null; ownerId: string }
export function visibleScope(user: DataCenterUser) {
  return { OR: [
    { scope: "PLATFORM" as const },
    { scope: "PRIVATE" as const, ownerId: user.id },
    { scope: "ORGANIZATION" as const, organizationId: { in: user.memberships.filter((entry) => entry.status === "ACTIVE").map((entry) => entry.organizationId) } },
  ] };
}
export function canSee(user: DataCenterUser, item: ScopedRecord) {
  return item.scope === "PLATFORM" || (item.scope === "PRIVATE" && item.ownerId === user.id) || (item.scope === "ORGANIZATION" && user.memberships.some((entry) => entry.organizationId === item.organizationId && entry.status === "ACTIVE"));
}
export function requirePermission(user: DataCenterUser, action: string, item?: ScopedRecord) {
  if (item && !canSee(user, item)) throw new DataCenterError("Record not found", 404, "NOT_FOUND");
  if (item?.scope === "PLATFORM" && !["ADMIN", "SUPER_ADMIN"].includes(user.systemRole)) throw new DataCenterError("Platform management requires platform authority", 403, "FORBIDDEN");
  // hasPermission's platform-admin bypass must never bypass tenant visibility.
  if (!hasPermission(user, `data-center.${action}`, item?.organizationId ?? undefined)) throw new DataCenterError("Permission denied", 403, "FORBIDDEN");
}
export function managementScope(user: DataCenterUser) {
  const admin = ["ADMIN", "SUPER_ADMIN"].includes(user.systemRole);
  return { OR: [
    ...(admin ? [{ scope: "PLATFORM" as const }] : []),
    ...(hasPermission(user, "data-center.read") ? [{ scope: "PRIVATE" as const, ownerId: user.id }] : []),
    { scope: "ORGANIZATION" as const, organizationId: { in: user.memberships.filter((entry) => entry.status === "ACTIVE" && hasPermission(user, "data-center.read", entry.organizationId)).map((entry) => entry.organizationId) } },
  ] };
}
export function compatibleScope(parent: ScopedRecord, child: ScopedRecord) {
  return parent.scope === child.scope && parent.organizationId === child.organizationId && (parent.scope !== "PRIVATE" || parent.ownerId === child.ownerId);
}
export const transitions: Record<string, readonly string[]> = {
  DRAFT: ["UNDER_REVIEW", "ARCHIVED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "DRAFT"],
  APPROVED: ["PUBLISHED", "DRAFT", "ARCHIVED"],
  PUBLISHED: ["DEPRECATED", "ARCHIVED"],
  DEPRECATED: ["ARCHIVED"],
  REJECTED: ["DRAFT", "ARCHIVED"],
  ARCHIVED: [],
};
export function assertTransition(from: string, to: string) {
  if (!transitions[from]?.includes(to)) throw new DataCenterError("Invalid workflow transition", 409, "INVALID_TRANSITION");
}
export function freshnessConfidence(input: { confidence: number; quality: number; sourceDate: Date; validUntil?: Date | null; verification: string }, now = new Date()) {
  const ageDays = Math.max(0, (now.getTime() - input.sourceDate.getTime()) / 86_400_000);
  const freshness = input.sourceDate > now || (input.validUntil && input.validUntil <= now) ? 0 : Math.max(0.1, 1 - ageDays / 730);
  const verification = input.verification === "HUMAN_VERIFIED" ? 1 : input.verification === "AI_ASSISTED" ? 0.6 : 0.5;
  return { confidence: Math.round(input.confidence * input.quality * freshness * verification * 10_000) / 10_000, factors: { declared: input.confidence, sourceQuality: input.quality, freshness, verification }, expired: Boolean(input.validUntil && input.validUntil <= now) };
}
