import { z } from "zod";
import { destructionReceiptSchema, publicationReceiptSchema, verificationReceiptSchema, opaqueIdSchema } from "../contracts";
import { parsePrivacy, privacyHash, samePrivacyValue, validatePolicy } from "../policy";
import { validatePrivacyJob } from "../states";
import { adapterResult, commandSchema, datasetSchema, destructionEvidenceSchema, evidenceSchema, enrollmentRefsSchema, exactPublicationSchema, DurablePrivacyError,
  type DestructionPort, type DurableCommand, type EnrollBundle, type GovernedArtifactStore, type PublicationPort, type WorkKind } from "./contracts";
import { PrivacyStore, type DurableJob, type DurableWork } from "./store";
import type { RecoveryRawAuthority } from "./recovery-contracts";

const receiptReply = z.object({ receipt: publicationReceiptSchema, objectRef: opaqueIdSchema }).strict();
const destructionReply = z.object({ receipt: destructionReceiptSchema, evidence: destructionEvidenceSchema, objectRef: opaqueIdSchema }).strict();
const noWork = () => { throw new DurablePrivacyError("ILLEGAL_TRANSITION"); };
export class PrivacyWorkflow {
  constructor(readonly store: PrivacyStore, private readonly artifacts: GovernedArtifactStore,
    private readonly publisher: PublicationPort, private readonly destroyer: DestructionPort,
    private readonly intake: RecoveryRawAuthority) {}
  async enroll(bundle: EnrollBundle, key: string) {
    const { runtime, client } = this.store;
    const job = validatePrivacyJob(bundle.job);
    const dataset = parsePrivacy(datasetSchema, bundle.dataset);
    const receipt = parsePrivacy(verificationReceiptSchema, bundle.receipt);
    parsePrivacy(evidenceSchema, bundle.evidence); parsePrivacy(opaqueIdSchema, key);
    parsePrivacy(enrollmentRefsSchema, { artifactObject: bundle.artifactObject, receiptObject: bundle.receiptObject });
    if (job.processing !== "SANITIZATION_VERIFIED" || job.publication !== "NOT_REQUESTED" || !job.artifact ||
      !job.verifierId || job.rawAccessRevokedAt || job.destruction !== "RAW_PRESENT" ||
      !samePrivacyValue(job.verification, receipt) || privacyHash(dataset) !== job.artifact.contentHash ||
      !samePrivacyValue(dataset.scope, job.scope) || dataset.attemptId !== job.attemptId || dataset.fence !== job.fence ||
      !samePrivacyValue(dataset.pins, job.pins) || job.rawExpiresAt <= runtime.now() ||
      !await adapterResult(() => runtime.authenticateVerification(bundle))) throw new DurablePrivacyError("VERIFICATION_FAILED");
    const policy = validatePolicy(await adapterResult(() => runtime.policy(bundle.policyHash)));
    // Resolve by exact content hash via adapter; never a current/latest policy lookup.
    if (privacyHash(policy) !== bundle.policyHash || !samePrivacyValue(policy.pins, job.pins)) throw new DurablePrivacyError("HASH_MISMATCH");
    const data = {
      id: job.scope.jobId, organizationId: job.scope.organizationId, clientId: job.scope.clientId,
      packageId: job.scope.packageId, attemptId: job.attemptId, ownerId: job.ownerId,
      processorIds: job.processorIds,
      sanitizerId: job.processorIds.find((id) => id !== job.ownerId) ?? noWork(), verifierId: job.verifierId,
      fence: job.fence, revision: 0, processing: job.processing, publication: job.publication, destruction: job.destruction,
      policyHash: privacyHash(policy), pinsHash: privacyHash(job.pins), inventoryHash: job.rawInventoryHash,
      inventoryCount: job.rawInventoryCount, artifactId: job.artifact.id, objectRef: bundle.artifactObject,
      artifactHash: job.artifact.contentHash, verificationHash: privacyHash(receipt),
      rawExpiresAt: new Date(job.rawExpiresAt), revokedAt: null, createdAt: new Date(job.createdAt), updatedAt: new Date(runtime.now()),
    };
    await this.store.authorize(data, receipt.actorId, "VERIFIER");
    await this.intake.bindDurableAuthority(job, receipt.actorId, async (actorId, role) => {
      if (role === "INTAKE") throw new DurablePrivacyError("AUTHORIZATION_DENIED");
      await this.store.rawAllowed(job.scope.jobId, actorId, role);
    });
    const intentHash = privacyHash({ action: "ENROLL", job, artifactObject: bundle.artifactObject,
      receiptObject: bundle.receiptObject, policyHash: bundle.policyHash });
    return adapterResult(() => client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${job.scope.jobId}))`;
      const existing = await tx.privacyDurableJob.findUnique({ where: { id: job.scope.jobId } });
      if (existing) {
        const event = await tx.privacyDurableEvent.findUnique({ where: { jobId_idempotencyKey: { jobId: existing.id, idempotencyKey: key } } });
        if (!event || event.intentHash !== intentHash) throw new DurablePrivacyError("IDEMPOTENCY_CONFLICT");
        return existing;
      }
      const created = await tx.privacyDurableJob.create({ data });
      await tx.privacyDurableReceipt.create({ data: { id: receipt.id, jobId: created.id, kind: "VERIFICATION",
        hash: privacyHash(receipt), objectRef: bundle.receiptObject, actorId: receipt.actorId, at: new Date(receipt.at) } });
      await this.store.event(tx, created, receipt.actorId, "VERIFIER", "ENROLL", "COMPLETED", key, intentHash);
      return created;
    }));
  }
  private async candidate(job: DurableJob, actorId: string) {
    await this.store.authorize(job, actorId, "PUBLISHER");
    if (job.revokedAt || job.rawExpiresAt.toISOString() <= this.store.runtime.now() || job.processing !== "SANITIZATION_VERIFIED") throw new DurablePrivacyError("EXPIRED");
    const raw = await adapterResult(() => this.artifacts.dataset(job.objectRef, job.artifactHash));
    const dataset = parsePrivacy(datasetSchema, raw);
    const policy = validatePolicy(await adapterResult(() => this.store.runtime.policy(job.policyHash)));
    const reference = await this.store.client.privacyDurableReceipt.findUnique({ where: { jobId_kind: { jobId: job.id, kind: "VERIFICATION" } } });
    if (!reference || reference.hash !== job.verificationHash) throw new DurablePrivacyError("VERIFICATION_FAILED");
    const bundle = await adapterResult(() => this.artifacts.verification(reference.objectRef, reference.hash));
    const receipt = parsePrivacy(verificationReceiptSchema, bundle.receipt);
    if (privacyHash(receipt) !== job.verificationHash || receipt.expiresAt <= this.store.runtime.now() ||
      !samePrivacyValue(bundle.dataset, dataset) || bundle.job.scope.jobId !== job.id ||
      bundle.job.ownerId !== job.ownerId || !samePrivacyValue(bundle.job.processorIds, job.processorIds) ||
      !await adapterResult(() => this.store.runtime.authenticateVerification(bundle))) throw new DurablePrivacyError("VERIFICATION_FAILED");
    if (privacyHash(policy) !== job.policyHash || privacyHash(policy.pins) !== job.pinsHash ||
      privacyHash(dataset) !== job.artifactHash || privacyHash(dataset.pins) !== job.pinsHash ||
      dataset.scope.jobId !== job.id || dataset.scope.organizationId !== job.organizationId ||
      dataset.scope.clientId !== job.clientId || dataset.scope.packageId !== job.packageId ||
      dataset.attemptId !== job.attemptId || dataset.fence !== job.fence) throw new DurablePrivacyError("HASH_MISMATCH");
    await this.store.authorize(job, actorId, "PUBLISHER");
    return dataset;
  }
  async authorizePublication(command: DurableCommand) {
    const job = await this.store.read(command.jobId, command.actorId, "PUBLISHER");
    return this.store.run(command, "PUBLISHER", "AUTHORIZE", { artifactHash: job.artifactHash, verificationHash: job.verificationHash },
      async (tx, current, replay) => {
        if (replay) return current;
        await this.candidate(current, command.actorId);
        if (current.publication !== "NOT_REQUESTED") noWork();
        await tx.privacyDurableWork.create({ data: {
          id: this.store.runtime.id(), jobId: current.id, kind: "PUBLICATION", intentHash: privacyHash({
            artifactHash: current.artifactHash, verificationHash: current.verificationHash }),
          idempotencyKey: command.key, attemptId: current.attemptId, fence: current.fence,
          state: "READY", tries: 0, createdAt: new Date(this.store.runtime.now()), updatedAt: new Date(this.store.runtime.now()),
        } });
        return this.store.update(tx, current, { publication: "RELEASE_AUTHORIZED" });
      });
  }
  async claim(command: DurableCommand, kind: WorkKind, workerId: string) {
    parsePrivacy(opaqueIdSchema, workerId);
    return this.store.run(command, kind === "PUBLICATION" ? "PUBLISHER" : "DESTROYER", "CLAIM", { kind, workerId },
      async (tx, job, replay) => {
        const work = await tx.privacyDurableWork.findUnique({ where: { jobId_kind: { jobId: job.id, kind } } });
        if (!work) return noWork();
        if (replay) return { job, work, dispatch: false };
        if (work.state === "COMPLETED") noWork();
        const expiredLease = ["LEASED", "DISPATCHED"].includes(work.state) && !!work.leaseUntil && work.leaseUntil.toISOString() <= this.store.runtime.now();
        if (["LEASED", "DISPATCHED"].includes(work.state) && !expiredLease) throw new DurablePrivacyError("STALE_REVISION");
        const reconciliation = kind === "PUBLICATION" && (expiredLease || work.state === "RECONCILIATION_REQUIRED" || work.state === "FAILED");
        if (kind === "PUBLICATION") await this.candidate(job, command.actorId);
        if (kind === "DESTRUCTION" && !job.revokedAt) noWork();
        let next = job;
        if (kind === "PUBLICATION") {
          next = await this.store.update(tx, next, { publication: reconciliation ? "RECONCILIATION_REQUIRED" : "PUBLISHING" });
        } else {
          if (next.destruction === "DESTRUCTION_FAILED") next = await this.store.update(tx, next, { destruction: "DESTRUCTION_PENDING" });
          if (next.destruction === "DESTRUCTION_PENDING") next = await this.store.update(tx, next, { destruction: "RAW_ACCESS_REVOKED" });
          if (next.destruction !== "RAW_ACCESS_REVOKED" && next.destruction !== "DESTRUCTION_VERIFYING") noWork();
          next = await this.store.update(tx, next, { destruction: "DESTRUCTION_VERIFYING" });
        }
        const leased = await tx.privacyDurableWork.update({ where: { id: work.id }, data: {
          state: "LEASED", leaseOwner: workerId, leaseUntil: new Date(Date.parse(this.store.runtime.now()) + 30_000),
          tries: { increment: 1 }, failure: null, updatedAt: new Date(this.store.runtime.now()),
        } });
        return { job: next, work: leased, dispatch: !reconciliation };
      });
  }
  private liveLease(job: DurableJob, work: DurableWork | null, workerId: string) {
    if (!work || !["LEASED", "DISPATCHED"].includes(work.state) || work.leaseOwner !== workerId || !work.leaseUntil ||
      work.leaseUntil.toISOString() <= this.store.runtime.now() || work.attemptId !== job.attemptId || work.fence !== job.fence) {
      throw new DurablePrivacyError("STALE_ATTEMPT");
    }
    return work;
  }
  async publish(input: DurableCommand, workerId: string, reconcile = false) {
    parsePrivacy(commandSchema, input); parsePrivacy(opaqueIdSchema, workerId);
    let command = input;
    let job = await this.store.read(command.jobId, command.actorId, "PUBLISHER");
    if (await this.store.committed(command, job, "DISPATCH", { workerId, reconcile })) {
      if (job.publication === "SANITIZED_PUBLISHED") return job;
      throw new DurablePrivacyError("PUBLICATION_RECONCILIATION_REQUIRED");
    }
    let work = this.liveLease(job, await this.store.client.privacyDurableWork.findUnique({
      where: { jobId_kind: { jobId: job.id, kind: "PUBLICATION" } } }), workerId);
    if (job.revision !== command.revision || job.fence !== command.fence || job.attemptId !== command.attemptId) throw new DurablePrivacyError("STALE_REVISION");
    if (job.publication === "RECONCILIATION_REQUIRED" && !reconcile) throw new DurablePrivacyError("PUBLICATION_RECONCILIATION_REQUIRED");
    const reserved = await this.store.run(command, "PUBLISHER", "DISPATCH", { workerId, reconcile }, async (tx, current, replay) => {
      if (replay) throw new DurablePrivacyError("PUBLICATION_RECONCILIATION_REQUIRED");
      const leased = this.liveLease(current, await tx.privacyDurableWork.findUnique({ where: { id: work.id } }), workerId);
      if (leased.state === "DISPATCHED") throw new DurablePrivacyError("PUBLICATION_RECONCILIATION_REQUIRED");
      const dispatched = await tx.privacyDurableWork.update({ where: { id: leased.id }, data: { state: "DISPATCHED",
        updatedAt: new Date(this.store.runtime.now()) } });
      return { job: await this.store.update(tx, current, {}), work: dispatched };
    });
    job = reserved.job; work = reserved.work;
    command = { ...input, revision: job.revision, key: this.store.runtime.id() };
    const dataset = await this.candidate(job, command.actorId);
    let raw: unknown;
    try {
      raw = reconcile ? await this.publisher.reconcile({ releaseId: work.id, jobId: job.id, actorId: command.actorId,
        workerId, revision: job.revision, attemptId: job.attemptId, fence: job.fence,
        artifactHash: job.artifactHash, exact: work.itemId ? exactPublicationSchema.parse({
          sourceId: work.sourceId, itemId: work.itemId, versionId: work.versionId, version: work.version, checksum: work.checksum }) : null }) :
        await this.publisher.dispatch({ releaseId: work.id, jobId: job.id, actorId: command.actorId, artifactHash: job.artifactHash,
          workerId, revision: job.revision, attemptId: job.attemptId, fence: job.fence, dataset });
    } catch { raw = null; }
    const parsed = receiptReply.safeParse(raw);
    if (!parsed.success) return this.ambiguous(command, workerId);
    const { receipt, objectRef } = parsed.data;
    const original = await this.store.client.privacyDurableReceipt.findUnique({ where: { jobId_kind: { jobId: job.id, kind: "VERIFICATION" } } });
    if (!original || receipt.verificationReceiptId !== original.id || receipt.releaseId !== work.id ||
      receipt.scope.jobId !== job.id || !samePrivacyValue(receipt.scope, { jobId: job.id, organizationId: job.organizationId, clientId: job.clientId, packageId: job.packageId }) ||
      receipt.attemptId !== job.attemptId || receipt.fence !== job.fence || receipt.artifactId !== job.artifactId ||
      receipt.artifactHash !== job.artifactHash || receipt.actorId !== command.actorId ||
      privacyHash(receipt.pins) !== job.pinsHash || receipt.at < work.updatedAt.toISOString() || receipt.at > this.store.runtime.now() ||
      !await adapterResult(() => this.publisher.authenticate(receipt))) return this.ambiguous(command, workerId);
    const hash = privacyHash(receipt);
    await adapterResult(() => this.artifacts.saveReceipt(objectRef, receipt, hash));
    const result = await this.store.run(command, "PUBLISHER", "PUBLISHED", { hash, workerId },
      async (tx, current, replay) => {
        if (replay) return current;
        this.liveLease(current, await tx.privacyDurableWork.findUnique({ where: { id: work.id } }), workerId);
        if (!await this.publisher.confirm(tx, receipt)) throw new DurablePrivacyError("PUBLICATION_RECONCILIATION_REQUIRED");
        await tx.privacyDurableReceipt.create({ data: { id: receipt.id, jobId: current.id, kind: "PUBLICATION",
          hash, objectRef, actorId: command.actorId, at: new Date(receipt.at) } });
        await tx.privacyDurableWork.update({ where: { id: work.id }, data: {
          state: "COMPLETED", failure: null, sourceId: receipt.sourceId, itemId: receipt.itemId, versionId: receipt.versionId,
          version: receipt.version, checksum: receipt.checksum, evidenceRef: objectRef, evidenceHash: hash,
          leaseOwner: null, leaseUntil: null, updatedAt: new Date(this.store.runtime.now()),
        } });
        return this.store.update(tx, current, { publication: "SANITIZED_PUBLISHED", destruction: "DESTRUCTION_PENDING",
          revokedAt: new Date(receipt.rawAccessRevokedAt) });
      });
    try { await this.destroyer.revoke(job.id, job.attemptId, job.fence); }
    catch { throw new DurablePrivacyError("DESTRUCTION_PENDING"); }
    return result;
  }
  async ambiguous(command: DurableCommand, workerId: string) {
    return this.store.run(command, "PUBLISHER", "RECONCILE", { workerId }, async (tx, job, replay) => {
      if (replay) return job;
      const work = this.liveLease(job, await tx.privacyDurableWork.findUnique({ where: { jobId_kind: { jobId: job.id, kind: "PUBLICATION" } } }), workerId);
      await tx.privacyDurableWork.update({ where: { id: work.id }, data: { state: "RECONCILIATION_REQUIRED",
        leaseOwner: null, leaseUntil: null, failure: "PUBLICATION_RECONCILIATION_REQUIRED", updatedAt: new Date(this.store.runtime.now()) } });
      return this.store.update(tx, job, { publication: "RECONCILIATION_REQUIRED" });
    });
  }
  async revoke(command: DurableCommand) {
    const result = await this.store.run(command, "DESTROYER", "REVOKE", {}, async (tx, job, replay) => {
      if (replay || job.revokedAt) return job;
      return this.store.update(tx, job, { revokedAt: new Date(this.store.runtime.now()), destruction: "DESTRUCTION_PENDING" });
    });
    try { await this.destroyer.revoke(result.id, result.attemptId, result.fence); }
    catch { throw new DurablePrivacyError("DESTRUCTION_PENDING"); }
    return result;
  }
  async destroy(command: DurableCommand, workerId: string) {
    parsePrivacy(commandSchema, command); parsePrivacy(opaqueIdSchema, workerId);
    const job = await this.store.read(command.jobId, command.actorId, "DESTROYER");
    if (job.attemptId !== command.attemptId || job.fence !== command.fence) throw new DurablePrivacyError("STALE_ATTEMPT");
    if (job.destruction === "RAW_DESTROYED") return job;
    const work = this.liveLease(job, await this.store.client.privacyDurableWork.findUnique({
      where: { jobId_kind: { jobId: job.id, kind: "DESTRUCTION" } } }), workerId);
    if (job.revision !== command.revision || job.fence !== command.fence || job.attemptId !== command.attemptId) throw new DurablePrivacyError("STALE_REVISION");
    let raw: unknown;
    try {
      await this.destroyer.revoke(job.id, job.attemptId, job.fence);
      raw = await this.destroyer.destroy({ jobId: job.id, packageId: job.packageId, attemptId: job.attemptId, fence: job.fence,
        inventoryHash: job.inventoryHash, inventoryCount: job.inventoryCount, cleanupAttempt: work.tries });
    } catch { raw = null; }
    const reply = destructionReply.safeParse(raw);
    if (!reply.success || !samePrivacyValue(reply.data.receipt.scope, { jobId: job.id, organizationId: job.organizationId,
      clientId: job.clientId, packageId: job.packageId }) || reply.data.receipt.attemptId !== job.attemptId ||
      reply.data.receipt.fence !== job.fence || reply.data.receipt.inventoryHash !== job.inventoryHash ||
      reply.data.receipt.inventoryCount !== job.inventoryCount || reply.data.receipt.actorId !== command.actorId ||
      privacyHash(reply.data.receipt.pins) !== job.pinsHash || reply.data.receipt.at < work.updatedAt.toISOString() ||
      reply.data.receipt.at > this.store.runtime.now() || reply.data.evidence.jobId !== job.id ||
      reply.data.evidence.packageId !== job.packageId || reply.data.evidence.attemptId !== job.attemptId ||
      reply.data.evidence.fence !== job.fence || reply.data.evidence.inventoryHash !== job.inventoryHash ||
      reply.data.evidence.artifactCount !== job.inventoryCount || reply.data.evidence.cleanupAttempt !== work.tries ||
      reply.data.evidence.receiptHash !== privacyHash(reply.data.receipt) ||
      !await adapterResult(() => this.destroyer.authenticate(reply.data.receipt, reply.data.evidence))) {
      return this.store.run(command, "DESTROYER", "FAILED", { workerId }, async (tx, current, replay) => {
        if (replay) return current;
        this.liveLease(current, await tx.privacyDurableWork.findUnique({ where: { id: work.id } }), workerId);
        await tx.privacyDurableWork.update({ where: { id: work.id }, data: { state: "FAILED", leaseOwner: null, leaseUntil: null,
          failure: "DESTRUCTION_FAILED", updatedAt: new Date(this.store.runtime.now()) } });
        return this.store.update(tx, current, { destruction: "DESTRUCTION_FAILED" });
      });
    }
    const { receipt, evidence, objectRef } = reply.data; const hash = privacyHash({ receipt, evidence });
    await adapterResult(() => this.artifacts.saveReceipt(objectRef, { receipt, evidence }, hash));
    return this.store.run(command, "DESTROYER", "DESTROYED", { hash, workerId }, async (tx, current, replay) => {
      if (replay) return current;
      this.liveLease(current, await tx.privacyDurableWork.findUnique({ where: { id: work.id } }), workerId);
      await tx.privacyDurableReceipt.create({ data: { id: receipt.id, jobId: current.id, kind: "DESTRUCTION",
        hash, objectRef, actorId: command.actorId, at: new Date(receipt.at) } });
      await tx.privacyDurableWork.update({ where: { id: work.id }, data: { state: "COMPLETED", failure: null, evidenceRef: objectRef,
        evidenceHash: hash, leaseOwner: null, leaseUntil: null, updatedAt: new Date(this.store.runtime.now()) } });
      return this.store.update(tx, current, { destruction: "RAW_DESTROYED" });
    });
  }
}
