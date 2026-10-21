import { z } from "zod";
import { mapReferenceSchema } from "@/services/data-center/map-contract";
import { identifierSchema, sha256Schema, timestampSchema } from "../shared/primitives";

// Data Center's existing pure metadata DTO has a historical Map name; no Map service is called.
export const competitorSourceReferenceSchema = mapReferenceSchema;
export type CompetitorSourceReference = z.infer<typeof competitorSourceReferenceSchema>;
export const competitorDiscoverySchema = z.object({
  mode: z.enum(["EXACT", "BY_TYPE"]), policy: z.string().min(1).max(120),
  asOf: timestampSchema.nullable(), asOfExplicit: z.boolean(),
  status: z.enum(["FOUND", "NOT_AVAILABLE", "NO_COVERAGE", "NOT_IN_FORCE", "TOO_MANY_CANDIDATES"]),
  candidates: z.array(z.object({ reference: competitorSourceReferenceSchema }).strict()).max(100),
  selected: z.object({ reference: competitorSourceReferenceSchema }).strict().nullable(),
  unavailableVersionIds: z.array(identifierSchema).max(50),
  notInForce: z.array(z.object({ versionId: identifierSchema, reason: z.string().min(1).max(100) }).strict()).max(500),
  truncated: z.boolean(),
}).strict();
export type CompetitorDiscovery = z.infer<typeof competitorDiscoverySchema>;
export const competitorReadSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("AVAILABLE"), reference: competitorSourceReferenceSchema,
    content: z.string().min(1).max(200_000), contentKind: z.enum(["OTHER", "GEOJSON"]),
    integrity: z.object({ algorithm: z.literal("SHA-256"), checksum: sha256Schema, recomputed: z.literal(true) }).strict(),
  }).strict(),
  z.object({ status: z.literal("NOT_AVAILABLE") }).strict(),
  z.object({ status: z.literal("INTEGRITY_ERROR") }).strict(),
]);
export interface CompetitorDataPort {
  discover(query: { versionIds?: string[]; typeKeys?: string[]; asOf?: string; limit?: number }): Promise<z.infer<typeof competitorDiscoverySchema>>;
  read(query: { versionId: string; expectedChecksum: string }): Promise<z.infer<typeof competitorReadSchema>>;
}
