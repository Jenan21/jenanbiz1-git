import { z } from "zod";
import {
  PrivacyError, destructionReceiptSchema, destructionStates, hashSchema, instantSchema, jobSchema, opaqueIdSchema,
  processingStates, publicationReceiptSchema, publicationStates, reviewSchema, sanitizedArtifactSchema, verificationReceiptSchema,
  type PrivacyActor, type PrivacyGrant, type PrivacyJob, type PrivacyRole, type SanitizationPolicy,
} from "./contracts";
import { assertPrivacyRole, assertRawAccess, parsePrivacy, privacyHash, samePrivacyValue, validatePolicy } from "./policy";

export const processingEdges: Readonly<Record<PrivacyJob["processing"], readonly PrivacyJob["processing"][]>> = {
  CREATED: ["RECEIVING"], RECEIVING: ["INTAKE_VALIDATING"], INTAKE_VALIDATING: ["MALWARE_SCANNING"],
  MALWARE_SCANNING: ["RAW_READY"], RAW_READY: ["CLASSIFYING"], CLASSIFYING: ["EXTRACTING"],
  EXTRACTING: ["SANITIZING"], SANITIZING: ["SANITIZATION_VERIFICATION"],
  SANITIZATION_VERIFICATION: ["SANITIZATION_VERIFIED", "MANUAL_PRIVACY_REVIEW_REQUIRED"],
  MANUAL_PRIVACY_REVIEW_REQUIRED: ["SANITIZATION_VERIFICATION"],
  SANITIZATION_VERIFIED: [], REJECTED: [], FAILED: [], CANCELLED: [], EXPIRED: [],
};
export const publicationEdges: Readonly<Record<PrivacyJob["publication"], readonly PrivacyJob["publication"][]>> = {
  NOT_REQUESTED: ["RELEASE_AUTHORIZED", "PUBLICATION_BLOCKED"],
  RELEASE_AUTHORIZED: ["PUBLISHING", "PUBLICATION_BLOCKED"],
  PUBLISHING: ["SANITIZED_PUBLISHED", "RECONCILIATION_REQUIRED"],
  RECONCILIATION_REQUIRED: ["SANITIZED_PUBLISHED", "PUBLICATION_BLOCKED"],
  SANITIZED_PUBLISHED: [], PUBLICATION_BLOCKED: [],
};
export const destructionEdges: Readonly<Record<PrivacyJob["destruction"], readonly PrivacyJob["destruction"][]>> = {
  RAW_PRESENT: ["DESTRUCTION_PENDING"], DESTRUCTION_PENDING: ["RAW_ACCESS_REVOKED"],
  RAW_ACCESS_REVOKED: ["DESTRUCTION_VERIFYING"], DESTRUCTION_VERIFYING: ["RAW_DESTROYED", "DESTRUCTION_FAILED"],
  DESTRUCTION_FAILED: ["DESTRUCTION_PENDING"], RAW_DESTROYED: [],
};
const commandSchema = z.discriminatedUnion("lifecycle", [
  z.object({ lifecycle: z.literal("processing"), target: z.enum(processingStates) }).strict(),
  z.object({ lifecycle: z.literal("publication"), target: z.enum(publicationStates) }).strict(),
  z.object({ lifecycle: z.literal("destruction"), target: z.enum(destructionStates) }).strict(),
]);
const contextSchema = z.object({
  now: instantSchema, expectedRevision: z.number().int().nonnegative(), expectedFence: z.number().int().nonnegative(),
  attemptId: opaqueIdSchema, policyHash: hashSchema,
}).strict();
const evidenceSchema = z.object({
  scanCleared: z.literal(true).optional(), review: reviewSchema.optional(),
  artifact: sanitizedArtifactSchema.optional(), verification: verificationReceiptSchema.optional(),
  publication: publicationReceiptSchema.optional(), destruction: destructionReceiptSchema.optional(),
  authenticatedReceiptHash: hashSchema.optional(),
}).strict();
export type TransitionEvidence = z.infer<typeof evidenceSchema>;
export type TransitionCommand = z.infer<typeof commandSchema>;
export type TransitionContext = z.infer<typeof contextSchema>;
const failures = ["REJECTED", "FAILED", "CANCELLED", "EXPIRED"] as const;
function failureState(state: string) { return failures.some((failure) => failure === state); }
function bound(job: PrivacyJob, value: { scope: PrivacyJob["scope"]; attemptId: string; fence: number; pins: PrivacyJob["pins"] }) {
  if (!samePrivacyValue(job.scope, value.scope) || job.attemptId !== value.attemptId || job.fence !== value.fence ||
    !samePrivacyValue(job.pins, value.pins)) throw new PrivacyError("LINEAGE_MISMATCH");
}
export function validatePrivacyJob(raw: unknown): PrivacyJob {
  const job = parsePrivacy(jobSchema, raw);
  for (const value of [job.artifact, job.verification, job.publicationReceipt, job.destructionReceipt]) if (value) bound(job, value);
  if (job.artifact && (job.artifact.createdAt < job.createdAt || job.artifact.createdAt > job.updatedAt || job.artifact.expiresAt > job.rawExpiresAt) ||
    job.verifierId && (job.processorIds.includes(job.verifierId) || job.verifierId === job.ownerId) ||
    job.publisherId && (job.processorIds.includes(job.publisherId) || job.publisherId === job.verifierId || job.publisherId === job.ownerId)) {
    throw new PrivacyError("AUTHORIZATION_DENIED");
  }
  if (job.verification) {
    if (!job.artifact || job.verification.artifactId !== job.artifact.id ||
      job.verification.artifactHash !== job.artifact.contentHash || job.verification.lineageHash !== job.artifact.lineageHash ||
      job.verification.schemaHash !== job.artifact.schemaHash) throw new PrivacyError("HASH_MISMATCH");
    if (job.verification.actorId !== job.verifierId || job.verification.at > job.updatedAt ||
      job.verification.at < job.artifact.createdAt || job.verification.expiresAt > job.artifact.expiresAt) throw new PrivacyError("LINEAGE_MISMATCH");
  }
  if (job.publication !== "NOT_REQUESTED" && job.publication !== "PUBLICATION_BLOCKED" &&
    job.processing !== "SANITIZATION_VERIFIED") throw new PrivacyError("VERIFICATION_FAILED");
  if (job.publicationReceipt) {
    if (!job.verification || !job.artifact || job.publicationReceipt.verificationReceiptId !== job.verification.id ||
      job.publicationReceipt.artifactId !== job.artifact.id || job.publicationReceipt.artifactHash !== job.artifact.contentHash) {
      throw new PrivacyError("HASH_MISMATCH");
    }
    if (job.publicationReceipt && job.publication !== "SANITIZED_PUBLISHED" ||
      job.verification && job.processing !== "SANITIZATION_VERIFIED" ||
      job.destructionReceipt && job.destruction !== "RAW_DESTROYED") throw new PrivacyError("ILLEGAL_TRANSITION");
    if (job.publicationReceipt.actorId !== job.publisherId || job.publicationReceipt.at < job.verification.at ||
      job.publicationReceipt.at >= job.verification.expiresAt || job.publicationReceipt.at > job.updatedAt ||
      job.rawAccessRevokedAt !== job.publicationReceipt.rawAccessRevokedAt) throw new PrivacyError("LINEAGE_MISMATCH");
  }
  if (job.destruction === "RAW_DESTROYED" && !job.rawAccessRevokedAt ||
    job.destructionReceipt && (!job.rawAccessRevokedAt || job.destructionReceipt.at < job.rawAccessRevokedAt ||
      job.destructionReceipt.at > job.updatedAt)) throw new PrivacyError("LINEAGE_MISMATCH");
  if (job.destructionReceipt && (job.destructionReceipt.inventoryHash !== job.rawInventoryHash ||
    job.destructionReceipt.inventoryCount !== job.rawInventoryCount)) throw new PrivacyError("LINEAGE_MISMATCH");
  return job;
}
export function assertJobRawAccess(job: PrivacyJob, actor: PrivacyActor, grants: PrivacyGrant[], now: string) {
  const current = validatePrivacyJob(job); parsePrivacy(instantSchema, now);
  if (now < current.updatedAt || now >= current.rawExpiresAt || current.rawAccessRevokedAt ||
    current.destruction !== "RAW_PRESENT" || failureState(current.processing)) throw new PrivacyError("AUTHORIZATION_DENIED");
  assertRawAccess(actor, grants, current.scope, now);
}
function checkReceipt(receipt: unknown, evidence: TransitionEvidence) {
  if (!evidence.authenticatedReceiptHash || evidence.authenticatedReceiptHash !== privacyHash(receipt)) {
    throw new PrivacyError("HASH_MISMATCH");
  }
}
/** Pure guard only. Receipt authentication and current grants must come from trusted future server adapters, never request JSON. */
export function transitionPrivacyJob(rawJob: PrivacyJob, rawCommand: TransitionCommand, rawContext: TransitionContext,
  actor: PrivacyActor, grants: PrivacyGrant[], rawPolicy: SanitizationPolicy, rawEvidence: TransitionEvidence = {}): PrivacyJob {
  const job = validatePrivacyJob(rawJob); const command = parsePrivacy(commandSchema, rawCommand);
  const context = parsePrivacy(contextSchema, rawContext); const evidence = parsePrivacy(evidenceSchema, rawEvidence);
  const policy = validatePolicy(rawPolicy);
  if (!samePrivacyValue(job.pins, policy.pins) || context.policyHash !== privacyHash(policy)) throw new PrivacyError("POLICY_MISMATCH");
  if (job.revision !== context.expectedRevision || job.fence !== context.expectedFence || job.attemptId !== context.attemptId) {
    throw new PrivacyError("STALE_REVISION");
  }
  if (context.now < job.updatedAt || Date.parse(job.rawExpiresAt) - Date.parse(job.createdAt) > policy.rawTtlMs) {
    throw new PrivacyError("ILLEGAL_TRANSITION");
  }
  let role: PrivacyRole = "SANITIZER";
  if (command.lifecycle === "publication") role = "PUBLISHER";
  else if (command.lifecycle === "destruction") role = "DESTROYER";
  else if (["CREATED", "RECEIVING", "INTAKE_VALIDATING", "MALWARE_SCANNING"].includes(job.processing)) role = "INTAKE";
  if (command.lifecycle === "processing" && ["SANITIZATION_VERIFICATION", "MANUAL_PRIVACY_REVIEW_REQUIRED"].includes(job.processing)) role = "VERIFIER";
  assertPrivacyRole(actor, grants, role, job.scope, context.now);
  const next = structuredClone(job);
  if (command.lifecycle === "processing") {
    const fail = failureState(command.target) && !failureState(job.processing) && job.processing !== "SANITIZATION_VERIFIED";
    if (!processingEdges[job.processing].includes(command.target) && !fail) throw new PrivacyError("ILLEGAL_TRANSITION");
    if (!failureState(command.target) && (context.now >= job.rawExpiresAt || job.destruction !== "RAW_PRESENT" || job.rawAccessRevokedAt)) {
      throw new PrivacyError("ILLEGAL_TRANSITION");
    }
    if (command.target === "RAW_READY" && !evidence.scanCleared) throw new PrivacyError("MALWARE_SCAN_UNAVAILABLE");
    if (job.processing === "MANUAL_PRIVACY_REVIEW_REQUIRED") {
      if (!evidence.review || !job.artifact || evidence.review.disposition !== "APPROVED_FOR_REVERIFICATION" ||
        evidence.review.actorId !== actor.id || evidence.review.at > context.now ||
        evidence.review.artifactHash !== job.artifact.contentHash) throw new PrivacyError("VERIFICATION_FAILED");
      bound(job, evidence.review); checkReceipt(evidence.review, evidence);
    }
    if (role === "VERIFIER" && (job.processorIds.includes(actor.id) || job.ownerId === actor.id)) throw new PrivacyError("AUTHORIZATION_DENIED");
    if (command.target === "SANITIZATION_VERIFICATION") {
      if (job.processing === "SANITIZING") {
        if (!evidence.artifact) throw new PrivacyError("VERIFICATION_FAILED");
        next.artifact = evidence.artifact;
      }
    }
    if (command.target === "SANITIZATION_VERIFIED") {
      if (!evidence.verification || evidence.verification.actorId !== actor.id ||
        evidence.verification.at > context.now || evidence.verification.expiresAt <= context.now) throw new PrivacyError("VERIFICATION_FAILED");
      checkReceipt(evidence.verification, evidence);
      next.verification = evidence.verification; next.verifierId = actor.id;
    }
    if (role === "SANITIZER" || role === "INTAKE") next.processorIds = [...new Set([...job.processorIds, actor.id])];
    next.processing = command.target;
  } else if (command.lifecycle === "publication") {
    if (!publicationEdges[job.publication].includes(command.target)) throw new PrivacyError("ILLEGAL_TRANSITION");
    if (command.target !== "PUBLICATION_BLOCKED") {
      if (job.processing !== "SANITIZATION_VERIFIED" || !job.verification || !job.artifact ||
        job.verification.expiresAt <= context.now || job.artifact.expiresAt <= context.now) throw new PrivacyError("VERIFICATION_FAILED");
      if (job.processorIds.includes(actor.id) || job.verifierId === actor.id || job.ownerId === actor.id) throw new PrivacyError("AUTHORIZATION_DENIED");
      if (context.now >= job.rawExpiresAt && job.publication !== "RECONCILIATION_REQUIRED") throw new PrivacyError("ILLEGAL_TRANSITION");
    }
    if (command.target === "SANITIZED_PUBLISHED") {
      if (!evidence.publication || evidence.publication.actorId !== actor.id || evidence.publication.at > context.now) throw new PrivacyError("VERIFICATION_FAILED");
      checkReceipt(evidence.publication, evidence);
      next.publicationReceipt = evidence.publication; next.publisherId = actor.id;
      next.rawAccessRevokedAt = evidence.publication.rawAccessRevokedAt;
    }
    next.publication = command.target;
  } else {
    if (!destructionEdges[job.destruction].includes(command.target)) throw new PrivacyError("ILLEGAL_TRANSITION");
    if (command.target === "DESTRUCTION_PENDING" && !failureState(job.processing) &&
      job.publication !== "SANITIZED_PUBLISHED" && context.now < job.rawExpiresAt) throw new PrivacyError("ILLEGAL_TRANSITION");
    if (command.target === "RAW_ACCESS_REVOKED") next.rawAccessRevokedAt ??= context.now;
    if (command.target === "RAW_DESTROYED") {
      if (!evidence.destruction || evidence.destruction.actorId !== actor.id ||
        evidence.destruction.at > context.now) throw new PrivacyError("DESTRUCTION_PENDING");
      checkReceipt(evidence.destruction, evidence); next.destructionReceipt = evidence.destruction;
    }
    next.destruction = command.target;
  }
  if (evidence.artifact && !(command.lifecycle === "processing" && command.target === "SANITIZATION_VERIFICATION" && job.processing === "SANITIZING") ||
    evidence.verification && !(command.lifecycle === "processing" && command.target === "SANITIZATION_VERIFIED") ||
    evidence.publication && !(command.lifecycle === "publication" && command.target === "SANITIZED_PUBLISHED") ||
    evidence.destruction && !(command.lifecycle === "destruction" && command.target === "RAW_DESTROYED") ||
    evidence.review && !(command.lifecycle === "processing" && job.processing === "MANUAL_PRIVACY_REVIEW_REQUIRED" &&
      command.target === "SANITIZATION_VERIFICATION")) throw new PrivacyError("ILLEGAL_TRANSITION");
  next.revision++; next.updatedAt = context.now;
  return validatePrivacyJob(next);
}
