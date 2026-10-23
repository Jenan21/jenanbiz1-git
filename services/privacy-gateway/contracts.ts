import { z } from "zod";

export const PRIVACY_VERSION = "1.0.0-m1";
export const opaqueIdSchema = z.uuid();
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const instantSchema = z.iso.datetime({ precision: 3 });
export const versionSchema = z.object({
  component: z.enum(["sanitization", "extraction", "classification", "tokenization", "verification"]),
  version: z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/), hash: hashSchema,
}).strict();
export const pinsSchema = z.object({
  sanitization: versionSchema.extend({ component: z.literal("sanitization") }),
  extraction: versionSchema.extend({ component: z.literal("extraction") }),
  classification: versionSchema.extend({ component: z.literal("classification") }),
  tokenization: versionSchema.extend({ component: z.literal("tokenization") }),
  verification: versionSchema.extend({ component: z.literal("verification") }),
}).strict();
export const scopeSchema = z.object({
  organizationId: opaqueIdSchema, clientId: opaqueIdSchema, packageId: opaqueIdSchema, jobId: opaqueIdSchema,
}).strict();
export const failureCodes = [
  "MALWARE_SCAN_UNAVAILABLE", "UNSUPPORTED_FILE_TYPE", "ARCHIVE_LIMIT_EXCEEDED", "MALFORMED_INPUT",
  "SANITIZATION_UNCERTAIN", "MANUAL_PRIVACY_REVIEW_REQUIRED", "VERIFICATION_FAILED",
  "PUBLICATION_RECONCILIATION_REQUIRED", "DESTRUCTION_PENDING", "DESTRUCTION_FAILED", "AUTHORIZATION_DENIED",
  "LINEAGE_MISMATCH", "HASH_MISMATCH", "ILLEGAL_TRANSITION", "STALE_REVISION", "POLICY_MISMATCH",
] as const;
export const failureCodeSchema = z.enum(failureCodes);
export class PrivacyError extends Error {
  constructor(readonly code: z.infer<typeof failureCodeSchema>) {
    super(code); this.name = "PrivacyError";
  }
}
export const failureSchema = z.object({
  contract: z.literal("jenan.privacy-gateway.failure/v1"), code: failureCodeSchema,
  scope: scopeSchema, at: instantSchema, auditId: opaqueIdSchema,
}).strict();
export const reviewSchema = z.object({
  contract: z.literal("jenan.privacy-gateway.review/v1"), id: opaqueIdSchema, scope: scopeSchema,
  attemptId: opaqueIdSchema, fence: z.number().int().nonnegative(), pins: pinsSchema,
  actorId: opaqueIdSchema, at: instantSchema, artifactHash: hashSchema,
  disposition: z.enum(["MANUAL_PRIVACY_REVIEW_REQUIRED", "APPROVED_FOR_REVERIFICATION", "REJECTED"]),
  reason: failureCodeSchema, auditId: opaqueIdSchema,
}).strict();
export const reconciliationSchema = z.object({
  contract: z.literal("jenan.privacy-gateway.reconciliation/v1"), id: opaqueIdSchema, scope: scopeSchema,
  attemptId: opaqueIdSchema, fence: z.number().int().nonnegative(), pins: pinsSchema,
  releaseId: opaqueIdSchema, artifactHash: hashSchema, at: instantSchema, actorId: opaqueIdSchema,
  state: z.enum(["RECONCILIATION_REQUIRED", "EXACT_PUBLICATION_CONFIRMED", "BLOCKED"]),
  publicationReceiptId: opaqueIdSchema.nullable(), auditId: opaqueIdSchema,
}).strict().refine((v) => (v.state === "EXACT_PUBLICATION_CONFIRMED") === (v.publicationReceiptId !== null), "Exact publication evidence required");
export const processingStates = ["CREATED", "RECEIVING", "INTAKE_VALIDATING", "MALWARE_SCANNING", "RAW_READY",
  "CLASSIFYING", "EXTRACTING", "SANITIZING", "SANITIZATION_VERIFICATION", "SANITIZATION_VERIFIED",
  "MANUAL_PRIVACY_REVIEW_REQUIRED", "REJECTED", "FAILED", "CANCELLED", "EXPIRED"] as const;
export const publicationStates = ["NOT_REQUESTED", "RELEASE_AUTHORIZED", "PUBLISHING",
  "RECONCILIATION_REQUIRED", "SANITIZED_PUBLISHED", "PUBLICATION_BLOCKED"] as const;
export const destructionStates = ["RAW_PRESENT", "DESTRUCTION_PENDING", "RAW_ACCESS_REVOKED",
  "DESTRUCTION_VERIFYING", "RAW_DESTROYED", "DESTRUCTION_FAILED"] as const;
export const roles = ["INTAKE", "SANITIZER", "VERIFIER", "PUBLISHER", "DESTROYER", "KEY_ACCESS", "AUDITOR"] as const;
export const actorSchema = z.object({
  id: opaqueIdSchema, kind: z.enum(["HUMAN", "WORKLOAD"]), privilegedInternal: z.literal(true),
  active: z.boolean(), authorizationRevision: z.number().int().nonnegative(),
}).strict();
export const grantSchema = z.object({
  id: opaqueIdSchema, actorId: opaqueIdSchema, scope: scopeSchema, role: z.enum(roles),
  active: z.boolean(), validFrom: instantSchema, expiresAt: instantSchema,
  authorizationRevision: z.number().int().nonnegative(),
}).strict().refine((v) => v.validFrom < v.expiresAt, "Invalid grant window");
export const policySchema = z.object({
  contract: z.literal("jenan.privacy-gateway.policy/v1"), pins: pinsSchema,
  separationRequired: z.literal(true),
  rawExternalProcessing: z.literal("FORBIDDEN"),
  legacyDocXls: z.literal("REJECT_UNTIL_QUALIFIED"),
  packageBytes: z.number().int().positive().max(100 * 1024 * 1024),
  expandedBytes: z.number().int().positive().max(500 * 1024 * 1024),
  entries: z.number().int().positive().max(1000), depth: z.number().int().positive().max(3),
  expansionRatio: z.number().int().positive().max(100),
  rawTtlMs: z.number().int().positive().max(86_400_000),
  cleanupTargetMs: z.number().int().positive().max(900_000),
  publicationAccessRevocation: z.literal("IMMEDIATE"),
  analyticalFields: z.array(z.enum(["AMOUNT", "DATE", "REVENUE", "EXPENSE", "SALARY", "RENT", "TAX",
    "CASH_FLOW", "LIABILITY", "ACCOUNTING_CATEGORY", "QUANTITY", "PRICE", "UNIT", "CURRENCY"])).min(1).max(14),
}).strict().refine((v) => new Set(v.analyticalFields).size === v.analyticalFields.length, "Duplicate analytical fields");
export const clientPackageSchema = z.object({
  contract: z.literal("jenan.privacy-gateway.package/v1"), scope: scopeSchema,
  purposeId: opaqueIdSchema, usageBasisId: opaqueIdSchema, schemaHash: hashSchema,
  pins: pinsSchema, createdAt: instantSchema, expiresAt: instantSchema,
  retention: z.literal("ANALYTICS_EPHEMERAL_ONLY"),
}).strict().refine((v) => v.createdAt < v.expiresAt && Date.parse(v.expiresAt) - Date.parse(v.createdAt) <= 86_400_000,
  "RAW lifetime cannot exceed 24h");
const artifactBase = z.object({
  id: opaqueIdSchema, scope: scopeSchema, attemptId: opaqueIdSchema, fence: z.number().int().nonnegative(),
  bytes: z.number().int().positive().max(500 * 1024 * 1024),
  createdAt: instantSchema, expiresAt: instantSchema, pins: pinsSchema,
}).strict().refine((v) => v.createdAt < v.expiresAt && Date.parse(v.expiresAt) - Date.parse(v.createdAt) <= 86_400_000,
  "Invalid artifact window");
export const intakeArtifactSchema = artifactBase.safeExtend({
  contract: z.literal("jenan.privacy-gateway.intake/v1"), taint: z.literal("RAW"),
  media: z.enum(["ZIP", "PDF", "XLSX", "CSV", "DOCX", "JPEG", "PNG", "WEBP"]),
  encryptedHandleId: opaqueIdSchema, keyHandleId: opaqueIdSchema,
  scan: z.enum(["NOT_SCANNED", "CLEAN", "REJECTED", "UNAVAILABLE"]),
});
export const rawArtifactSchema = artifactBase.safeExtend({
  contract: z.literal("jenan.privacy-gateway.raw/v1"), taint: z.literal("RAW"),
  kind: z.enum(["ORIGINAL", "EXTRACTED", "OCR", "CACHE", "QUARANTINE", "INTERMEDIATE", "TOKEN_MAPPING", "PARTIAL_UPLOAD"]),
  encryptedHandleId: opaqueIdSchema, keyHandleId: opaqueIdSchema,
});
export const sanitizedArtifactSchema = artifactBase.safeExtend({
  contract: z.literal("jenan.privacy-gateway.sanitized/v1"), taint: z.literal("SANITIZED_CANDIDATE"),
  format: z.literal("ALLOWLIST_STRUCTURED_DATA"), anonymous: z.literal(false),
  contentHash: hashSchema, schemaHash: hashSchema, lineageHash: hashSchema,
  classification: z.enum(["CONFIDENTIAL", "RESTRICTED"]), allowExport: z.literal(false),
});
export const tokenizationScopeSchema = z.object({
  contract: z.literal("jenan.privacy-gateway.tokenization/v1"), scope: scopeSchema, pins: pinsSchema,
  mappingTaint: z.literal("RAW"), linkage: z.literal("PACKAGE_LOCAL_ONLY"),
  tokenKind: z.literal("OPAQUE_RANDOM_128_BITS_MIN"), reverseService: z.literal("FORBIDDEN"),
  mappingKeyHandleId: opaqueIdSchema, expiresAt: instantSchema,
}).strict();
const receiptBase = z.object({
  id: opaqueIdSchema, scope: scopeSchema, attemptId: opaqueIdSchema, fence: z.number().int().nonnegative(),
  pins: pinsSchema, at: instantSchema, actorId: opaqueIdSchema, auditId: opaqueIdSchema,
  signature: z.object({ algorithm: z.literal("Ed25519"), keyId: opaqueIdSchema,
    keyVersion: z.number().int().positive(), value: z.string().regex(/^[A-Za-z0-9+/]{86}==$/) }).strict(),
}).strict();
export const verificationReceiptSchema = receiptBase.extend({
  contract: z.literal("jenan.privacy-gateway.verification/v1"), artifactId: opaqueIdSchema, artifactHash: hashSchema,
  lineageHash: hashSchema, schemaHash: hashSchema, expiresAt: instantSchema,
  inventoryComplete: z.literal(true), malwareCleared: z.literal(true), coverageComplete: z.literal(true),
  analyticalFidelity: z.literal("EXACT_REQUIRED_FIELDS_PRESERVED"),
  residualRisk: z.literal("ACCEPTED_FOR_DECLARED_PURPOSE_AND_SCOPE"),
  result: z.literal("SANITIZATION_VERIFIED"),
}).refine((v) => v.at < v.expiresAt, "Invalid verification window");
export const publicationReceiptSchema = receiptBase.extend({
  contract: z.literal("jenan.privacy-gateway.publication/v1"),
  artifactId: opaqueIdSchema, artifactHash: hashSchema, verificationReceiptId: opaqueIdSchema,
  releaseId: opaqueIdSchema, sourceId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  itemId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), versionId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  version: z.number().int().positive(), checksum: hashSchema, allPartsAcknowledged: z.literal(true),
  rawAccessRevokedAt: instantSchema, result: z.literal("SANITIZED_PUBLISHED"),
}).refine((v) => v.rawAccessRevokedAt === v.at, "Publication requires immediate RAW access revocation");
export const destructionReceiptSchema = receiptBase.extend({
  contract: z.literal("jenan.privacy-gateway.destruction/v1"),
  inventoryHash: hashSchema, inventoryCount: z.number().int().nonnegative(),
  checkedCount: z.number().int().nonnegative(), unknownLocations: z.literal(0),
  artifactsAbsent: z.literal(true), replicasAndVersionsAbsent: z.literal(true),
  multipartAbsent: z.literal(true), quarantineAbsent: z.literal(true), cachesAndOcrAbsent: z.literal(true),
  tokenMappingsAbsent: z.literal(true), queuesCleared: z.literal(true), workersTerminated: z.literal(true),
  recoverableKeysDestroyed: z.literal(true), backupsExcluded: z.literal(true),
  cryptoStatus: z.literal("IRREVERSIBLE_VERIFIED"), result: z.literal("RAW_DESTROYED"),
}).refine((v) => v.checkedCount === v.inventoryCount, "Incomplete destruction inventory");
export const jobSchema = z.object({
  contract: z.literal("jenan.privacy-gateway.job/v1"), scope: scopeSchema,
  ownerId: opaqueIdSchema, attemptId: opaqueIdSchema, fence: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(), pins: pinsSchema, createdAt: instantSchema, rawExpiresAt: instantSchema,
  updatedAt: instantSchema, processing: z.enum(processingStates), publication: z.enum(publicationStates),
  destruction: z.enum(destructionStates), processorIds: z.array(opaqueIdSchema).max(100),
  verifierId: opaqueIdSchema.nullable(), publisherId: opaqueIdSchema.nullable(),
  artifact: sanitizedArtifactSchema.nullable(), verification: verificationReceiptSchema.nullable(),
  publicationReceipt: publicationReceiptSchema.nullable(), destructionReceipt: destructionReceiptSchema.nullable(),
  rawAccessRevokedAt: instantSchema.nullable(),
  rawInventoryHash: hashSchema, rawInventoryCount: z.number().int().nonnegative().max(1000),
}).strict().superRefine((v, ctx) => {
  if (v.createdAt > v.updatedAt || v.rawExpiresAt <= v.createdAt ||
    Date.parse(v.rawExpiresAt) - Date.parse(v.createdAt) > 86_400_000 ||
    v.rawAccessRevokedAt && (v.rawAccessRevokedAt < v.createdAt || v.rawAccessRevokedAt > v.updatedAt) ||
    new Set(v.processorIds).size !== v.processorIds.length) ctx.addIssue({ code: "custom", message: "Invalid job lifetime or participants" });
  if (v.processing === "SANITIZATION_VERIFIED" && (!v.artifact || !v.verification || !v.verifierId) ||
    v.publication === "SANITIZED_PUBLISHED" && (!v.publicationReceipt || !v.rawAccessRevokedAt) ||
    v.destruction === "RAW_DESTROYED" && !v.destructionReceipt) ctx.addIssue({ code: "custom", message: "Required evidence absent" });
});
export type PrivacyJob = z.infer<typeof jobSchema>;
export type SanitizationPolicy = z.infer<typeof policySchema>;
export type PrivacyActor = z.infer<typeof actorSchema>;
export type PrivacyGrant = z.infer<typeof grantSchema>;
export type PrivacyRole = z.infer<typeof grantSchema>["role"];
export type PrivacyScope = z.infer<typeof scopeSchema>;
export type ClientPackage = z.infer<typeof clientPackageSchema>;
export type IntakeArtifact = z.infer<typeof intakeArtifactSchema>;
export type RawArtifact = z.infer<typeof rawArtifactSchema>;
export type SanitizedArtifact = z.infer<typeof sanitizedArtifactSchema>;
export type VerificationReceipt = z.infer<typeof verificationReceiptSchema>;
export type PublicationReceipt = z.infer<typeof publicationReceiptSchema>;
export type DestructionReceipt = z.infer<typeof destructionReceiptSchema>;
export type TokenizationScope = z.infer<typeof tokenizationScopeSchema>;
