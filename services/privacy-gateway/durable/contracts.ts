import { z } from "zod";
import { hashSchema, instantSchema, opaqueIdSchema, publicationReceiptSchema, destructionReceiptSchema,
  type PrivacyActor, type PrivacyGrant, type PrivacyJob, type SanitizationPolicy } from "../contracts";
import { evidenceSchema, datasetSchema, type VerificationEvidence } from "../sanitization/contracts";
import type { VerificationReceipt } from "../contracts";
import type { DbExecutor } from "@/lib/db";

export const durableCodes = ["AUTHORIZATION_DENIED", "STALE_REVISION", "STALE_ATTEMPT", "IDEMPOTENCY_CONFLICT",
  "HASH_MISMATCH", "LINEAGE_MISMATCH", "VERIFICATION_FAILED", "PUBLICATION_RECONCILIATION_REQUIRED",
  "DESTRUCTION_PENDING", "DESTRUCTION_FAILED", "EXPIRED", "ADAPTER_UNAVAILABLE", "AUDIT_TAMPERED", "ILLEGAL_TRANSITION"] as const;
export class DurablePrivacyError extends Error {
  constructor(readonly code: typeof durableCodes[number]) { super(code); this.name = "DurablePrivacyError"; }
}
export async function adapterResult<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    throw new DurablePrivacyError(error instanceof DurablePrivacyError ? error.code : "ADAPTER_UNAVAILABLE");
  }
}
export const exactPublicationSchema = z.object({
  sourceId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), itemId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  versionId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), version: z.number().int().positive(), checksum: hashSchema,
}).strict();
export type ExactPublication = z.infer<typeof exactPublicationSchema>;
export const destructionEvidenceSchema = z.object({
  contract: z.literal("jenan.privacy.destruction-evidence/v1"),
  jobId: opaqueIdSchema, packageId: opaqueIdSchema, attemptId: opaqueIdSchema,
  fence: z.number().int().nonnegative(), inventoryHash: hashSchema, artifactCount: z.number().int().nonnegative().max(1000),
  cleanupAttempt: z.number().int().positive(), receiptHash: hashSchema,
  keyRefs: z.array(opaqueIdSchema).max(1000), evidenceRefs: z.array(opaqueIdSchema).min(1).max(1000),
  categories: z.array(z.enum(["ORIGINAL", "EXTRACTED", "TEMPORARY", "OCR", "CACHE", "QUARANTINE", "TOKEN_MAPPING",
    "TEMPORARY_KEY", "MULTIPART", "STAGING", "SANITIZED_WORKING_COPY"])).length(11),
  result: z.literal("M1_EVIDENCE_COMPLETE"),
}).strict().refine((v) => new Set(v.categories).size === 11 && new Set(v.keyRefs).size === v.keyRefs.length &&
  new Set(v.evidenceRefs).size === v.evidenceRefs.length, "Incomplete destruction evidence");
export type DestructionEvidence = z.infer<typeof destructionEvidenceSchema>;
export const commandSchema = z.object({
  jobId: opaqueIdSchema, actorId: opaqueIdSchema, attemptId: opaqueIdSchema,
  fence: z.number().int().nonnegative(), revision: z.number().int().nonnegative(), key: opaqueIdSchema,
}).strict();
export type DurableCommand = z.infer<typeof commandSchema>;
export const workStates = ["READY", "LEASED", "DISPATCHED", "RECONCILIATION_REQUIRED", "COMPLETED", "FAILED"] as const;
export type WorkKind = "PUBLICATION" | "DESTRUCTION";
export type EnrollBundle = { job: PrivacyJob; policyHash: string; dataset: z.infer<typeof datasetSchema>;
  receipt: VerificationReceipt; evidence: VerificationEvidence; artifactObject: string; receiptObject: string };
export interface DurableRuntime {
  now(): string; id(): string;
  authorization(jobId: string, actorId: string): Promise<{ actor: PrivacyActor; grants: PrivacyGrant[] }>;
  policy(hash: string): Promise<SanitizationPolicy>;
  authenticateVerification(bundle: EnrollBundle): Promise<boolean>;
}
export interface GovernedArtifactStore {
  readonly qualification: "TEST_ONLY";
  dataset(objectRef: string, hash: string): Promise<unknown>;
  verification(objectRef: string, hash: string): Promise<EnrollBundle>;
  saveReceipt(objectRef: string, value: unknown, hash: string): Promise<void>;
}
export interface PublicationPort {
  readonly qualification: "TEST_ONLY" | "GOVERNED_DATA_CENTER";
  dispatch(intent: { releaseId: string; jobId: string; actorId: string; artifactHash: string;
    workerId: string; revision: number; attemptId: string; fence: number; dataset: z.infer<typeof datasetSchema> }): Promise<unknown>;
  reconcile(intent: { releaseId: string; jobId: string; actorId: string; artifactHash: string;
    workerId: string; revision: number; attemptId: string; fence: number; exact: ExactPublication | null }): Promise<unknown>;
  authenticate(receipt: z.infer<typeof publicationReceiptSchema>): Promise<boolean>;
  confirm(tx: DbExecutor, receipt: z.infer<typeof publicationReceiptSchema>): Promise<boolean>;
}
export interface DestructionPort {
  readonly qualification: "TEST_ONLY";
  revoke(jobId: string, attemptId: string, fence: number): Promise<void>;
  destroy(intent: { jobId: string; packageId: string; attemptId: string; fence: number; inventoryHash: string;
    inventoryCount: number; cleanupAttempt: number }): Promise<unknown>;
  authenticate(receipt: z.infer<typeof destructionReceiptSchema>, evidence: DestructionEvidence): Promise<boolean>;
}
export const enrollmentRefsSchema = z.object({ artifactObject: opaqueIdSchema, receiptObject: opaqueIdSchema }).strict();
export const leaseSchema = z.object({ workerId: opaqueIdSchema, until: instantSchema }).strict();
export { datasetSchema, evidenceSchema };
