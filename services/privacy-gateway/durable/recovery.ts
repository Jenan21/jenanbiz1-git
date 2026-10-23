import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma, type PrivacyAdmission, type PrivacyInventoryArtifact } from "@/generated/prisma/client";
import type { PrivacyJob, PrivacyRole, VerificationReceipt } from "../contracts";
import { pinsSchema } from "../contracts";
import { assertPrivacyRole, parsePrivacy, privacyHash, samePrivacyValue, validatePolicy } from "../policy";
import { validatePrivacyJob } from "../states";
import { extractRaw } from "../intake/archive";
import { initialIntakeLimits } from "../intake/contracts";
import { mediaOf } from "../intake/formats";
import { parseTable, profileHash } from "../sanitization/classification";
import { datasetSchema, mappingSchema, SanitizationError } from "../sanitization/contracts";
import { emptyMapping, sanitizeTables } from "../sanitization/transform";
import { verifyTables } from "../sanitization/verifier";
import { m3References, receiptPayload } from "../sanitization/service";
import { adapterResult, DurablePrivacyError, type EnrollBundle, type GovernedArtifactStore } from "./contracts";
import { admissionSchema, recoveryCommandSchema, recoveryRole, type AdmissionInput, type RecoveryCommand,
  type RecoveryObjects, type RecoveryRuntime, type RecoveryRawAuthority } from "./recovery-contracts";
import type { PrivacyStore, DurableTx } from "./store";

export const artifactChecksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (value: Uint8Array): unknown => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value));
const zero = "0".repeat(64);
const combinedSchema = z.object({ dataset: datasetSchema, mapping: mappingSchema }).strict();
const safeJob = (j: PrivacyAdmission) => ({ jobId: j.id, packageId: j.packageId, organizationId: j.organizationId, clientId: j.clientId });
type Artifact = PrivacyInventoryArtifact;

/** Nonactivated reference coordinator. PostgreSQL, not a process registry, owns every checkpoint. */
export class PrivacyRecovery implements RecoveryRawAuthority {
  constructor(readonly store: PrivacyStore, readonly objects: RecoveryObjects, readonly runtime: RecoveryRuntime) {}
  private async authorize(j: PrivacyAdmission, actorId: string, role: PrivacyRole, cleanup = false) {
    const current = await adapterResult(() => this.runtime.authorization(j.id, actorId));
    assertPrivacyRole(current.actor, current.grants, role, safeJob(j), this.runtime.now());
    if (current.actor.id !== actorId || !cleanup && (j.revokedAt || j.expiresAt.toISOString() <= this.runtime.now())) {
      throw new DurablePrivacyError("AUTHORIZATION_DENIED");
    }
    if (!cleanup && j.scannerVersion !== this.runtime.scannerVersion) throw new DurablePrivacyError("HASH_MISMATCH");
    if (role === "VERIFIER" && [j.ownerId, j.sanitizerId].includes(actorId)) throw new DurablePrivacyError("AUTHORIZATION_DENIED");
    if (role === "SANITIZER" && j.sanitizerId && j.sanitizerId !== actorId ||
      role === "VERIFIER" && j.verifierId && j.verifierId !== actorId) throw new DurablePrivacyError("AUTHORIZATION_DENIED");
    if (["INTAKE", "SANITIZER", "VERIFIER"].includes(role)) {
      assertPrivacyRole(current.actor, current.grants, "KEY_ACCESS", safeJob(j), this.runtime.now());
    }
    const policy = validatePolicy(await this.runtime.policy(j.policyHash));
    if (privacyHash(policy) !== j.policyHash || !Object.entries(m3References()).every(([name, pin]) =>
      samePrivacyValue(policy.pins[name as keyof ReturnType<typeof m3References>], pin))) throw new DurablePrivacyError("HASH_MISMATCH");
    const published = await this.store.client.privacyDurableJob.findUnique({ where: { id: j.id } });
    if (!cleanup && published?.revokedAt) throw new DurablePrivacyError("AUTHORIZATION_DENIED");
  }
  async status(jobId: string, actorId: string, role: PrivacyRole) {
    parsePrivacy(recoveryCommandSchema.shape.jobId, jobId);
    const j = await adapterResult(() => this.store.client.privacyAdmission.findUniqueOrThrow({ where: { id: jobId } }));
    await this.authorize(j, actorId, role, role === "DESTROYER" || role === "AUDITOR");
    return j;
  }
  private async event(tx: DurableTx, j: PrivacyAdmission, actorId: string, key: string, action: string, intentHash: string, role: PrivacyRole) {
    const prior = await tx.privacyAdmissionEvent.findFirst({ where: { jobId: j.id }, orderBy: { revision: "desc" } });
    const event = { jobId: j.id, revision: j.revision, actorId, key, action, state: j.state, intentHash, role,
      result: j.cleanup === "RETRY" ? "RETRY" : j.failure && j.cleanup !== "REFERENCE_CLEANED" ? "FAILED" : "COMPLETED",
      previousHash: prior?.hash ?? zero, at: this.runtime.now() };
    await tx.privacyAdmissionEvent.create({ data: { ...event, at: new Date(event.at), hash: privacyHash(event) } });
  }
  private artifact(j: PrivacyAdmission, kind: string, ordinal: number, parentId: string | null,
    checksum: string | null = null, size: number | null = null): Artifact {
    return { id: this.runtime.id(), jobId: j.id, packageId: j.packageId, organizationId: j.organizationId, clientId: j.clientId,
      attemptId: j.attemptId, fence: j.fence, kind, ordinal, parentId, objectRef: this.runtime.id(), keyRef: this.runtime.id(),
      keyVersion: 1, cryptoVersion: "AES256_GCM_V1", checksum, size, state: "RESERVED",
      taint: kind === "CANDIDATE" ? "SANITIZED_CANDIDATE" : kind === "VERIFICATION" ? "SAFE_RECEIPT" : "RAW",
      scan: ["ORIGINAL", "EXTRACTED"].includes(kind) ? "PENDING" : "NOT_APPLICABLE",
      scanHash: null, scannerVersion: null, createdAt: new Date(this.runtime.now()) };
  }
  async admit(raw: AdmissionInput) {
    const input = parsePrivacy(admissionSchema, raw);
    const policy = validatePolicy(await this.runtime.policy(input.policyHash));
    if (privacyHash(policy) !== input.policyHash) throw new DurablePrivacyError("HASH_MISMATCH");
    const now = this.runtime.now();
    const j: PrivacyAdmission = { id: input.jobId, packageId: input.packageId, organizationId: input.organizationId, clientId: input.clientId,
      attemptId: input.attemptId, fence: input.fence, revision: 0, ownerId: input.ownerId, sanitizerId: null, verifierId: null,
      state: "INTAKE_ACCEPTED", media: input.media, policyHash: input.policyHash, manifestHash: null, candidateHash: null,
      scannerVersion: this.runtime.scannerVersion, stageAttempts: 0,
      verificationHash: null, leaseOwner: null, leaseUntil: null, cleanup: "NONE", failure: null, revokedAt: null,
      createdAt: new Date(now), expiresAt: new Date(Date.parse(now) + policy.rawTtlMs), updatedAt: new Date(now) };
    await this.authorize(j, input.ownerId, "INTAKE");
    const hash = privacyHash(input);
    const result = await adapterResult(() => this.store.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.packageId}))`;
      const existing = await tx.privacyAdmission.findUnique({ where: { id: j.id } });
      if (existing) {
        await this.authorize(existing, input.ownerId, "INTAKE");
        const event = await tx.privacyAdmissionEvent.findUnique({ where: { jobId_key: { jobId: j.id, key: input.key } } });
        if (!event || event.intentHash !== hash) throw new DurablePrivacyError("IDEMPOTENCY_CONFLICT");
        return existing;
      }
      await tx.privacyClientPackage.create({ data: { id: input.packageId, organizationId: input.organizationId,
        clientId: input.clientId, purposeId: input.purposeId, usageBasisId: input.usageBasisId,
        policyHash: input.policyHash, pins: policy.pins, createdAt: j.createdAt, expiresAt: j.expiresAt } });
      const job = await tx.privacyAdmission.create({ data: j });
      await tx.privacyInventoryArtifact.create({ data: this.artifact(j, "ORIGINAL", 0, null, input.checksum, input.size) });
      await this.event(tx, j, input.ownerId, input.key, "ADMIT", hash, "INTAKE");
      await this.authorize(job, input.ownerId, "INTAKE");
      return job;
    }));
    await this.runtime.checkpoint("INTAKE_ACCEPTED");
    return result;
  }
  private async transaction(command: RecoveryCommand, role: PrivacyRole, action: string, intent: unknown,
    operation: (tx: DurableTx, j: PrivacyAdmission) => Promise<Prisma.PrivacyAdmissionUpdateInput>, lease = true) {
    parsePrivacy(recoveryCommandSchema, command);
    const hash = privacyHash({ command, action, intent });
    return adapterResult(() => this.store.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "PrivacyAdmission" WHERE "id"=${command.jobId}::uuid FOR UPDATE`;
      const j = await tx.privacyAdmission.findUniqueOrThrow({ where: { id: command.jobId } });
      await this.authorize(j, command.actorId, role, ["DESTROYER", "AUDITOR"].includes(role));
      if (j.attemptId !== command.attemptId || j.fence !== command.fence) throw new DurablePrivacyError("STALE_ATTEMPT");
      const old = await tx.privacyAdmissionEvent.findUnique({ where: { jobId_key: { jobId: j.id, key: command.key } } });
      if (old) {
        if (old.intentHash !== hash || old.actorId !== command.actorId) throw new DurablePrivacyError("IDEMPOTENCY_CONFLICT");
        return j;
      }
      if (j.revision !== command.revision || lease && (j.leaseOwner !== command.workerId || !j.leaseUntil ||
        j.leaseUntil.toISOString() <= this.runtime.now())) throw new DurablePrivacyError("STALE_REVISION");
      const update = await operation(tx, j);
      await this.authorize(j, command.actorId, role, role === "DESTROYER");
      const next = await tx.privacyAdmission.update({ where: { id: j.id }, data: {
        ...update, ...(update.state && update.state !== j.state ? { stageAttempts: 0 } : {}),
        revision: j.revision + 1, updatedAt: new Date(this.runtime.now()),
      } });
      await this.event(tx, next, command.actorId, command.key, action, hash, role);
      return next;
    }, { timeout: 30_000 }));
  }
  async audit(jobId: string, actorId: string) {
    parsePrivacy(recoveryCommandSchema.shape.jobId, jobId);
    return adapterResult(() => this.store.client.$transaction(async (tx) => {
      const job = await tx.privacyAdmission.findUniqueOrThrow({ where: { id: jobId } });
      await this.authorize(job, actorId, "AUDITOR", true);
      const events = await tx.privacyAdmissionEvent.findMany({ where: { jobId }, orderBy: { revision: "asc" } });
      let previousHash = zero;
      if (events.length !== job.revision + 1) throw new DurablePrivacyError("AUDIT_TAMPERED");
      for (const [revision, event] of events.entries()) {
        const { hash, at, ...value } = event;
        if (event.revision !== revision || event.previousHash !== previousHash ||
          hash !== privacyHash({ ...value, at: at.toISOString() })) throw new DurablePrivacyError("AUDIT_TAMPERED");
        previousHash = hash;
      }
      await this.authorize(job, actorId, "AUDITOR", true);
      return events;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }));
  }
  async claim(command: RecoveryCommand) {
    const j = await this.status(command.jobId, command.actorId, recoveryRole((await this.store.client.privacyAdmission.findUniqueOrThrow({ where: { id: command.jobId } })).state));
    return this.transaction(command, recoveryRole(j.state), "CLAIM", {}, async (_tx, job) => {
      if (job.leaseUntil && job.leaseUntil.toISOString() > this.runtime.now() && job.leaseOwner !== command.workerId) {
        throw new DurablePrivacyError("STALE_REVISION");
      }
      if (job.stageAttempts >= 5) throw new DurablePrivacyError("ADAPTER_UNAVAILABLE");
      return { leaseOwner: command.workerId, leaseUntil: new Date(Date.parse(this.runtime.now()) + 60_000),
        stageAttempts: job.stageAttempts + 1, ...(recoveryRole(job.state) === "VERIFIER" ? { verifierId: command.actorId } : {}) };
    }, false);
  }
  async assertObject(artifact: Artifact, write: boolean) {
    const j = await this.store.client.privacyAdmission.findUniqueOrThrow({ where: { id: artifact.jobId } });
    const exact = await this.store.client.privacyInventoryArtifact.findUnique({ where: { id: artifact.id } });
    const published = await this.store.client.privacyDurableJob.findUnique({ where: { id: artifact.jobId } });
    const retained = !write && ["CANDIDATE", "VERIFICATION"].includes(artifact.kind) && published?.publication === "SANITIZED_PUBLISHED";
    if (!exact || exact.objectRef !== artifact.objectRef || exact.keyRef !== artifact.keyRef ||
      exact.attemptId !== j.attemptId || exact.fence !== j.fence || write && exact.state !== "RESERVED" ||
      !retained && (j.revokedAt || j.cleanup !== "NONE" || j.expiresAt.toISOString() <= this.runtime.now() || published?.revokedAt)) {
      throw new DurablePrivacyError("AUTHORIZATION_DENIED");
    }
  }
  private async read(a: Artifact) {
    await this.assertObject(a, false);
    const bytes = await adapterResult(() => this.objects.read(a));
    if (!bytes || a.checksum && artifactChecksum(bytes) !== a.checksum || a.size && bytes.length !== a.size) {
      bytes?.fill(0); throw new DurablePrivacyError("HASH_MISMATCH");
    }
    await this.assertObject(a, false);
    return bytes;
  }
  private async write(a: Artifact, bytes: Uint8Array, command: RecoveryCommand) {
    const authorize = async () => {
      await this.assertObject(a, true);
      const j = await this.store.client.privacyAdmission.findUniqueOrThrow({ where: { id: a.jobId } });
      await this.authorize(j, command.actorId, recoveryRole(j.state));
      if (j.revision !== command.revision || j.leaseOwner !== command.workerId ||
        !j.leaseUntil || j.leaseUntil.toISOString() <= this.runtime.now()) throw new DurablePrivacyError("STALE_ATTEMPT");
    };
    await authorize();
    await this.objects.write(a, bytes, authorize);
    await authorize();
    await this.runtime.checkpoint(`WRITE_${a.kind}`);
  }
  private async complete(tx: DurableTx, a: Artifact, bytes: Uint8Array, scanned = false) {
    return tx.privacyInventoryArtifact.update({ where: { id: a.id }, data: { state: "COMPLETE",
      checksum: artifactChecksum(bytes), size: bytes.length, ...(scanned ? { scan: "CLEAN", scanHash: artifactChecksum(bytes),
        scannerVersion: this.runtime.scannerVersion } : {}) } });
  }
  private async scan(bytes: Uint8Array) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), initialIntakeLimits.scanMs);
    try {
      const verdict = await Promise.race([this.runtime.scanner(bytes, controller.signal),
        new Promise<never>((_resolve, reject) => controller.signal.addEventListener("abort", () => reject(new DurablePrivacyError("VERIFICATION_FAILED")), { once: true }))]);
      if (verdict !== "CLEAN") throw new DurablePrivacyError("VERIFICATION_FAILED");
    } finally { clearTimeout(timeout); controller.abort(); }
  }
  private async inventory(j: PrivacyAdmission) {
    return this.store.client.privacyInventoryArtifact.findMany({ where: { jobId: j.id }, orderBy: [{ kind: "asc" }, { ordinal: "asc" }] });
  }
  private manifest(items: Artifact[]) {
    return privacyHash(items.filter((a) => a.kind === "EXTRACTED").map((a) => ({
      id: a.id, parentId: a.parentId, ordinal: a.ordinal, checksum: a.checksum, size: a.size,
      scanHash: a.scanHash, scannerVersion: a.scannerVersion,
    })));
  }
  private async raw(j: PrivacyAdmission, items: Artifact[]) {
    if (!j.manifestHash || this.manifest(items) !== j.manifestHash ||
      items.filter((a) => ["ORIGINAL", "EXTRACTED"].includes(a.kind)).some((a) =>
        a.state !== "COMPLETE" || a.scan !== "CLEAN" || a.scanHash !== a.checksum || a.scannerVersion !== this.runtime.scannerVersion)) {
      throw new DurablePrivacyError("VERIFICATION_FAILED");
    }
    const result: { id: string; bytes: Uint8Array }[] = [];
    try {
      for (const a of items.filter((a) => a.kind === "EXTRACTED")) result.push({ id: a.id, bytes: await this.read(a) });
      if (!result.length) throw new DurablePrivacyError("VERIFICATION_FAILED");
      return result;
    } catch (error) { for (const a of result) a.bytes.fill(0); throw error; }
  }
  private async job(j: PrivacyAdmission, items: Artifact[]): Promise<PrivacyJob> {
    const pack = await this.store.client.privacyClientPackage.findUniqueOrThrow({ where: { id: j.packageId } });
    const pins = parsePrivacy(pinsSchema, pack.pins);
    const raw = items.filter((a) => a.taint === "RAW");
    return { contract: "jenan.privacy-gateway.job/v1", scope: safeJob(j), ownerId: j.ownerId, attemptId: j.attemptId,
      fence: j.fence, revision: j.revision, pins, createdAt: j.createdAt.toISOString(), rawExpiresAt: j.expiresAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(), processing: "SANITIZATION_VERIFICATION", publication: "NOT_REQUESTED", destruction: "RAW_PRESENT",
      processorIds: [j.ownerId, ...(j.sanitizerId && j.sanitizerId !== j.ownerId ? [j.sanitizerId] : [])],
      verifierId: null, publisherId: null, artifact: null, verification: null, publicationReceipt: null, destructionReceipt: null,
      rawAccessRevokedAt: null, rawInventoryCount: raw.length,
      rawInventoryHash: privacyHash(raw.map((a) => ({ id: a.id, object: a.objectRef, key: a.keyRef, checksum: a.checksum }))) };
  }
  async advance(command: RecoveryCommand, upload?: Uint8Array): Promise<PrivacyAdmission> {
    parsePrivacy(recoveryCommandSchema, command);
    const j = await this.store.client.privacyAdmission.findUniqueOrThrow({ where: { id: command.jobId } });
    const replay = await this.store.client.privacyAdmissionEvent.findUnique({ where: { jobId_key: { jobId: j.id, key: command.key } } });
    if (replay) {
      const prior = await this.store.client.privacyAdmissionEvent.findUniqueOrThrow({
        where: { jobId_revision: { jobId: j.id, revision: command.revision } },
      });
      await this.authorize(j, command.actorId, recoveryRole(prior.state));
      if (j.attemptId !== command.attemptId || j.fence !== command.fence ||
        replay.intentHash !== privacyHash({ command, action: "ADVANCE", intent: {} })) throw new DurablePrivacyError("IDEMPOTENCY_CONFLICT");
      return j;
    }
    const role = recoveryRole(j.state);
    await this.authorize(j, command.actorId, role);
    if (j.revision !== command.revision || j.attemptId !== command.attemptId || j.fence !== command.fence ||
      j.leaseOwner !== command.workerId || !j.leaseUntil || j.leaseUntil.toISOString() <= this.runtime.now()) throw new DurablePrivacyError("STALE_ATTEMPT");
    const items = await this.inventory(j); const original = items.find((a) => a.kind === "ORIGINAL");
    if (!original) throw new DurablePrivacyError("VERIFICATION_FAILED");
    const move = (data: Prisma.PrivacyAdmissionUpdateInput, op?: (tx: DurableTx) => Promise<void>) =>
      this.transaction(command, role, "ADVANCE", {}, async (tx) => { await op?.(tx); return data; });
    try {
      await this.runtime.checkpoint(j.state);
      if (j.state === "INTAKE_ACCEPTED") return move({ state: "STAGING" });
      if (j.state === "STAGING") {
        const existing = await this.objects.read(original);
        const bytes = existing ?? upload;
        if (!bytes || artifactChecksum(bytes) !== original.checksum || bytes.length !== original.size ||
          mediaOf(bytes, { extension: j.media.toLowerCase(), mime: j.media === "CSV" ? "text/csv" : "application/zip" }) !== j.media) {
          throw new DurablePrivacyError("HASH_MISMATCH");
        }
        try {
          if (!existing) await this.write(original, bytes, command);
          return await move({ state: "SCAN_PENDING" }, async (tx) => { await this.complete(tx, original, bytes); });
        } finally { existing?.fill(0); }
      }
      if (j.state === "SCAN_PENDING") {
        const bytes = await this.read(original);
        try {
          await this.scan(bytes); await this.runtime.checkpoint("SCANNED");
          return await move({ state: "SCAN_CLEAN" }, async (tx) => { await this.complete(tx, original, bytes, true); });
        } finally { bytes.fill(0); }
      }
      if (j.state === "SCAN_CLEAN") return move({ state: "EXTRACTING" });
      if (j.state === "EXTRACTING") {
        if (original.scan !== "CLEAN" || original.scanHash !== original.checksum || original.scannerVersion !== this.runtime.scannerVersion) {
          throw new DurablePrivacyError("VERIFICATION_FAILED");
        }
        const bytes = await this.read(original);
        const extracted = extractRaw(bytes, j.media === "CSV" ? "CSV" : "ZIP", { ...initialIntakeLimits }, () => Date.parse(this.runtime.now()));
        try {
          const reserved = items.filter((a) => a.kind === "EXTRACTED");
          if (!reserved.length) {
            return await move({}, async (tx) => {
              await tx.privacyInventoryArtifact.createMany({ data: extracted.map((a, ordinal) =>
                this.artifact(j, "EXTRACTED", ordinal, original.id, artifactChecksum(a.bytes), a.bytes.length)) });
            });
          }
          if (reserved.length !== extracted.length || reserved.some((a, i) => a.checksum !== artifactChecksum(extracted[i].bytes))) {
            throw new DurablePrivacyError("HASH_MISMATCH");
          }
          for (const [i, a] of reserved.entries()) {
            const old = await this.objects.read(a);
            if (old) { if (artifactChecksum(old) !== a.checksum) throw new DurablePrivacyError("HASH_MISMATCH"); old.fill(0); }
            else await this.write(a, extracted[i].bytes, command);
            await this.scan(extracted[i].bytes);
          }
          await this.runtime.checkpoint("BEFORE_RAW_READY");
          const manifest = this.manifest(reserved.map((a) => ({ ...a, scanHash: a.checksum, scannerVersion: this.runtime.scannerVersion })));
          return await move({ state: "RAW_READY", manifestHash: manifest }, async (tx) => {
            for (const [i, a] of reserved.entries()) await this.complete(tx, a, extracted[i].bytes, true);
          });
        } finally { bytes.fill(0); for (const a of extracted) a.bytes.fill(0); }
      }
      if (j.state === "RAW_READY") return move({ state: "CLASSIFYING", sanitizerId: command.actorId });
      if (j.state === "CLASSIFYING") {
        const raw = await this.raw(j, items);
        try { for (const a of raw) parseTable(a.bytes); return await move({ state: "SANITIZING" }, async (tx) => {
          await tx.privacyInventoryArtifact.createMany({ data: [this.artifact(j, "TOKEN_MAPPING", 0, original.id),
            this.artifact(j, "CANDIDATE", 0, original.id)] });
        }); } finally { for (const a of raw) a.bytes.fill(0); }
      }
      if (j.state === "SANITIZING") {
        const mapping = items.find((a) => a.kind === "TOKEN_MAPPING"); const candidate = items.find((a) => a.kind === "CANDIDATE");
        if (!mapping || !candidate) throw new DurablePrivacyError("VERIFICATION_FAILED");
        let combined = await this.objects.read(mapping);
        if (!combined) {
          const raw = await this.raw(j, items);
          try {
            const job = await this.job(j, items);
            combined = encode(sanitizeTables(job, raw, emptyMapping(job), () => randomBytes(32).toString("hex")));
            await this.write(mapping, combined, command);
          } finally { for (const a of raw) a.bytes.fill(0); }
        }
        try {
          const output = parsePrivacy(combinedSchema, decode(combined));
          const parsed = output.dataset;
          const bytes = encode(parsed);
          try {
            await this.write(candidate, bytes, command);
            return await move({ state: "SANITIZATION_CANDIDATE_READY", candidateHash: privacyHash(parsed) }, async (tx) => {
              await this.complete(tx, mapping, combined!); await this.complete(tx, candidate, bytes);
            });
          } finally { bytes.fill(0); }
        } finally { combined.fill(0); }
      }
      if (j.state === "SANITIZATION_CANDIDATE_READY") return move({ state: "SANITIZATION_VERIFICATION" }, async (tx) => {
        await tx.privacyInventoryArtifact.create({ data: this.artifact(j, "VERIFICATION", 0, original.id) });
      });
      if (j.state === "SANITIZATION_VERIFICATION") {
        const mapping = items.find((a) => a.kind === "TOKEN_MAPPING"); const candidate = items.find((a) => a.kind === "CANDIDATE");
        const receiptObject = items.find((a) => a.kind === "VERIFICATION");
        if (!mapping || !candidate || !receiptObject || !j.candidateHash || !j.manifestHash) throw new DurablePrivacyError("VERIFICATION_FAILED");
        const raw = await this.raw(j, items); const mapBytes = await this.read(mapping); const dataBytes = await this.read(candidate);
        try {
          const dataset = parsePrivacy(datasetSchema, decode(dataBytes));
          if (privacyHash(dataset) !== j.candidateHash) throw new DurablePrivacyError("HASH_MISMATCH");
          const job = await this.job(j, items);
          const evidence = verifyTables(job, raw, dataset, parsePrivacy(combinedSchema, decode(mapBytes)).mapping);
          const unsigned: Omit<VerificationReceipt, "signature"> = {
            contract: "jenan.privacy-gateway.verification/v1", id: receiptObject.id, scope: job.scope, attemptId: job.attemptId,
            fence: job.fence, pins: job.pins, at: this.runtime.now(), expiresAt: job.rawExpiresAt, actorId: command.actorId,
            auditId: this.runtime.id(), artifactId: candidate.id, artifactHash: j.candidateHash,
            lineageHash: j.manifestHash, schemaHash: privacyHash({ version: "dataset/v1", profileHash: profileHash() }),
            inventoryComplete: true, malwareCleared: true, coverageComplete: true,
            analyticalFidelity: "EXACT_REQUIRED_FIELDS_PRESERVED", residualRisk: "ACCEPTED_FOR_DECLARED_PURPOSE_AND_SCOPE",
            result: "SANITIZATION_VERIFIED",
          };
          const receipt = { ...unsigned, signature: await this.runtime.signer.sign(receiptPayload(unsigned, evidence)) };
          job.processing = "SANITIZATION_VERIFIED"; job.verifierId = command.actorId; job.verification = receipt;
          job.updatedAt = receipt.at;
          job.artifact = { contract: "jenan.privacy-gateway.sanitized/v1", id: candidate.id, scope: job.scope,
            attemptId: job.attemptId, fence: job.fence, bytes: dataBytes.length, createdAt: candidate.createdAt.toISOString(),
            expiresAt: job.rawExpiresAt, pins: job.pins, taint: "SANITIZED_CANDIDATE", format: "ALLOWLIST_STRUCTURED_DATA",
            anonymous: false, contentHash: receipt.artifactHash, schemaHash: receipt.schemaHash, lineageHash: receipt.lineageHash,
            classification: "RESTRICTED", allowExport: false };
          const bundle: EnrollBundle = { job: validatePrivacyJob(job), policyHash: j.policyHash, dataset, receipt, evidence,
            artifactObject: candidate.objectRef, receiptObject: receiptObject.objectRef };
          const bytes = encode(bundle);
          try {
            const old = await this.objects.read(receiptObject);
            if (old) {
              const persisted = decode(old) as EnrollBundle;
              if (!samePrivacyValue(persisted.dataset, dataset) || persisted.receipt.actorId !== command.actorId ||
                !await this.runtime.authenticateVerification(persisted)) throw new DurablePrivacyError("VERIFICATION_FAILED");
              bytes.fill(0); old.fill(0);
              return await move({ state: "SANITIZATION_VERIFIED", verifierId: command.actorId,
                verificationHash: privacyHash(persisted.receipt) }, async (tx) => { await this.complete(tx, receiptObject, encode(persisted)); });
            }
            await this.write(receiptObject, bytes, command);
            return await move({ state: "SANITIZATION_VERIFIED", verifierId: command.actorId, verificationHash: privacyHash(receipt) },
              async (tx) => { await this.complete(tx, receiptObject, bytes); });
          } finally { bytes.fill(0); }
        } finally { for (const a of raw) a.bytes.fill(0); mapBytes.fill(0); dataBytes.fill(0); }
      }
      if (j.state === "SANITIZATION_VERIFIED") return j;
      throw new DurablePrivacyError("ILLEGAL_TRANSITION");
    } catch (error) {
      if (error instanceof DurablePrivacyError && ["STALE_ATTEMPT", "STALE_REVISION", "AUTHORIZATION_DENIED"].includes(error.code)) throw error;
      const review = error instanceof SanitizationError;
      const reason = review ? "SANITIZATION_FAILED" : j.state === "SCAN_PENDING" ? "SCAN_FAILED" :
        j.state === "EXTRACTING" ? "PARSER_FAILED" : j.state === "SANITIZATION_VERIFICATION" ? "VERIFICATION_FAILED" : "ADAPTER_UNAVAILABLE";
      await this.transaction(command, role, "CLEANUP", { reason }, async () => ({
        state: review ? "MANUAL_PRIVACY_REVIEW_REQUIRED" : "FAILED", revokedAt: new Date(this.runtime.now()),
        cleanup: "PENDING", failure: reason, leaseOwner: null, leaseUntil: null,
      }));
      throw new DurablePrivacyError(review ? "VERIFICATION_FAILED" : "ADAPTER_UNAVAILABLE");
    }
  }
  async fail(command: RecoveryCommand, reason: "EXPIRED" | "ABANDONED" | "REVOKED" | "SCAN_FAILED" | "PARSER_FAILED" |
    "SANITIZATION_FAILED" | "VERIFICATION_FAILED" | "CANCELLED" | "ADAPTER_UNAVAILABLE", review = false) {
    return this.transaction(command, "DESTROYER", "CLEANUP", { reason }, async () => ({
      state: review ? "MANUAL_PRIVACY_REVIEW_REQUIRED" : reason === "CANCELLED" ? "CANCELLED" : "FAILED",
      revokedAt: new Date(this.runtime.now()), cleanup: "PENDING", failure: reason, leaseOwner: null, leaseUntil: null,
    }), false);
  }
  async cleanup(command: RecoveryCommand) {
    const j = await this.status(command.jobId, command.actorId, "DESTROYER");
    if (!j.revokedAt) throw new DurablePrivacyError("ILLEGAL_TRANSITION");
    const items = await this.inventory(j);
    const published = await this.store.client.privacyDurableJob.findUnique({ where: { id: j.id } });
    const cleanupItems = published?.publication === "SANITIZED_PUBLISHED" ? items.filter((a) => a.taint === "RAW") : items;
    try {
      await this.objects.tombstone(j.id);
      await this.runtime.checkpoint("CLEANUP_TOMBSTONE");
      for (const a of cleanupItems) {
        await this.objects.remove(a);
        await this.runtime.checkpoint("CLEANUP_OBJECT");
      }
    } catch {
      return this.transaction(command, "DESTROYER", "CLEANED", { result: "RETRY" }, async () => ({ cleanup: "RETRY" }), false);
    }
    return this.transaction(command, "DESTROYER", "CLEANED", { result: "REFERENCE_CLEANED" }, async (tx) => {
      await tx.privacyInventoryArtifact.updateMany({ where: { id: { in: cleanupItems.map((a) => a.id) }, state: { not: "REVOKED" } }, data: { state: "REVOKED" } });
      return { cleanup: "REFERENCE_CLEANED" };
    }, false);
  }
  async revokePublished(command: RecoveryCommand) {
    const current = await this.status(command.jobId, command.actorId, "DESTROYER");
    if (current.revokedAt) return current;
    return this.transaction(command, "DESTROYER", "CLEANUP", { reason: "PUBLISHED" }, async (tx, job) => {
      const published = await tx.privacyDurableJob.findUnique({ where: { id: job.id } });
      if (published?.publication !== "SANITIZED_PUBLISHED" || !published.revokedAt ||
        published.attemptId !== job.attemptId || published.fence !== job.fence) throw new DurablePrivacyError("ILLEGAL_TRANSITION");
      return { revokedAt: published.revokedAt, cleanup: "PENDING", leaseOwner: null, leaseUntil: null };
    }, false);
  }
  async bundle(jobId: string, actorId: string) {
    const j = await this.status(jobId, actorId, "VERIFIER");
    if (j.state !== "SANITIZATION_VERIFIED") throw new DurablePrivacyError("VERIFICATION_FAILED");
    const a = await this.store.client.privacyInventoryArtifact.findUniqueOrThrow({ where: { jobId_kind_ordinal: { jobId, kind: "VERIFICATION", ordinal: 0 } } });
    const bytes = await this.read(a);
    try {
      const bundle = decode(bytes) as EnrollBundle;
      if (privacyHash(bundle.receipt) !== j.verificationHash || !await this.runtime.authenticateVerification(bundle)) throw new DurablePrivacyError("VERIFICATION_FAILED");
      return bundle;
    } finally { bytes.fill(0); }
  }
  async bindDurableAuthority(job: PrivacyJob, actorId: string) {
    const exact = await this.bundle(job.scope.jobId, actorId);
    if (!samePrivacyValue(exact.job, job)) throw new DurablePrivacyError("VERIFICATION_FAILED");
  }
  artifactStore(): GovernedArtifactStore {
    return {
      qualification: "TEST_ONLY",
      dataset: async (objectRef, hash) => {
        const a = await this.store.client.privacyInventoryArtifact.findUniqueOrThrow({ where: { objectRef } });
        if (a.kind !== "CANDIDATE" || a.state !== "COMPLETE") throw new DurablePrivacyError("HASH_MISMATCH");
        const bytes = await this.read(a);
        try { const value = parsePrivacy(datasetSchema, decode(bytes)); if (privacyHash(value) !== hash) throw new DurablePrivacyError("HASH_MISMATCH"); return value; }
        finally { bytes.fill(0); }
      },
      verification: async (objectRef, hash) => {
        const a = await this.store.client.privacyInventoryArtifact.findUniqueOrThrow({ where: { objectRef } });
        if (a.kind !== "VERIFICATION" || a.state !== "COMPLETE") throw new DurablePrivacyError("HASH_MISMATCH");
        const bytes = await this.read(a);
        try { const bundle = decode(bytes) as EnrollBundle; if (privacyHash(bundle.receipt) !== hash) throw new DurablePrivacyError("HASH_MISMATCH"); return bundle; }
        finally { bytes.fill(0); }
      },
      saveReceipt: async (ref, value, hash) => {
        if (privacyHash(value) !== hash) throw new DurablePrivacyError("HASH_MISMATCH");
        await this.objects.saveReceipt(ref, value, hash);
      },
    };
  }
}
