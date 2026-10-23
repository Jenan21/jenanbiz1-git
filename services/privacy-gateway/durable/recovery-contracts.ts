import { z } from "zod";
import { hashSchema, opaqueIdSchema, type PrivacyJob, type PrivacyRole } from "../contracts";
import type { PrivacyAdmission, PrivacyInventoryArtifact } from "@/generated/prisma/client";
import type { ScanVerdict } from "../intake/contracts";
import type { ReceiptSigner } from "../sanitization/contracts";
import type { DurableRuntime } from "./contracts";

export const recoveryStates = ["INTAKE_ACCEPTED", "STAGING", "SCAN_PENDING", "SCAN_CLEAN", "EXTRACTING",
  "RAW_READY", "CLASSIFYING", "SANITIZING", "SANITIZATION_CANDIDATE_READY", "SANITIZATION_VERIFICATION",
  "SANITIZATION_VERIFIED", "MANUAL_PRIVACY_REVIEW_REQUIRED", "FAILED", "CANCELLED"] as const;
export const recoveryCommandSchema = z.object({
  jobId: opaqueIdSchema, actorId: opaqueIdSchema, attemptId: opaqueIdSchema, fence: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(), key: opaqueIdSchema, workerId: opaqueIdSchema,
}).strict();
export type RecoveryCommand = z.infer<typeof recoveryCommandSchema>;
export const admissionSchema = z.object({
  jobId: opaqueIdSchema, packageId: opaqueIdSchema, organizationId: opaqueIdSchema, clientId: opaqueIdSchema,
  purposeId: opaqueIdSchema, usageBasisId: opaqueIdSchema, ownerId: opaqueIdSchema,
  attemptId: opaqueIdSchema, fence: z.number().int().nonnegative(), policyHash: hashSchema,
  checksum: hashSchema, size: z.number().int().positive().max(8 * 1024 * 1024), media: z.enum(["CSV", "ZIP"]),
  key: opaqueIdSchema,
}).strict();
export type AdmissionInput = z.infer<typeof admissionSchema>;
export type InventoryArtifact = PrivacyInventoryArtifact;
export type Admission = PrivacyAdmission;
export interface RecoveryObjects {
  readonly qualification: "TEST_ONLY";
  read(artifact: InventoryArtifact): Promise<Uint8Array | null>;
  write(artifact: InventoryArtifact, bytes: Uint8Array, authorize: () => Promise<void>): Promise<void>;
  tombstone(jobId: string): Promise<void>;
  remove(artifact: InventoryArtifact): Promise<void>;
  saveReceipt(objectRef: string, value: unknown, hash: string): Promise<void>;
}
export interface RecoveryRuntime extends DurableRuntime {
  readonly scannerVersion: string;
  scanner(bytes: Uint8Array, signal: AbortSignal): Promise<ScanVerdict>;
  signer: ReceiptSigner;
  checkpoint(point: string): Promise<void>;
}
export type RecoveryRawAuthority = {
  bindDurableAuthority(job: PrivacyJob, actorId: string,
    authority: (actorId: string, role: "INTAKE" | "SANITIZER" | "VERIFIER") => Promise<void>): Promise<void>;
};
export const recoveryRole = (state: string): PrivacyRole =>
  state === "SANITIZATION_VERIFICATION" || state === "SANITIZATION_VERIFIED" ? "VERIFIER" :
    ["RAW_READY", "CLASSIFYING", "SANITIZING", "SANITIZATION_CANDIDATE_READY"].includes(state) ? "SANITIZER" : "INTAKE";
