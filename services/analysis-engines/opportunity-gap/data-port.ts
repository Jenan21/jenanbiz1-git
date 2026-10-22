import { z } from "zod";
import { mapReferenceSchema } from "@/services/data-center/map-contract";
import { identifierSchema, sha256Schema } from "../shared/primitives";

// Existing pure Data Center metadata DTO; its historical Map name grants no Map capability.
export const opportunitySourceReferenceSchema = mapReferenceSchema;
export type OpportunitySourceReference = z.infer<typeof opportunitySourceReferenceSchema>;
export const opportunityDiscoverySchema = z.object({
  mode: z.literal("EXACT"), policy: z.literal("exact-version"),
  asOf: z.null(), asOfExplicit: z.literal(false),
  status: z.enum(["FOUND", "NOT_AVAILABLE", "NO_COVERAGE", "NOT_IN_FORCE", "TOO_MANY_CANDIDATES"]),
  candidates: z.array(z.object({ reference: opportunitySourceReferenceSchema }).strict()).max(1),
  selected: z.null(), unavailableVersionIds: z.array(identifierSchema).max(1),
  notInForce: z.array(z.object({ versionId: identifierSchema, reason: z.string().min(1).max(100) }).strict()).max(1),
  truncated: z.literal(false),
}).strict();
export const opportunityReadSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("AVAILABLE"), reference: opportunitySourceReferenceSchema,
    content: z.string().min(1).max(200_000), contentKind: z.enum(["OTHER", "GEOJSON"]),
    integrity: z.object({ algorithm: z.literal("SHA-256"), checksum: sha256Schema, recomputed: z.literal(true) }).strict(),
  }).strict(),
  z.object({ status: z.literal("NOT_AVAILABLE") }).strict(),
  z.object({ status: z.literal("INTEGRITY_ERROR") }).strict(),
]);
export interface OpportunityDataPort {
  discover(query: { versionIds: string[] }): Promise<z.infer<typeof opportunityDiscoverySchema>>;
  read(query: { versionId: string; expectedChecksum: string }): Promise<z.infer<typeof opportunityReadSchema>>;
}
