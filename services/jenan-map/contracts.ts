import { z } from "zod";

export const idSchema = z.string().uuid();
const reason = z.string().trim().min(8).max(2000);
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/),
    source: z.string().trim().min(3).max(1000),
    sourceDate: z.string().datetime(),
    license: z.string().trim().min(3).max(2000),
  }).strict(),
  z.object({ action: z.literal("approve"), releaseId: idSchema, reason, confirmation: z.literal("APPROVE") }).strict(),
  z.object({ action: z.enum(["publish", "rollback"]), releaseId: idSchema, expectedRevision: z.number().int().nonnegative(), reason, confirmation: z.enum(["PUBLISH", "ROLLBACK"]) }).strict(),
  z.object({ action: z.literal("archive"), releaseId: idSchema, reason, confirmation: z.literal("ARCHIVE") }).strict(),
  z.object({ action: z.literal("runtime"), status: z.enum(["enabled", "maintenance", "disabled"]), expectedRevision: z.number().int().nonnegative(), reason, confirmation: z.literal("CHANGE RUNTIME") }).strict(),
]);
export type MapCommand = z.infer<typeof commandSchema>;
export const locationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict();
export const searchSchema = z.object({
  q: z.string().trim().min(2).max(160),
  releaseId: idSchema.optional(),
  latitude: z.coerce.number().finite().min(-90).max(90).optional(),
  longitude: z.coerce.number().finite().min(-180).max(180).optional(),
  radiusMeters: z.coerce.number().int().min(1).max(50_000).default(10_000),
}).refine((v) => (v.latitude === undefined) === (v.longitude === undefined), "Both coordinates required");

export class MapError extends Error {
  constructor(public readonly code: string, public readonly status = 409) {
    super(code);
  }
}

export type Release = {
  id: string; version: string; status: string; source: string; sourceDate: Date;
  license: string; createdBy: string; createdAt: Date; reviewedBy: string | null;
  reviewedAt: Date | null; reviewNotes: string | null; publishedAt: Date | null; failure: string | null;
};
export type MapRuntime = { status: "enabled" | "maintenance" | "disabled"; publishedReleaseId: string | null; revision: number };
export type Artifact = {
  id: string; releaseId: string; kind: string; storageKey: string; filename: string;
  mime: string; sha256: string; byteSize: bigint; publicSafe: boolean;
};
