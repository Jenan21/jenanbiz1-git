import { randomBytes } from "node:crypto";
import {
  PrivacyError, type PrivacyJob, type SanitizationPolicy, type VerificationReceipt,
} from "../contracts";
import { assertPrivacyRole, parsePrivacy, privacyHash, samePrivacyValue, validatePolicy } from "../policy";
import { assertJobRawAccess, transitionPrivacyJob } from "../states";
import { initialIntakeLimits, intakePolicyHash } from "../intake/contracts";
import type { EphemeralIntake } from "../intake/staging";
import { profileHash } from "./classification";
import { datasetSchema, mappingSchema, m3AuditSchema, profile, SanitizationError, type M3Runtime, type ReceiptSigner,
  type ReviewReason, type SanitizedDataset, type VerificationEvidence } from "./contracts";
import { emptyMapping, sanitizeTables } from "./transform";
import { verifyTables } from "./verifier";

export const m3References = () => ({
  extraction: { component: "extraction" as const, version: "1.0.0", hash: intakePolicyHash({ ...initialIntakeLimits }) },
  classification: { component: "classification" as const, version: "1.0.0", hash: profileHash() },
  tokenization: { component: "tokenization" as const, version: "1.0.0",
    hash: privacyHash({ version: "1.0.0", algorithm: "PACKAGE_RANDOM_256_BITS", mapping: "RAW_ENCRYPTED_EPHEMERAL" }) },
  verification: { component: "verification" as const, version: "1.0.0",
    hash: privacyHash({ version: "1.0.0", profileHash: profileHash(), checks: "EXACT_RECONSTRUCTION_RESCAN_COHORT_V1" }) },
});
type Entry = {
  job: PrivacyJob; sanitizerId: string; dataset: SanitizedDataset | null; busy: boolean;
  reason: ReviewReason | null; receipt: VerificationReceipt | null; evidence: VerificationEvidence | null;
};
export type M3Status = { jobId: string; processing: PrivacyJob["processing"]; reason: ReviewReason | null;
  result: "CANDIDATE" | "VERIFIED" | "MANUAL_PRIVACY_REVIEW_REQUIRED"; failure: "SANITIZATION_UNCERTAIN" | null };
export const receiptPayload = (receipt: Omit<VerificationReceipt, "signature">, evidence: VerificationEvidence) =>
  new TextEncoder().encode(JSON.stringify({ receipt, evidence }));

/** Internal reference service only: no caller-controlled adapters, evidence or verification claims. */
export class PrivacySanitization {
  private readonly entries = new Map<string, Entry>();
  private readonly packages = new Set<string>();
  private readonly policy: SanitizationPolicy;
  constructor(private readonly intake: EphemeralIntake, private readonly runtime: M3Runtime,
    private readonly signer: ReceiptSigner, policy: SanitizationPolicy) {
    this.policy = validatePolicy(policy);
    if (signer.qualification !== "TEST_ONLY" || this.policy.pins.sanitization.version !== "1.0.0" ||
      !Object.entries(m3References()).every(([kind, reference]) =>
        samePrivacyValue(this.policy.pins[kind as keyof ReturnType<typeof m3References>], reference))) throw new SanitizationError("POLICY_MISMATCH");
  }
  private async authorize(job: PrivacyJob, actorId: string, role: "SANITIZER" | "VERIFIER") {
    try {
      const current = await this.runtime.currentAuthorization(structuredClone(job), actorId);
      if (current.actor.id !== actorId) throw new SanitizationError("AUTHORIZATION_DENIED");
      assertPrivacyRole(current.actor, current.grants, role, job.scope, this.runtime.now());
      assertJobRawAccess(job, current.actor, current.grants, this.runtime.now());
      return current;
    } catch { throw new SanitizationError("AUTHORIZATION_DENIED"); }
  }
  private async move(entry: Entry, actorId: string,
    target: "CLASSIFYING" | "EXTRACTING" | "SANITIZING" | "MANUAL_PRIVACY_REVIEW_REQUIRED") {
    const role = ["SANITIZATION_VERIFICATION", "MANUAL_PRIVACY_REVIEW_REQUIRED"].includes(entry.job.processing) ? "VERIFIER" : "SANITIZER";
    const current = await this.authorize(entry.job, actorId, role);
    entry.job = transitionPrivacyJob(entry.job, { lifecycle: "processing", target }, {
      now: this.runtime.now(), expectedRevision: entry.job.revision, expectedFence: entry.job.fence,
      attemptId: entry.job.attemptId, policyHash: privacyHash(this.policy),
    }, current.actor, current.grants, this.policy);
  }
  private statusOf(entry: Entry): M3Status {
    return { jobId: entry.job.scope.jobId, processing: entry.job.processing, reason: entry.reason,
      result: entry.reason ? "MANUAL_PRIVACY_REVIEW_REQUIRED" : entry.receipt ? "VERIFIED" : "CANDIDATE",
      failure: entry.reason ? "SANITIZATION_UNCERTAIN" : null };
  }
  private async audit(entry: Entry, actorId: string, stage: "CLASSIFY" | "SANITIZE" | "VERIFY", reason: ReviewReason | null,
    reference?: { id: string; receiptId: string }) {
    try {
      await this.runtime.audit(parsePrivacy(m3AuditSchema, { id: reference?.id ?? this.runtime.id(), receiptId: reference?.receiptId ?? null,
        at: this.runtime.now(), policyHash: privacyHash(this.policy), jobId: entry.job.scope.jobId, actorId, stage,
        result: reason ? "REVIEW_REQUIRED" : "CANDIDATE", reason, count: entry.dataset?.rows.length ?? 0, profileHash: profileHash() }));
    } catch { throw new SanitizationError("VERIFICATION_FAILED"); }
  }
  private reason(error: unknown): ReviewReason {
    if (error instanceof SanitizationError) return error.code;
    if (error instanceof PrivacyError && error.code === "AUTHORIZATION_DENIED") return "AUTHORIZATION_DENIED";
    return "VERIFICATION_FAILED";
  }
  async sanitize(job: PrivacyJob, actorId: string): Promise<M3Status> {
    await this.authorize(job, actorId, "SANITIZER");
    const packageKey = privacyHash({ organizationId: job.scope.organizationId, clientId: job.scope.clientId, packageId: job.scope.packageId });
    if (this.entries.has(job.scope.jobId) || this.packages.has(packageKey)) throw new SanitizationError("STALE_ATTEMPT");
    if (this.entries.size >= profile.maxPackages) throw new SanitizationError("RESOURCE_LIMIT");
    this.packages.add(packageKey);
    const entry: Entry = { job: structuredClone(job), sanitizerId: actorId, dataset: null, busy: true, reason: null, receipt: null, evidence: null };
    this.entries.set(job.scope.jobId, entry);
    try {
      await this.intake.withReadyRaw(job, actorId, "SANITIZER", async (snapshot) => {
        if (!samePrivacyValue(snapshot.job.pins, this.policy.pins) || snapshot.tokenMappings.length ||
          snapshot.intakePolicyHash !== this.policy.pins.extraction.hash) throw new SanitizationError("POLICY_MISMATCH");
        entry.job = snapshot.job;
        await this.move(entry, actorId, "CLASSIFYING");
        const output = sanitizeTables(entry.job, snapshot.artifacts, emptyMapping(entry.job), () => randomBytes(32).toString("hex"));
        await this.audit(entry, actorId, "CLASSIFY", null);
        await this.move(entry, actorId, "EXTRACTING"); await this.move(entry, actorId, "SANITIZING");
        const bytes = new TextEncoder().encode(JSON.stringify(output.mapping));
        try {
          const mappingId = this.runtime.id();
          try {
            await this.runtime.scheduleMappingCleanup({ jobId: job.scope.jobId, attemptId: job.attemptId,
              fence: job.fence, expiresAt: entry.job.rawExpiresAt, mappingId });
          } catch { throw new SanitizationError("CLEANUP_PENDING"); }
          const updated = await this.intake.stageTokenMapping(snapshot.job, actorId, bytes);
          entry.job.rawInventoryCount = updated.rawInventoryCount; entry.job.rawInventoryHash = updated.rawInventoryHash;
        } finally { bytes.fill(0); output.mapping.entries.length = 0; }
        await this.authorize(entry.job, actorId, "SANITIZER");
        entry.dataset = parsePrivacy(datasetSchema, output.dataset);
        const lineageHash = privacyHash({ scope: entry.job.scope, attemptId: entry.job.attemptId, fence: entry.job.fence,
          pins: entry.job.pins, rawInventoryHash: entry.job.rawInventoryHash, artifactIds: snapshot.artifacts.map((item) => item.id), profileHash: profileHash() });
        const artifact = {
          contract: "jenan.privacy-gateway.sanitized/v1" as const, id: this.runtime.id(), scope: entry.job.scope,
          attemptId: entry.job.attemptId, fence: entry.job.fence, pins: entry.job.pins,
          bytes: new TextEncoder().encode(JSON.stringify(entry.dataset)).length, createdAt: this.runtime.now(),
          expiresAt: entry.job.rawExpiresAt, taint: "SANITIZED_CANDIDATE" as const, format: "ALLOWLIST_STRUCTURED_DATA" as const,
          anonymous: false as const, allowExport: false as const, classification: "RESTRICTED" as const,
          contentHash: privacyHash(entry.dataset), schemaHash: privacyHash({ version: "dataset/v1", profileHash: profileHash() }), lineageHash,
        };
        // Supply the candidate only at the M1 guard's authorized transition.
        const current = await this.authorize(entry.job, actorId, "SANITIZER");
        entry.job = transitionPrivacyJob(entry.job, { lifecycle: "processing", target: "SANITIZATION_VERIFICATION" }, {
          now: this.runtime.now(), expectedRevision: entry.job.revision, expectedFence: entry.job.fence,
          attemptId: entry.job.attemptId, policyHash: privacyHash(this.policy),
        }, current.actor, current.grants, this.policy, { artifact });
        await this.audit(entry, actorId, "SANITIZE", null);
      });
      return this.statusOf(entry);
    } catch (error) {
      entry.reason = this.reason(error); entry.dataset = null;
      await this.audit(entry, actorId, "SANITIZE", entry.reason);
      return this.statusOf(entry);
    } finally { entry.busy = false; }
  }
  private async find(job: PrivacyJob, actorId: string) {
    await this.authorize(job, actorId, "VERIFIER");
    const entry = this.entries.get(job.scope.jobId);
    if (!entry || !samePrivacyValue(entry.job.scope, job.scope)) throw new SanitizationError("AUTHORIZATION_DENIED");
    if (entry.job.attemptId !== job.attemptId || entry.job.fence !== job.fence || entry.busy) throw new SanitizationError("STALE_ATTEMPT");
    if (!samePrivacyValue(entry.job.pins, job.pins)) throw new SanitizationError("POLICY_MISMATCH");
    if (entry.sanitizerId === actorId || entry.job.processorIds.includes(actorId) || entry.job.ownerId === actorId) throw new SanitizationError("AUTHORIZATION_DENIED");
    await this.authorize(entry.job, actorId, "VERIFIER");
    return entry;
  }
  async verify(job: PrivacyJob, actorId: string): Promise<M3Status> {
    const entry = await this.find(job, actorId);
    if (entry.busy) throw new SanitizationError("STALE_ATTEMPT");
    if (entry.reason || !entry.dataset || !entry.job.artifact || entry.receipt) throw new SanitizationError("VERIFICATION_FAILED");
    entry.busy = true;
    try {
      const complete = await this.intake.withReadyRaw(job, actorId, "VERIFIER", async (snapshot) => {
        if (snapshot.tokenMappings.length !== 1 || snapshot.job.rawInventoryHash !== entry.job.rawInventoryHash) throw new SanitizationError("INCOMPLETE_COVERAGE");
        if (snapshot.intakePolicyHash !== this.policy.pins.extraction.hash) throw new SanitizationError("POLICY_MISMATCH");
        const mapping = parsePrivacy(mappingSchema, JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(snapshot.tokenMappings[0].bytes)));
        let evidence: VerificationEvidence;
        try { evidence = verifyTables(entry.job, snapshot.artifacts, entry.dataset, mapping); }
        finally { mapping.entries.length = 0; }
        const lineageHash = privacyHash({ scope: entry.job.scope, attemptId: entry.job.attemptId, fence: entry.job.fence,
          pins: entry.job.pins, rawInventoryHash: entry.job.rawInventoryHash, artifactIds: snapshot.artifacts.map((item) => item.id), profileHash: profileHash() });
        if (!entry.job.artifact || privacyHash(entry.dataset) !== entry.job.artifact.contentHash ||
          entry.job.artifact.lineageHash !== lineageHash ||
          entry.job.artifact.schemaHash !== privacyHash({ version: "dataset/v1", profileHash: profileHash() })) throw new SanitizationError("HASH_MISMATCH");
        const unsigned: Omit<VerificationReceipt, "signature"> = {
          contract: "jenan.privacy-gateway.verification/v1", id: this.runtime.id(), scope: entry.job.scope,
          attemptId: entry.job.attemptId, fence: entry.job.fence, pins: entry.job.pins,
          at: this.runtime.now(), expiresAt: entry.job.rawExpiresAt, actorId, auditId: this.runtime.id(),
          artifactId: entry.job.artifact.id, artifactHash: entry.job.artifact.contentHash,
          lineageHash: entry.job.artifact.lineageHash, schemaHash: entry.job.artifact.schemaHash,
          inventoryComplete: true, malwareCleared: true, coverageComplete: true,
          analyticalFidelity: "EXACT_REQUIRED_FIELDS_PRESERVED", residualRisk: "ACCEPTED_FOR_DECLARED_PURPOSE_AND_SCOPE",
          result: "SANITIZATION_VERIFIED",
        };
        const payload = receiptPayload(unsigned, evidence);
        const signature = await this.signer.sign(payload);
        if (!await this.signer.verify(payload, signature)) throw new SanitizationError("VERIFICATION_FAILED");
        const receipt = { ...unsigned, signature };
        const current = await this.authorize(entry.job, actorId, "VERIFIER");
        const next = transitionPrivacyJob(entry.job, { lifecycle: "processing", target: "SANITIZATION_VERIFIED" }, {
          now: this.runtime.now(), expectedRevision: entry.job.revision, expectedFence: entry.job.fence,
          attemptId: entry.job.attemptId, policyHash: privacyHash(this.policy),
        }, current.actor, current.grants, this.policy, { verification: receipt, authenticatedReceiptHash: privacyHash(receipt) });
        await this.audit(entry, actorId, "VERIFY", null, { id: unsigned.auditId, receiptId: unsigned.id });
        // Do not commit verified state until both independent evidence and audit succeed.
        return { next, receipt, evidence };
      });
      entry.job = complete.next; entry.receipt = complete.receipt; entry.evidence = complete.evidence;
      return this.statusOf(entry);
    } catch (error) {
      entry.receipt = null; entry.evidence = null; entry.reason = this.reason(error);
      try { await this.move(entry, actorId, "MANUAL_PRIVACY_REVIEW_REQUIRED"); }
      catch { entry.reason = "AUTHORIZATION_DENIED"; }
      await this.audit(entry, actorId, "VERIFY", entry.reason);
      return this.statusOf(entry);
    } finally { entry.busy = false; }
  }
  async verified(job: PrivacyJob, actorId: string) {
    const entry = await this.find(job, actorId);
    if (entry.reason || !entry.receipt || !entry.evidence || !entry.dataset) throw new SanitizationError("VERIFICATION_FAILED");
    return structuredClone({ dataset: entry.dataset, receipt: entry.receipt, evidence: entry.evidence });
  }
  async durableCheckpoint(job: PrivacyJob, actorId: string) {
    const verified = await this.verified(job, actorId);
    const entry = await this.find(job, actorId);
    return structuredClone({ ...verified, job: entry.job, policyHash: privacyHash(this.policy) });
  }
}
