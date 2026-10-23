import { z } from "zod";
import { hashSchema, instantSchema, opaqueIdSchema, pinsSchema, scopeSchema, type PrivacyActor, type PrivacyGrant, type PrivacyJob } from "../contracts";

export const analyticalKinds = [
  "amount", "date", "revenue", "expense", "payroll", "rent", "tax", "liability", "installment", "cash_flow",
  "category", "quantity", "price", "metric", "unit", "currency", "period",
] as const;
export const sensitiveKinds = [
  "PERSON", "OWNER", "DELEGATE", "SIGNATORY", "NATIONAL_ID", "PHONE", "EMAIL", "IBAN", "BANK_ACCOUNT",
  "PAYMENT_CARD", "SIGNATURE", "STAMP", "QR", "BARCODE", "ADDRESS", "ACCOUNT_ID", "METADATA", "BUSINESS_ID",
] as const;
export type AnalyticalKind = typeof analyticalKinds[number];
export type SensitiveKind = typeof sensitiveKinds[number];
export type FieldClass = {
  kind: AnalyticalKind | SensitiveKind | "UNKNOWN"; sensitivity: "ANALYTICAL" | "IDENTIFIER" | "UNCERTAIN";
  required: boolean; action: "KEEP" | "REMOVE" | "TOKENIZE" | "REVIEW"; confidence: "EXACT_SCHEMA" | "AMBIGUOUS";
};
export const reasons = ["UNKNOWN_FIELD", "AMBIGUOUS_VALUE", "FREE_TEXT", "UNSUPPORTED_EMBEDDED",
  "INCOMPLETE_COVERAGE", "EXACT_PRESERVATION_FAILED", "SENSITIVE_RESIDUE", "TOKEN_SCOPE_MISMATCH",
  "QUASI_IDENTIFIER_COMBINATION", "RARE_TOKEN_LINK", "POLICY_MISMATCH", "STALE_ATTEMPT", "HASH_MISMATCH",
  "AUTHORIZATION_DENIED", "VERIFICATION_FAILED", "RESOURCE_LIMIT", "MALFORMED_INPUT", "CLEANUP_PENDING"] as const;
export type ReviewReason = typeof reasons[number];
export class SanitizationError extends Error {
  constructor(readonly code: ReviewReason) { super(code); this.name = "SanitizationError"; }
}
const value = z.string().min(1).max(128);
export const valuesSchema = z.object({
  amount: value.optional(), date: value.optional(), revenue: value.optional(), expense: value.optional(),
  payroll: value.optional(), rent: value.optional(), tax: value.optional(), liability: value.optional(),
  installment: value.optional(), cash_flow: value.optional(), category: value.optional(), quantity: value.optional(),
  price: value.optional(), metric: value.optional(), unit: value.optional(), currency: value.optional(), period: value.optional(),
}).strict();
export const tokenSchema = z.string().regex(/^tok_[a-f0-9]{64}$/);
export const datasetSchema = z.object({
  contract: z.literal("jenan.privacy.dataset/v1"), scope: scopeSchema, attemptId: opaqueIdSchema,
  fence: z.number().int().nonnegative(), pins: pinsSchema, profileHash: hashSchema,
  anonymous: z.literal(false), format: z.literal("ALLOWLIST_STRUCTURED_DATA"),
  rows: z.array(z.object({
    artifactId: opaqueIdSchema, row: z.number().int().positive(),
    values: valuesSchema, links: z.array(z.object({ kind: z.enum(sensitiveKinds), token: tokenSchema }).strict()).max(20),
  }).strict()).min(1).max(1000),
}).strict();
export type SanitizedDataset = z.infer<typeof datasetSchema>;
export const mappingSchema = z.object({
  contract: z.literal("jenan.privacy.mapping/v1"), scope: scopeSchema, attemptId: opaqueIdSchema,
  fence: z.number().int().nonnegative(), expiresAt: instantSchema, taint: z.literal("RAW"),
  entries: z.array(z.object({ kind: z.enum(sensitiveKinds), original: z.string().min(1).max(256), token: tokenSchema }).strict()).max(2000),
}).strict();
export type TokenMapping = z.infer<typeof mappingSchema>;
export const evidenceSchema = z.object({
  contract: z.literal("jenan.privacy.verification-evidence/v1"),
  result: z.literal("SANITIZATION_VERIFIED"), profileHash: hashSchema,
  artifactIds: z.array(opaqueIdSchema).min(1).max(1000), artifacts: z.number().int().positive(),
  rows: z.number().int().positive().max(1000), preservedCells: z.number().int().positive(),
  coverage: z.literal("ALL_ELIGIBLE_CSV_FIELDS"), fidelity: z.literal("EXACT_STRINGS_ORDER_ASSOCIATION"),
  residualCheck: z.literal("SUPPORTED_STRUCTURED_PROFILE_ONLY"), anonymous: z.literal(false),
}).strict();
export type VerificationEvidence = z.infer<typeof evidenceSchema>;
export const profile = Object.freeze({
  contract: "jenan.privacy.csv-profile/v1", version: "1.0.0",
  analyticalKinds, sensitiveKinds, unknown: "REVIEW", freeText: "REVIEW",
  minCohort: 3, maxRows: 1000, maxCells: 10000, maxBytes: 128 * 1024, maxPackages: 32,
  tokens: "PACKAGE_RANDOM_256_BITS", supported: "STRICT_CSV_ONLY",
});
export interface M3Runtime {
  now(): string; id(): string;
  currentAuthorization(job: PrivacyJob, actorId: string): Promise<{ actor: PrivacyActor; grants: PrivacyGrant[] }>;
  audit(event: z.infer<typeof m3AuditSchema>): Promise<void>;
  scheduleMappingCleanup(event: { jobId: string; attemptId: string; fence: number; expiresAt: string; mappingId: string }): Promise<void>;
}
export const m3AuditSchema = z.object({
  id: opaqueIdSchema, at: instantSchema, receiptId: opaqueIdSchema.nullable(), policyHash: hashSchema,
  jobId: opaqueIdSchema, actorId: opaqueIdSchema, stage: z.enum(["CLASSIFY", "SANITIZE", "VERIFY", "CLEANUP"]),
  result: z.enum(["CANDIDATE", "VERIFIED", "REVIEW_REQUIRED", "FAILED"]), reason: z.enum(reasons).nullable(),
  count: z.number().int().nonnegative().max(1000), profileHash: hashSchema,
}).strict();
export interface ReceiptSigner {
  readonly qualification: "TEST_ONLY";
  sign(payload: Uint8Array): Promise<{ algorithm: "Ed25519"; keyId: string; keyVersion: number; value: string }>;
  verify(payload: Uint8Array, signature: { algorithm: "Ed25519"; keyId: string; keyVersion: number; value: string }): Promise<boolean>;
}
