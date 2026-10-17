import { z } from "zod";
import type { SystemRole, OrganizationMemberStatus } from "@/generated/prisma/client";

export interface DataCenterUser {
  id: string;
  systemRole: SystemRole;
  memberships: Array<{
    organizationId: string;
    status: OrganizationMemberStatus;
    role: null | { permissions: Array<{ permission: { key: string } }> };
  }>;
}

const id = z.string().min(1).max(128);
const date = z.iso.datetime({ offset: true });
export const layerSchema = z.enum(["DATA", "KNOWLEDGE", "ASSET", "EVIDENCE"]);
export const stateSchema = z.enum(["DRAFT", "UNDER_REVIEW", "APPROVED", "PUBLISHED", "DEPRECATED", "ARCHIVED", "REJECTED"]);
export const scopeSchema = z.object({
  scope: z.enum(["PLATFORM", "ORGANIZATION", "PRIVATE"]).default("PRIVATE"),
  organizationId: id.optional(),
}).refine((value) => value.scope === "ORGANIZATION" ? Boolean(value.organizationId) : !value.organizationId, "Only organization scope requires an organization");
export const createItemSchema = z.object({
  layer: layerSchema,
  title: z.string().trim().min(1).max(240),
  content: z.string().trim().min(1).max(200_000),
  sourceId: id,
  sourceDate: date,
  validUntil: date.optional(),
  confidence: z.number().min(0).max(1).default(0),
  tags: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
  verification: z.enum(["UNVERIFIED", "HUMAN_VERIFIED", "AI_ASSISTED"]).default("UNVERIFIED"),
  scope: z.enum(["PLATFORM", "ORGANIZATION", "PRIVATE"]).default("PRIVATE"),
  organizationId: id.optional(),
  itemId: id.optional(),
  expectedRevision: z.number().int().positive().optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.scope === "ORGANIZATION") !== Boolean(value.organizationId)) ctx.addIssue({ code: "custom", message: "Invalid organization scope" });
  if (Boolean(value.itemId) !== Boolean(value.expectedRevision)) ctx.addIssue({ code: "custom", message: "Version updates require itemId and expectedRevision" });
  if (value.validUntil && new Date(value.validUntil) <= new Date(value.sourceDate)) ctx.addIssue({ code: "custom", message: "Validity must follow source date" });
});
export const sourceSchema = z.object({
  name: z.string().trim().min(1).max(240),
  url: z.url().max(2048).refine((value) => /^https?:\/\//i.test(value)).optional(),
  quality: z.number().min(0).max(1),
  license: z.string().trim().min(1).max(500),
  allowRedistribution: z.boolean().default(false),
  scope: z.enum(["PLATFORM", "ORGANIZATION", "PRIVATE"]).default("PRIVATE"),
  organizationId: id.optional(),
}).strict().refine((value) => (value.scope === "ORGANIZATION") === Boolean(value.organizationId), "Invalid scope");
export const transitionSchema = z.object({ itemId: id, expectedRevision: z.number().int().positive(), state: stateSchema, notes: z.string().trim().min(1).max(2000) }).strict();
export const retrievalSchema = z.object({
  query: z.string().trim().min(1).max(500),
  mode: z.enum(["keyword", "semantic"]).default("keyword"),
  organizationId: id.optional(),
  robotId: id.optional(),
  missionId: id.optional(),
  limit: z.number().int().min(1).max(20).default(8),
}).strict().refine((value) => !value.missionId || Boolean(value.robotId), "Mission context requires a robot");
export const exportSchema = z.object({ itemIds: z.array(id).min(1).max(100), format: z.enum(["json", "csv"]).default("json") }).strict();
export const listSchema = z.object({ query: z.string().trim().max(200).optional(), state: stateSchema.optional(), limit: z.coerce.number().int().min(1).max(100).default(40) }).strict();
export const conflictSchema = z.object({
  leftVersionId: id, rightVersionId: id, field: z.string().min(1).max(128),
  leftValue: z.string().min(1).max(10_000), rightValue: z.string().min(1).max(10_000),
  notes: z.string().max(2000).default(""),
}).strict();
export const resolveConflictSchema = z.object({ conflictId: id, expectedRevision: z.number().int().positive(), resolution: z.string().trim().min(1).max(4000) }).strict();
export const grantSchema = z.object({
  itemId: id, robotId: id, missionId: id.optional(), expiresAt: date,
}).strict();
export const academySchema = z.object({
  itemId: id, versionId: id, specialty: z.string().trim().min(1).max(128),
  level: z.enum(["FOUNDATION", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
  startsAt: date.optional(), validUntil: date.optional(),
}).strict().refine((value) => !value.startsAt || !value.validUntil || new Date(value.startsAt) < new Date(value.validUntil), "Invalid academy validity");
export const evidenceLinkSchema = z.object({
  versionId: id, evidenceVersionId: id, relation: z.enum(["SUPPORTS", "CONTRADICTS", "CONTEXT"]),
  notes: z.string().trim().max(2000).default(""),
}).strict();
export const academyTransitionSchema = z.object({
  academyId: id, expectedRevision: z.number().int().positive(),
  state: stateSchema, notes: z.string().trim().min(1).max(2000),
}).strict();

export type CreateDataCenterItem = z.input<typeof createItemSchema>;
export type DataCenterLayer = z.infer<typeof layerSchema>;
export interface SemanticSearchProvider {
  search(input: { query: string; candidates: Array<{ versionId: string; text: string }>; limit: number }): Promise<Array<{ versionId: string; score: number }>>;
}
export interface ImportScanner {
  scan(bytes: Uint8Array, mimeType: string): Promise<{ clean: boolean }>;
}
