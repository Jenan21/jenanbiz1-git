import { z } from "zod";
import { mapReferenceSchema } from "@/services/data-center/map-contract";
import { identifierSchema, sha256Schema, timestampSchema } from "../shared/primitives";

// The existing Data Center reader names its pure metadata DTO "map-reference"; no Map service is involved.
export const marketSourceReferenceSchema = mapReferenceSchema;
export type MarketSourceReference = z.infer<typeof marketSourceReferenceSchema>;
export interface MarketDiscoveryQuery {
  versionIds?: string[];
  typeKeys?: string[];
  asOf?: string;
  limit?: number;
}
export const marketDiscoverySchema = z.object({
  mode: z.enum(["EXACT", "BY_TYPE"]), policy: z.string().min(1).max(120),
  asOf: timestampSchema.nullable(), asOfExplicit: z.boolean(),
  status: z.enum(["FOUND", "NOT_AVAILABLE", "NO_COVERAGE", "NOT_IN_FORCE", "TOO_MANY_CANDIDATES"]),
  candidates: z.array(z.object({ reference: marketSourceReferenceSchema }).strict()).max(100),
  selected: z.object({ reference: marketSourceReferenceSchema }).strict().nullable(),
  unavailableVersionIds: z.array(identifierSchema).max(50),
  notInForce: z.array(z.object({ versionId: identifierSchema, reason: z.string().min(1).max(100) }).strict()).max(500),
  truncated: z.boolean(),
}).strict();
export type MarketDiscovery = z.infer<typeof marketDiscoverySchema>;
export const marketReadSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("AVAILABLE"), reference: marketSourceReferenceSchema,
    content: z.string().min(1).max(200_000), contentKind: z.enum(["GEOJSON", "OTHER"]),
    integrity: z.object({ algorithm: z.literal("SHA-256"), checksum: sha256Schema, recomputed: z.literal(true) }).strict(),
  }).strict(),
  z.object({ status: z.literal("NOT_AVAILABLE") }).strict(),
  z.object({ status: z.literal("INTEGRITY_ERROR") }).strict(),
]);
export type MarketRead = z.infer<typeof marketReadSchema>;
export interface MarketDataPort {
  discover(query: MarketDiscoveryQuery): Promise<MarketDiscovery>;
  read(query: { versionId: string; expectedChecksum: string }): Promise<MarketRead>;
}
