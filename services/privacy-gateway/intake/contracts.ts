import { z } from "zod";
import { opaqueIdSchema, type PrivacyActor, type PrivacyGrant, type PrivacyJob } from "../contracts";
import { parsePrivacy, privacyHash } from "../policy";

export const intakeFailures = [
  "UNSUPPORTED_FILE_TYPE", "MALFORMED_INPUT", "ARCHIVE_LIMIT_EXCEEDED", "PACKAGE_LIMIT_EXCEEDED",
  "PASSWORD_PROTECTED", "MIME_MISMATCH", "DUPLICATE_PACKAGE", "DUPLICATE_ARTIFACT",
  "SCAN_REJECTED", "MALWARE_SCAN_UNAVAILABLE", "PARSER_UNAVAILABLE", "PARSER_LIMIT_EXCEEDED",
  "PARSER_FAILED", "EXPIRED", "CANCELLED", "ABANDONED", "STALE_ATTEMPT", "AUTHORIZATION_DENIED",
  "STORAGE_UNAVAILABLE", "KEY_UNAVAILABLE", "CLEANUP_PENDING",
] as const;
export type IntakeFailure = typeof intakeFailures[number];
export class IntakeError extends Error {
  constructor(readonly code: IntakeFailure) { super(code); this.name = "IntakeError"; }
}
export const intakeLimitsSchema = z.object({
  packageBytes: z.number().int().positive().max(100 * 1024 * 1024),
  expandedBytes: z.number().int().positive().max(500 * 1024 * 1024),
  entries: z.number().int().positive().max(1000),
  depth: z.number().int().positive().max(3),
  expansionRatio: z.number().int().positive().max(100),
  individualBytes: z.number().int().positive().max(100 * 1024 * 1024),
  pages: z.number().int().positive().max(1000),
  cells: z.number().int().positive().max(100_000),
  images: z.number().int().positive().max(100),
  imagePixels: z.number().int().positive().max(40_000_000),
  parserInputBytes: z.number().int().positive().max(8 * 1024 * 1024),
  parserMemoryBytes: z.number().int().positive().max(64 * 1024 * 1024),
  processingMs: z.number().int().positive().max(5000),
  scanMs: z.number().int().positive().max(30_000),
  stagedBytes: z.number().int().positive().max(128 * 1024 * 1024),
  jobs: z.number().int().positive().max(32),
  concurrentJobs: z.number().int().positive().max(4),
}).strict();
export type IntakeLimits = z.infer<typeof intakeLimitsSchema>;
export const initialIntakeLimits: Readonly<IntakeLimits> = Object.freeze({
  packageBytes: 100 * 1024 * 1024, expandedBytes: 500 * 1024 * 1024, entries: 1000,
  depth: 3, expansionRatio: 100, individualBytes: 100 * 1024 * 1024,
  pages: 1000, cells: 100_000, images: 100, imagePixels: 40_000_000,
  parserInputBytes: 8 * 1024 * 1024, parserMemoryBytes: 64 * 1024 * 1024,
  processingMs: 5000, scanMs: 30_000,
  stagedBytes: 128 * 1024 * 1024, jobs: 32, concurrentJobs: 4,
});
export function intakeLimits(value: unknown): IntakeLimits { return parsePrivacy(intakeLimitsSchema, value); }
export function intakePolicyHash(limits: IntakeLimits) {
  return privacyHash({ contract: "jenan.privacy.intake-policy/v1", parser: "strict-stored-zip-csv/1.0.0", limits: intakeLimits(limits) });
}
export type IntakeMedia = "CSV" | "ZIP";
export type ScanState = "SCAN_PENDING" | "SCAN_CLEAN" | "SCAN_REJECTED" | "MALWARE_SCAN_UNAVAILABLE";
export type ScanVerdict = "CLEAN" | "REJECTED" | "UNAVAILABLE" | "ERROR" | "TIMEOUT" | "UNKNOWN";
export type IntakeContext = { actor: PrivacyActor; grants: PrivacyGrant[] };
export type Attempt = Pick<PrivacyJob, "scope" | "attemptId" | "fence">;
export type Ciphertext = { nonce: Uint8Array; body: Uint8Array; tag: Uint8Array };

// Trusted injected adapters only; no HTTP/queue payload may supply these capabilities.
export interface KeyBoundary {
  readonly qualification: "TEST_ONLY";
  create(attempt: Attempt): Promise<string>;
  seal(handle: string, plain: Uint8Array, binding: Uint8Array): Promise<Ciphertext>;
  open(handle: string, cipher: Ciphertext, binding: Uint8Array): Promise<Uint8Array>;
  fingerprint(handle: string, plain: Uint8Array): Promise<string>;
  revoke(handle: string): Promise<void>;
}
export interface StagingStorage {
  readonly qualification: "TEST_ONLY";
  putOpaque(key: string, cipher: Ciphertext): Promise<void>;
  getOpaque(key: string): Promise<Ciphertext>;
  deleteOpaque(key: string): Promise<void>;
}
export interface ScanBoundary {
  readonly qualification: "TEST_ONLY";
  scan(bytes: Uint8Array, signal: AbortSignal): Promise<ScanVerdict>;
}
export interface IntakeRuntime {
  now(): string;
  id(): string;
  currentAuthorization(job: PrivacyJob, actorId: string): Promise<IntakeContext>;
  scheduleExpiry(event: { jobId: string; attemptId: string; fence: number; expiresAt: string }): Promise<void>;
  enqueueCleanup(event: { jobId: string; attemptId: string; fence: number; reason: IntakeFailure }): Promise<void>;
}
export type IntakeSummary = {
  jobId: string; attemptId: string; fence: number; scan: ScanState;
  stage: "RECEIVING" | "VALIDATING" | "SCANNING" | "EXTRACTING" | "RAW_READY" | "CLEANUP_PENDING";
  bytes: number; entries: number; policyHash: string; failure?: IntakeFailure;
};
export function checkedId(id: string): string { return parsePrivacy(opaqueIdSchema, id); }
