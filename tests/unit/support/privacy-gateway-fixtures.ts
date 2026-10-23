import {
  initialPrivacyLimits, privacyHash, privacyPolicyContentHash, protectedAnalyticalFields,
  type PrivacyActor, type PrivacyGrant, type PrivacyJob, type PrivacyRole, type SanitizationPolicy,
} from "@/services/privacy-gateway";

export const privacyId = (n: number) => `10000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
export const privacyNow = "2026-10-23T04:00:00.000Z";
export const privacyEnd = "2026-10-24T04:00:00.000Z";
export function privacyFixture() {
  const scope = { organizationId: privacyId(1), clientId: privacyId(2), packageId: privacyId(3), jobId: privacyId(4) };
  const policy: SanitizationPolicy = {
    contract: "jenan.privacy-gateway.policy/v1", ...initialPrivacyLimits, separationRequired: true,
    rawExternalProcessing: "FORBIDDEN", legacyDocXls: "REJECT_UNTIL_QUALIFIED", publicationAccessRevocation: "IMMEDIATE",
    analyticalFields: [...protectedAnalyticalFields],
    pins: {
      sanitization: { component: "sanitization", version: "1.0.0", hash: "a".repeat(64) },
      extraction: { component: "extraction", version: "1.0.0", hash: "b".repeat(64) },
      classification: { component: "classification", version: "1.0.0", hash: "c".repeat(64) },
      tokenization: { component: "tokenization", version: "1.0.0", hash: "d".repeat(64) },
      verification: { component: "verification", version: "1.0.0", hash: "e".repeat(64) },
    },
  };
  policy.pins.sanitization.hash = privacyPolicyContentHash(policy);
  const actor = (n: number): PrivacyActor => ({ id: privacyId(n), kind: "HUMAN", privilegedInternal: true, active: true, authorizationRevision: 1 });
  const grants = (principal: PrivacyActor, ...roles: PrivacyRole[]): PrivacyGrant[] => roles.map((role, index) => ({
    id: privacyId(100 + index), actorId: principal.id, scope: structuredClone(scope), role, active: true,
    validFrom: privacyNow, expiresAt: privacyEnd, authorizationRevision: 1,
  }));
  const job: PrivacyJob = {
    contract: "jenan.privacy-gateway.job/v1", scope, ownerId: privacyId(10), attemptId: privacyId(5), fence: 1,
    revision: 0, pins: structuredClone(policy.pins), createdAt: privacyNow, rawExpiresAt: privacyEnd, updatedAt: privacyNow,
    processing: "CREATED", publication: "NOT_REQUESTED", destruction: "RAW_PRESENT", processorIds: [],
    verifierId: null, publisherId: null, artifact: null, verification: null, publicationReceipt: null,
    destructionReceipt: null, rawAccessRevokedAt: null,
    rawInventoryHash: "5".repeat(64), rawInventoryCount: 8,
  };
  const artifact = {
    contract: "jenan.privacy-gateway.sanitized/v1" as const, id: privacyId(20), scope, attemptId: job.attemptId, fence: job.fence,
    bytes: 100, createdAt: privacyNow, expiresAt: privacyEnd, pins: structuredClone(policy.pins),
    taint: "SANITIZED_CANDIDATE" as const, format: "ALLOWLIST_STRUCTURED_DATA" as const, anonymous: false as const,
    contentHash: "1".repeat(64), schemaHash: "2".repeat(64), lineageHash: "3".repeat(64),
    classification: "RESTRICTED" as const, allowExport: false as const,
  };
  const base = {
    id: privacyId(30), scope, attemptId: job.attemptId, fence: job.fence, pins: structuredClone(policy.pins),
    at: privacyNow, actorId: privacyId(11), auditId: privacyId(40),
    signature: { algorithm: "Ed25519" as const, keyId: privacyId(50), keyVersion: 1, value: `${"A".repeat(86)}==` },
  };
  const verification = {
    ...base, contract: "jenan.privacy-gateway.verification/v1" as const, artifactId: artifact.id,
    artifactHash: artifact.contentHash, lineageHash: artifact.lineageHash, schemaHash: artifact.schemaHash,
    expiresAt: privacyEnd, inventoryComplete: true as const, malwareCleared: true as const, coverageComplete: true as const,
    analyticalFidelity: "EXACT_REQUIRED_FIELDS_PRESERVED" as const,
    residualRisk: "ACCEPTED_FOR_DECLARED_PURPOSE_AND_SCOPE" as const, result: "SANITIZATION_VERIFIED" as const,
  };
  const publication = {
    ...base, id: privacyId(31), actorId: privacyId(12), contract: "jenan.privacy-gateway.publication/v1" as const,
    artifactId: artifact.id, artifactHash: artifact.contentHash, verificationReceiptId: verification.id,
    releaseId: privacyId(32), sourceId: "dc-source", itemId: "dc-item", versionId: "dc-version", version: 1,
    checksum: "4".repeat(64), allPartsAcknowledged: true as const, rawAccessRevokedAt: privacyNow, result: "SANITIZED_PUBLISHED" as const,
  };
  const destruction = {
    ...base, id: privacyId(33), actorId: privacyId(13), contract: "jenan.privacy-gateway.destruction/v1" as const,
    inventoryHash: "5".repeat(64), inventoryCount: 8, checkedCount: 8, unknownLocations: 0 as const,
    artifactsAbsent: true as const, replicasAndVersionsAbsent: true as const, multipartAbsent: true as const,
    quarantineAbsent: true as const, cachesAndOcrAbsent: true as const, tokenMappingsAbsent: true as const,
    queuesCleared: true as const, workersTerminated: true as const, recoverableKeysDestroyed: true as const,
    backupsExcluded: true as const, cryptoStatus: "IRREVERSIBLE_VERIFIED" as const, result: "RAW_DESTROYED" as const,
  };
  const context = (current: PrivacyJob, now = privacyNow) => ({
    now, expectedRevision: current.revision, expectedFence: current.fence, attemptId: current.attemptId, policyHash: privacyHash(policy),
  });
  return { scope, policy, job, artifact, verification, publication, destruction, actor, grants, context };
}
