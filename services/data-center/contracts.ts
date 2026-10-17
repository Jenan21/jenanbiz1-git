import { z } from "zod";

export const layers = ["DATA", "KNOWLEDGE", "INTELLIGENCE", "CONTEXT"] as const;
export const evidenceStates = ["VERIFIED", "ESTIMATED", "DERIVED", "UNVERIFIED", "CONFLICTED"] as const;
export const lifecycleStates = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;
const text = (max: number) => z.string().trim().min(1).max(max);
const id = text(128);
const tags = z.array(text(80)).max(30).default([]);
export const sourceSchema = z.object({
  name: text(240), kind: z.enum(["MANUAL", "FILE", "OFFICIAL", "ACADEMY", "GENERATED", "API"]),
  scope: z.enum(["PLATFORM", "ORGANIZATION", "PRIVATE"]), organizationId: id.optional(),
  owner: text(240), license: text(500), allowExport: z.boolean().default(false),
  allowRetrieval: z.boolean().default(true), freshnessDays: z.number().int().min(1).max(3650).default(90),
}).strict().refine((v) => v.scope === "ORGANIZATION" ? !!v.organizationId : !v.organizationId, "Organization scope requires organizationId exclusively");
export const itemSchema = z.object({
  sourceId: id, title: text(240), typeKey: text(80), layer: z.enum(layers),
  content: text(200_000), evidenceStatus: z.enum(evidenceStates).default("UNVERIFIED"),
  provenance: z.array(z.object({ label: text(240), reference: text(2000), kind: z.enum(["SOURCE", "CALCULATION", "DOCUMENT", "HUMAN_REVIEW"]) }).strict()).max(100).default([]),
  specialties: tags, missionContexts: tags, requiredPermission: text(100).optional(),
  sourcePublishedAt: z.iso.datetime().optional(), expiresAt: z.iso.datetime().optional(),
  origin: z.enum(["HUMAN", "AI", "IMPORT", "CALCULATION", "ACADEMY"]).default("HUMAN"),
}).strict();
export const versionSchema = itemSchema.omit({ sourceId: true, typeKey: true, layer: true }).extend({ itemId: id, reason: text(2000) });
export const commandSchema = z.discriminatedUnion("action", [
  sourceSchema.safeExtend({ action: z.literal("create-source") }),
  itemSchema.extend({ action: z.literal("create-item") }),
  versionSchema.extend({ action: z.literal("create-version") }),
  z.object({ action: z.literal("register-type"), key: z.string().regex(/^[a-z][a-z0-9._-]{1,79}$/), label: text(240), layer: z.enum(layers), requiresIndependentReview: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("transition-item"), itemId: id, status: z.enum(lifecycleStates), reason: text(2000) }).strict(),
  z.object({ action: z.literal("review-item"), itemId: id, decision: z.enum(["APPROVED", "REJECTED"]), notes: text(4000) }).strict(),
  z.object({ action: z.literal("create-conflict"), itemId: id, otherItemId: id, reason: text(4000) }).strict(),
  z.object({ action: z.literal("resolve-conflict"), conflictId: id, resolution: z.enum(["KEEP_FIRST", "KEEP_SECOND", "KEEP_BOTH", "SUPERSEDED"]), notes: text(4000) }).strict(),
  z.object({ action: z.literal("record-usage"), versionId: id, consumer: text(120), missionId: id.optional(), purpose: text(500), specialty: text(80).optional(), missionContext: text(80).optional() }).strict(),
  z.object({ action: z.literal("request-academy-release"), versionId: id, targetKind: z.enum(["COURSE", "ROBOT", "SPECIALTY"]), targetId: id, notes: text(4000) }).strict(),
  z.object({ action: z.literal("approve-academy-release"), releaseId: id, notes: text(4000) }).strict(),
  z.object({ action: z.literal("import-academy-source"), sourceId: id, resourceVersionId: id }).strict(),
]);
export type CreateSourceInput = z.input<typeof sourceSchema>;
export type CreateItemInput = z.input<typeof itemSchema>;
export type DataCenterCommand = z.infer<typeof commandSchema>;
export interface DataCenterActor { id: string; systemRole: string; kind?: "HUMAN" | "AI"; }
export class DataCenterError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); }
}
export interface DataCenterContextRequest {
  query?: string; mode?: "keyword" | "semantic"; organizationId?: string;
  specialty?: string; missionContext?: string; typeKey?: string;
  layer?: typeof layers[number]; limit?: number; page?: number;
}
export interface DataCenterSemanticAdapter {
  readonly name: string;
  search(input: { query: string; candidateVersionIds: string[]; limit: number }): Promise<string[]>;
}
export interface DataCenterScanner {
  readonly name: string;
  scan(bytes: Uint8Array): Promise<"CLEAN" | "INFECTED" | "UNAVAILABLE">;
}
export interface DataCenterGeoFeature {
  type: "Feature";
  geometry: { type: string; coordinates?: unknown; geometries?: unknown[] } | null;
  properties: Record<string, unknown> | null;
}
