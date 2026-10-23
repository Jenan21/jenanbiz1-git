import { describe, expect, it } from "vitest";
import {
  assertJobRawAccess, assertPrivacyRole, clientPackageSchema, destructionEdges, destructionReceiptSchema, failureCodes,
  failureSchema, intakeArtifactSchema, parsePrivacy, parsePrivacyAuditEvent, privacyHash, privacyPolicyContentHash,
  processingEdges, protectedAnalyticalFields, publicationEdges, rawArtifactSchema, sanitizedArtifactSchema,
  tokenizationScopeSchema, transitionPrivacyJob, validatePolicy, validatePrivacyJob, verificationReceiptSchema,
  type TransitionCommand, type TransitionEvidence,
} from "@/services/privacy-gateway";
import { privacyEnd, privacyFixture, privacyId, privacyNow } from "./support/privacy-gateway-fixtures";

function flow() {
  const f = privacyFixture(); let job = f.job;
  const step = (command: TransitionCommand, n = 10, evidence: TransitionEvidence = {}) => {
    const actor = f.actor(n);
    const role = command.lifecycle === "publication" ? "PUBLISHER" : command.lifecycle === "destruction" ? "DESTROYER"
      : ["SANITIZATION_VERIFICATION", "MANUAL_PRIVACY_REVIEW_REQUIRED"].includes(job.processing) ? "VERIFIER"
      : ["CREATED", "RECEIVING", "INTAKE_VALIDATING", "MALWARE_SCANNING"].includes(job.processing) ? "INTAKE" : "SANITIZER";
    job = transitionPrivacyJob(job, command, f.context(job), actor, f.grants(actor, role), f.policy, evidence); return job;
  };
  for (const target of ["RECEIVING", "INTAKE_VALIDATING", "MALWARE_SCANNING", "RAW_READY", "CLASSIFYING", "EXTRACTING",
    "SANITIZING", "SANITIZATION_VERIFICATION"] as const) step({ lifecycle: "processing", target }, 10,
    target === "RAW_READY" ? { scanCleared: true } : target === "SANITIZATION_VERIFICATION" ? { artifact: f.artifact } : {});
  return { ...f, current: () => job, step };
}
describe("Privacy M1 contracts and deterministic semantics", () => {
  it("pins approved limits, protected analytical fields and the exact policy content without recursive self hashing", () => {
    const f = privacyFixture(); expect(validatePolicy(f.policy)).toEqual(f.policy);
    expect(f.policy.pins.sanitization.hash).toBe(privacyPolicyContentHash(f.policy));
    expect(f.policy).toMatchObject({ packageBytes: 104857600, expandedBytes: 524288000, entries: 1000,
      depth: 3, expansionRatio: 100, rawTtlMs: 86400000, cleanupTargetMs: 900000 });
  });
  it.each(protectedAnalyticalFields)("does not allow silently removing protected %s semantics", (field) => {
    const f = privacyFixture(); f.policy.analyticalFields = f.policy.analyticalFields.filter((entry) => entry !== field);
    f.policy.pins.sanitization.hash = privacyPolicyContentHash(f.policy);
    expect(() => validatePolicy(f.policy)).toThrow("POLICY_MISMATCH");
  });
  it.each(["packageBytes", "expandedBytes", "entries", "depth", "expansionRatio", "rawTtlMs", "cleanupTargetMs"] as const)(
    "rejects a widened %s default rather than weakening the approved initial policy", (key) => {
      const f = privacyFixture(); f.policy[key]++;
      expect(() => validatePolicy(f.policy)).toThrow("MALFORMED_INPUT");
    });
  it.each(["sanitization", "extraction", "classification", "tokenization", "verification"] as const)(
    "binds exact %s version/hash references", (key) => {
      const f = privacyFixture(); const changed = structuredClone(f.policy); changed.pins[key].version = "2.0.0";
      expect(privacyHash(changed)).not.toBe(privacyHash(f.policy));
      expect(() => validatePolicy(changed)).toThrow("POLICY_MISMATCH");
    });
  it("keeps canonical hashes order-independent but preserves exact decimal text, dates and array order", () => {
    expect(privacyHash({ b: "1.00", a: privacyNow })).toBe(privacyHash({ a: privacyNow, b: "1.00" }));
    expect(privacyHash({ amount: "1.00" })).not.toBe(privacyHash({ amount: "1" }));
    expect(privacyHash(["a", "b"])).not.toBe(privacyHash(["b", "a"]));
  });
  it.each([NaN, Infinity, undefined, BigInt(1), new Date(privacyNow), new Map(), () => 1])("rejects non-JSON hash input %s", (value) => {
    expect(() => privacyHash(value)).toThrow("MALFORMED_INPUT");
  });
  it("rejects cycles, getters, sparse arrays, oversized or too-deep hashes without exposing sensitive content", () => {
    const cycle: { next?: unknown } = {}; cycle.next = cycle;
    let deep: unknown = "end"; for (let i = 0; i < 34; i++) deep = { next: deep };
    for (const value of [cycle, { get secret() { throw new Error("sensitive"); } }, new Array(3), "x".repeat(262145), deep]) {
      expect(() => privacyHash(value)).toThrow("MALFORMED_INPUT");
    }
  });
  it("does not execute a hidden toJSON function during canonical hashing", () => {
    const value = Object.defineProperty({}, "toJSON", { value: () => { throw new Error("must not run"); } });
    expect(() => privacyHash(value)).toThrow("MALFORMED_INPUT");
  });
  it("models intake, all RAW derivatives and package-local ephemeral token mapping without accepting original content", () => {
    const f = privacyFixture(); const { contentHash: _, schemaHash: __, lineageHash: ___, ...base } = f.artifact;
    void _; void __; void ___;
    const rawBase = { id: base.id, scope: base.scope, attemptId: base.attemptId, fence: base.fence,
      bytes: base.bytes, createdAt: base.createdAt, expiresAt: base.expiresAt, pins: base.pins,
      taint: "RAW", encryptedHandleId: privacyId(60), keyHandleId: privacyId(61) };
    expect(intakeArtifactSchema.safeParse({ ...rawBase, contract: "jenan.privacy-gateway.intake/v1", media: "PDF", scan: "NOT_SCANNED" }).success).toBe(true);
    for (const kind of ["ORIGINAL", "EXTRACTED", "OCR", "CACHE", "QUARANTINE", "INTERMEDIATE", "TOKEN_MAPPING", "PARTIAL_UPLOAD"]) {
      expect(rawArtifactSchema.safeParse({ ...rawBase, contract: "jenan.privacy-gateway.raw/v1", kind }).success).toBe(true);
    }
    expect(sanitizedArtifactSchema.safeParse({ ...f.artifact, taint: "RAW" }).success).toBe(false);
    expect(sanitizedArtifactSchema.safeParse({ ...f.artifact, anonymous: true }).success).toBe(false);
    expect(tokenizationScopeSchema.safeParse({ contract: "jenan.privacy-gateway.tokenization/v1", scope: f.scope, pins: f.policy.pins,
      mappingTaint: "RAW", linkage: "PACKAGE_LOCAL_ONLY", tokenKind: "OPAQUE_RANDOM_128_BITS_MIN",
      reverseService: "FORBIDDEN", mappingKeyHandleId: privacyId(61), expiresAt: privacyEnd }).success).toBe(true);
  });
  it("validates strict client package metadata and rejects RAW names/content and extended lifetime", () => {
    const f = privacyFixture(); const value = { contract: "jenan.privacy-gateway.package/v1", scope: f.scope, purposeId: privacyId(62),
      usageBasisId: privacyId(63), schemaHash: "a".repeat(64), pins: f.policy.pins, createdAt: privacyNow,
      expiresAt: privacyEnd, retention: "ANALYTICS_EPHEMERAL_ONLY" };
    expect(clientPackageSchema.safeParse(value).success).toBe(true);
    expect(clientPackageSchema.safeParse({ ...value, fileName: "private.pdf" }).success).toBe(false);
    expect(clientPackageSchema.safeParse({ ...value, expiresAt: "2026-10-25T04:00:00.000Z" }).success).toBe(false);
  });
});
describe("Privacy M1 explicit lifecycle, taint and duty separation", () => {
  const disallowed = Object.entries(processingEdges).flatMap(([from, targets]) =>
    Object.keys(processingEdges).filter((to) => !targets.includes(to as keyof typeof processingEdges) &&
      !(["REJECTED", "FAILED", "CANCELLED", "EXPIRED"].includes(to) &&
        !["REJECTED", "FAILED", "CANCELLED", "EXPIRED", "SANITIZATION_VERIFIED"].includes(from)))
      .map((to) => [from as keyof typeof processingEdges, to as keyof typeof processingEdges] as const));
  it.each(disallowed)("rejects disallowed processing edge %s -> %s", (from, to) => {
    const f = privacyFixture(); f.job.processing = from;
    if (from === "SANITIZATION_VERIFIED") {
      f.job.artifact = f.artifact; f.job.verification = f.verification; f.job.verifierId = privacyId(11);
    }
    const verifier = ["SANITIZATION_VERIFICATION", "MANUAL_PRIVACY_REVIEW_REQUIRED"].includes(from);
    const intake = ["CREATED", "RECEIVING", "INTAKE_VALIDATING", "MALWARE_SCANNING"].includes(from);
    const actor = f.actor(verifier ? 11 : 10);
    expect(() => transitionPrivacyJob(f.job, { lifecycle: "processing", target: to }, f.context(f.job), actor,
      f.grants(actor, verifier ? "VERIFIER" : intake ? "INTAKE" : "SANITIZER"), f.policy)).toThrow("ILLEGAL_TRANSITION");
  });
  it("accepts the full structurally evidenced separated flow without mutating the original job", () => {
    const f = flow(); const original = structuredClone(f.current());
    f.step({ lifecycle: "processing", target: "SANITIZATION_VERIFIED" }, 11,
      { verification: f.verification, authenticatedReceiptHash: privacyHash(f.verification) });
    for (const target of ["RELEASE_AUTHORIZED", "PUBLISHING", "SANITIZED_PUBLISHED"] as const) f.step({ lifecycle: "publication", target }, 12,
      target === "SANITIZED_PUBLISHED" ? { publication: f.publication, authenticatedReceiptHash: privacyHash(f.publication) } : {});
    for (const target of ["DESTRUCTION_PENDING", "RAW_ACCESS_REVOKED", "DESTRUCTION_VERIFYING", "RAW_DESTROYED"] as const) f.step({ lifecycle: "destruction", target }, 13,
      target === "RAW_DESTROYED" ? { destruction: f.destruction, authenticatedReceiptHash: privacyHash(f.destruction) } : {});
    expect(f.current()).toMatchObject({ processing: "SANITIZATION_VERIFIED", publication: "SANITIZED_PUBLISHED", destruction: "RAW_DESTROYED" });
    expect(original.processing).toBe("SANITIZATION_VERIFICATION"); expect(validatePrivacyJob(f.current())).toEqual(f.current());
  });
  it.each(["processing", "publication", "destruction"] as const)("has terminal-only explicit %s edges", (lifecycle) => {
    const edges = lifecycle === "processing" ? processingEdges : lifecycle === "publication" ? publicationEdges : destructionEdges;
    for (const [from, targets] of Object.entries(edges)) {
      expect(targets).not.toContain(from); expect(new Set(targets).size).toBe(targets.length);
      for (const target of targets) expect(Object.keys(edges)).toContain(target);
    }
    expect(processingEdges.SANITIZATION_VERIFIED).toEqual([]); expect(publicationEdges.SANITIZED_PUBLISHED).toEqual([]);
    expect(destructionEdges.RAW_DESTROYED).toEqual([]);
  });
  it.each(["RAW_READY", "SANITIZING", "SANITIZATION_VERIFIED"] as const)("blocks CREATED -> %s shortcuts", (target) => {
    const f = privacyFixture(); const actor = f.actor(10);
    expect(() => transitionPrivacyJob(f.job, { lifecycle: "processing", target }, f.context(f.job), actor, f.grants(actor, "INTAKE"), f.policy)).toThrow("ILLEGAL_TRANSITION");
  });
  it.each(["RELEASE_AUTHORIZED", "PUBLISHING", "SANITIZED_PUBLISHED"] as const)("blocks unverified publication %s", (target) => {
    const f = flow(); expect(() => f.step({ lifecycle: "publication", target }, 12)).toThrow();
  });
  it("does not accept raw artifacts or a missing verification receipt as verification", () => {
    const f = flow();
    expect(() => f.step({ lifecycle: "processing", target: "SANITIZATION_VERIFIED" }, 11)).toThrow("VERIFICATION_FAILED");
    expect(() => parsePrivacy(sanitizedArtifactSchema, { ...f.artifact, taint: "RAW", rawContent: "secret" })).toThrow("MALFORMED_INPUT");
  });
  it("cannot promote scan-unavailable into RAW_READY", () => {
    const f = privacyFixture(); f.job.processing = "MALWARE_SCANNING"; const actor = f.actor(10);
    expect(() => transitionPrivacyJob(f.job, { lifecycle: "processing", target: "RAW_READY" }, f.context(f.job), actor,
      f.grants(actor, "INTAKE"), f.policy)).toThrow("MALWARE_SCAN_UNAVAILABLE");
  });
  it("requires independent manual review then verification, never direct publication", () => {
    const f = flow(); f.step({ lifecycle: "processing", target: "MANUAL_PRIVACY_REVIEW_REQUIRED" }, 11);
    expect(() => f.step({ lifecycle: "processing", target: "SANITIZATION_VERIFICATION" }, 11)).toThrow("VERIFICATION_FAILED");
    expect(() => f.step({ lifecycle: "publication", target: "SANITIZED_PUBLISHED" }, 12)).toThrow();
    const review = { contract: "jenan.privacy-gateway.review/v1" as const, id: privacyId(80), scope: f.scope,
      attemptId: f.job.attemptId, fence: f.job.fence, pins: f.policy.pins, actorId: privacyId(11), at: privacyNow,
      artifactHash: f.artifact.contentHash, disposition: "APPROVED_FOR_REVERIFICATION" as const,
      reason: "MANUAL_PRIVACY_REVIEW_REQUIRED" as const, auditId: privacyId(81) };
    expect(f.step({ lifecycle: "processing", target: "SANITIZATION_VERIFICATION" }, 11,
      { review, authenticatedReceiptHash: privacyHash(review) }).processing).toBe("SANITIZATION_VERIFICATION");
  });
  it.each(["expectedRevision", "expectedFence", "attemptId"] as const)("rejects stale %s", (key) => {
    const f = flow(); const actor = f.actor(11); const context = f.context(f.current());
    const changed = { ...context, [key]: key === "attemptId" ? privacyId(99) : 999 };
    expect(() => transitionPrivacyJob(f.current(), { lifecycle: "processing", target: "SANITIZATION_VERIFIED" },
      changed, actor, f.grants(actor, "VERIFIER"), f.policy)).toThrow("STALE_REVISION");
  });
  it.each(["scope", "attemptId", "fence", "pins", "artifactHash", "lineageHash", "schemaHash"] as const)(
    "rejects verification %s substitution", (field) => {
      const f = flow(); const receipt = structuredClone(f.verification);
      const changed = { ...receipt, [field]: field === "scope" ? { ...receipt.scope, clientId: privacyId(99) }
        : field === "attemptId" ? privacyId(99) : field === "fence" ? 99
        : field === "pins" ? { ...receipt.pins, extraction: { ...receipt.pins.extraction, version: "9.0.0" } } : "f".repeat(64) };
      expect(() => f.step({ lifecycle: "processing", target: "SANITIZATION_VERIFIED" }, 11,
        { verification: changed, authenticatedReceiptHash: privacyHash(changed) })).toThrow();
    });
  it("binds trusted receipt authentication to the whole receipt, without claiming a schema verifies signatures", () => {
    const f = flow();
    expect(verificationReceiptSchema.safeParse(f.verification).success).toBe(true);
    expect(() => f.step({ lifecycle: "processing", target: "SANITIZATION_VERIFIED" }, 11,
      { verification: f.verification, authenticatedReceiptHash: "f".repeat(64) })).toThrow("HASH_MISMATCH");
  });
  it.each(["artifactsAbsent", "replicasAndVersionsAbsent", "workersTerminated", "recoverableKeysDestroyed", "backupsExcluded",
    "tokenMappingsAbsent", "queuesCleared", "quarantineAbsent", "cachesAndOcrAbsent", "multipartAbsent"] as const)(
    "forbids destruction claims without %s", (field) => {
      const f = privacyFixture(); expect(destructionReceiptSchema.safeParse({ ...f.destruction, [field]: false }).success).toBe(false);
    });
  it("forbids object-delete-only destruction, unchecked inventory, unknown locations and key deletion pending", () => {
    const f = privacyFixture();
    for (const change of [{ checkedCount: 7 }, { unknownLocations: 1 }, { cryptoStatus: "SCHEDULED" }]) {
      expect(destructionReceiptSchema.safeParse({ ...f.destruction, ...change }).success).toBe(false);
    }
    const actor = f.actor(13); f.job.processing = "FAILED"; f.job.destruction = "DESTRUCTION_VERIFYING"; f.job.rawAccessRevokedAt = privacyNow;
    expect(() => transitionPrivacyJob(f.job, { lifecycle: "destruction", target: "RAW_DESTROYED" }, f.context(f.job), actor,
      f.grants(actor, "DESTROYER"), f.policy)).toThrow("DESTRUCTION_PENDING");
  });
  it("binds destruction evidence to the exact job inventory instead of accepting a different complete inventory", () => {
    const f = privacyFixture(); const actor = f.actor(13);
    f.job.processing = "FAILED"; f.job.destruction = "DESTRUCTION_VERIFYING"; f.job.rawAccessRevokedAt = privacyNow;
    const wrong = { ...f.destruction, inventoryHash: "f".repeat(64) };
    expect(() => transitionPrivacyJob(f.job, { lifecycle: "destruction", target: "RAW_DESTROYED" }, f.context(f.job), actor,
      f.grants(actor, "DESTROYER"), f.policy, { destruction: wrong, authenticatedReceiptHash: privacyHash(wrong) })).toThrow("LINEAGE_MISMATCH");
  });
  it("tracks destruction failure and retries cleanup without reactivating RAW access", () => {
    const f = privacyFixture(); const actor = f.actor(13);
    f.job.processing = "FAILED"; f.job.destruction = "DESTRUCTION_VERIFYING"; f.job.rawAccessRevokedAt = privacyNow;
    const failed = transitionPrivacyJob(f.job, { lifecycle: "destruction", target: "DESTRUCTION_FAILED" }, f.context(f.job), actor,
      f.grants(actor, "DESTROYER"), f.policy);
    const pending = transitionPrivacyJob(failed, { lifecycle: "destruction", target: "DESTRUCTION_PENDING" }, f.context(failed), actor,
      f.grants(actor, "DESTROYER"), f.policy);
    expect(pending.rawAccessRevokedAt).toBe(privacyNow);
    expect(() => assertJobRawAccess(pending, actor, f.grants(actor, "SANITIZER", "KEY_ACCESS"), privacyNow)).toThrow("AUTHORIZATION_DENIED");
  });
  it("permits cleanup at TTL but forbids new RAW work/access and manual-review TTL extension", () => {
    const f = privacyFixture(); const actor = f.actor(13);
    const grants = f.grants(actor, "DESTROYER").map((grant) => ({ ...grant, expiresAt: "2026-10-25T04:00:00.000Z" }));
    expect(transitionPrivacyJob(f.job, { lifecycle: "destruction", target: "DESTRUCTION_PENDING" },
      f.context(f.job, privacyEnd), actor, grants, f.policy).destruction).toBe("DESTRUCTION_PENDING");
    expect(() => assertJobRawAccess(f.job, actor, grants, privacyEnd)).toThrow("AUTHORIZATION_DENIED");
  });
  it("does not blindly republish a timeout and allows only exact evidenced reconciliation", () => {
    const f = flow(); f.step({ lifecycle: "processing", target: "SANITIZATION_VERIFIED" }, 11,
      { verification: f.verification, authenticatedReceiptHash: privacyHash(f.verification) });
    f.step({ lifecycle: "publication", target: "RELEASE_AUTHORIZED" }, 12); f.step({ lifecycle: "publication", target: "PUBLISHING" }, 12);
    f.step({ lifecycle: "publication", target: "RECONCILIATION_REQUIRED" }, 12);
    expect(() => f.step({ lifecycle: "publication", target: "PUBLISHING" }, 12)).toThrow("ILLEGAL_TRANSITION");
    expect(() => f.step({ lifecycle: "publication", target: "SANITIZED_PUBLISHED" }, 12)).toThrow("VERIFICATION_FAILED");
  });
});
describe("Privacy M1 current scoped authorization and safe audit", () => {
  it.each([["SANITIZER", "VERIFIER"], ["SANITIZER", "PUBLISHER"], ["VERIFIER", "PUBLISHER"],
    ["PUBLISHER", "KEY_ACCESS"], ["PUBLISHER", "INTAKE"]] as const)("rejects collapsed %s/%s privileges", (first, second) => {
    const f = privacyFixture(); const actor = f.actor(10);
    expect(() => assertPrivacyRole(actor, f.grants(actor, first, second), first, f.scope, privacyNow)).toThrow("AUTHORIZATION_DENIED");
  });
  it("rejects the same actor sequentially switching sanitizer -> verifier -> publisher", () => {
    const f = flow();
    expect(() => f.step({ lifecycle: "processing", target: "SANITIZATION_VERIFIED" }, 10,
      { verification: { ...f.verification, actorId: privacyId(10) },
        authenticatedReceiptHash: privacyHash({ ...f.verification, actorId: privacyId(10) }) })).toThrow("AUTHORIZATION_DENIED");
    f.step({ lifecycle: "processing", target: "SANITIZATION_VERIFIED" }, 11,
      { verification: f.verification, authenticatedReceiptHash: privacyHash(f.verification) });
    expect(() => f.step({ lifecycle: "publication", target: "RELEASE_AUTHORIZED" }, 10)).toThrow("AUTHORIZATION_DENIED");
    expect(() => f.step({ lifecycle: "publication", target: "RELEASE_AUTHORIZED" }, 11)).toThrow("AUTHORIZATION_DENIED");
  });
  it.each(["actor", "active", "revision", "organizationId", "clientId", "packageId", "jobId", "expired"] as const)(
    "denies stale or wrong %s grant context", (field) => {
      const f = privacyFixture(); const actor = f.actor(10); const grants = f.grants(actor, "SANITIZER"); const grant = grants[0]!;
      if (field === "actor") grant.actorId = privacyId(99);
      else if (field === "active") grant.active = false;
      else if (field === "revision") grant.authorizationRevision++;
      else if (field === "expired") grant.expiresAt = privacyNow;
      else grant.scope[field] = privacyId(99);
      expect(() => assertPrivacyRole(actor, grants, "SANITIZER", f.scope, privacyNow)).toThrow();
    });
  it("gives publisher no RAW key access; revocation blocks previously valid sanitizer access", () => {
    const f = privacyFixture(); const actor = f.actor(10);
    expect(() => assertJobRawAccess(f.job, actor, f.grants(actor, "PUBLISHER"), privacyNow)).toThrow("AUTHORIZATION_DENIED");
    const grants = f.grants(actor, "SANITIZER", "KEY_ACCESS");
    expect(() => assertJobRawAccess(f.job, actor, grants, privacyNow)).not.toThrow();
    expect(() => assertJobRawAccess({ ...f.job, rawAccessRevokedAt: privacyNow }, actor, grants, privacyNow)).toThrow("AUTHORIZATION_DENIED");
    expect(() => assertJobRawAccess(f.job, { ...actor, active: false }, grants, privacyNow)).toThrow("AUTHORIZATION_DENIED");
  });
  const audit = () => {
    const f = privacyFixture();
    return { contract: "jenan.privacy-gateway.audit/v1", id: privacyId(70), scope: f.scope, actorId: privacyId(10),
      operation: "VERIFY", at: privacyNow, revision: 1, policyHash: privacyHash(f.policy), outcome: "PENDING",
      reason: null, artifactId: null, receiptId: null, previousEventHash: null };
  };
  it("allows bounded opaque audit metadata only", () => expect(parsePrivacyAuditEvent(audit())).toEqual(audit()));
  it.each(["rawContent", "fileName", "email", "phone", "iban", "name", "ocrText", "prompt", "metadata", "error", "rawHash"])(
    "rejects %s audit extensions instead of stripping or logging them", (field) => {
      expect(() => parsePrivacyAuditEvent({ ...audit(), [field]: "private@example.test" })).toThrow("MALFORMED_INPUT");
    });
  it.each(["actorId", "artifactId", "receiptId", "reason"] as const)("does not accept sensitive text in %s", (field) => {
    expect(() => parsePrivacyAuditEvent({ ...audit(), [field]: "private@example.test" })).toThrow("MALFORMED_INPUT");
  });
  it.each(failureCodes)("retains explicit safe failure code %s", (code) => {
    const f = privacyFixture();
    expect(parsePrivacy(failureSchema, { contract: "jenan.privacy-gateway.failure/v1", code, scope: f.scope, at: privacyNow, auditId: privacyId(71) }).code).toBe(code);
  });
});
