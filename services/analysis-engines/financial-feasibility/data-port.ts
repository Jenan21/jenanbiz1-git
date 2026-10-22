import { z } from "zod";
import { mapReferenceSchema } from "@/services/data-center/map-contract";
import { identifierSchema, sha256Schema } from "../shared/primitives";

export const financialSourceReferenceSchema = mapReferenceSchema;
export type FinancialSourceReference = z.infer<typeof financialSourceReferenceSchema>;
export const financialDiscoverySchema = z.object({
  mode: z.literal("EXACT"), policy: z.literal("exact-version"), asOf: z.null(), asOfExplicit: z.literal(false),
  status: z.enum(["FOUND", "NOT_AVAILABLE", "NO_COVERAGE", "NOT_IN_FORCE", "TOO_MANY_CANDIDATES"]),
  candidates: z.array(z.object({ reference: financialSourceReferenceSchema }).strict()).max(1),
  selected: z.null(), unavailableVersionIds: z.array(identifierSchema).max(1),
  notInForce: z.array(z.object({ versionId: identifierSchema, reason: z.string().min(1).max(100) }).strict()).max(1),
  truncated: z.literal(false),
}).strict();
export const financialReadSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("AVAILABLE"), reference: financialSourceReferenceSchema,
    content: z.string().min(1).max(200_000), contentKind: z.enum(["OTHER", "GEOJSON"]),
    integrity: z.object({ algorithm: z.literal("SHA-256"), checksum: sha256Schema, recomputed: z.literal(true) }).strict(),
  }).strict(),
  z.object({ status: z.literal("NOT_AVAILABLE") }).strict(),
  z.object({ status: z.literal("INTEGRITY_ERROR") }).strict(),
]);
export interface FinancialDataPort {
  discover(query: { versionIds: string[] }): Promise<z.infer<typeof financialDiscoverySchema>>;
  read(query: { versionId: string; expectedChecksum: string }): Promise<z.infer<typeof financialReadSchema>>;
}
