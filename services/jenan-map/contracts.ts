import { z } from "zod";

/** What a member reads while the map is in maintenance or switched off; the rest of the platform keeps working. */
export const MAP_STOPPED_MESSAGE = "Jenan PRO Map قيد التحديث حاليًا، ستعود الخدمة قريبًا.";

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
  z.object({ action: z.enum(["publish", "rollback"]), releaseId: idSchema, expectedRevision: z.number().int().nonnegative(), expectedPublishedReleaseId: idSchema.nullable(), reason, confirmation: z.enum(["PUBLISH", "ROLLBACK"]) }).strict(),
  z.object({ action: z.literal("archive"), releaseId: idSchema, reason, confirmation: z.literal("ARCHIVE") }).strict(),
  z.object({ action: z.literal("runtime"), status: z.enum(["enabled", "maintenance", "disabled"]), maintenanceMessage: z.string().trim().min(3).max(1000).nullable().optional(), expectedRevision: z.number().int().nonnegative(), expectedPublishedReleaseId: idSchema.nullable().optional(), reason, confirmation: z.literal("CHANGE RUNTIME") }).strict(),
]);
export type MapCommand = z.infer<typeof commandSchema>;
export const locationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  releaseId: idSchema.optional(),
}).strict();
export const searchSchema = z.object({
  q: z.string().trim().min(2).max(160),
  releaseId: idSchema.optional(),
  latitude: z.coerce.number().finite().min(-90).max(90).optional(),
  longitude: z.coerce.number().finite().min(-180).max(180).optional(),
  radiusMeters: z.coerce.number().int().min(1).max(50_000).default(10_000),
  layerIds: z.string().max(4200).transform((value) => value ? value.split(",") : [])
    .pipe(z.array(z.string().regex(/^[a-z][a-z-]{0,63}$/)).max(64)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate layers")).optional(),
}).refine((v) => (v.latitude === undefined) === (v.longitude === undefined), "Both coordinates required");
export const savedLocationSchema = locationSchema.extend({
  releaseId: idSchema,
  source: z.enum(["map", "search", "geolocation", "coordinates"]),
});
export type SavedLocation = {
  latitude: number; longitude: number; country: "SA";
  region: string | null; city: string | null; district: string | null; formattedAddress: string | null;
  source: "map" | "search" | "geolocation" | "coordinates"; selectedAt: Date; releaseId: string;
};

export const mapPreferencesSchema = z.object({
  releaseId: idSchema,
  radius: z.union([z.literal(500), z.literal(1000), z.literal(3000), z.literal(5000)]),
  visibleLayers: z.array(z.string().regex(/^[a-z][a-z-]{0,63}$/)).max(64)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate layers"),
  viewport: z.object({
    latitude: z.number().finite().min(16).max(33),
    longitude: z.number().finite().min(34).max(56.5),
    zoom: z.number().finite().min(3).max(18),
  }).strict().nullable(),
  expectedRevision: z.number().int().nonnegative(),
}).strict();

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
export type MapRuntime = { status: "enabled" | "maintenance" | "disabled"; maintenanceMessage: string | null; publishedReleaseId: string | null; revision: number };
export type Artifact = {
  id: string; releaseId: string; kind: string; storageKey: string; filename: string;
  mime: string; sha256: string; byteSize: bigint; publicSafe: boolean;
  exportAllowed?: boolean; exportLicense?: string | null;
};
