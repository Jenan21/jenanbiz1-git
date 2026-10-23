import type { DataCenterActor } from "@/services/data-center/contracts";
import { createDataCenterItemInTransaction, getAccessibleItem, lockDataCenterItem } from "@/services/data-center/service";
import type { DbExecutor } from "@/lib/db";
import type { PublicationReceipt } from "../contracts";
import { parsePrivacy, privacyHash, samePrivacyValue } from "../policy";
import type { ReceiptSigner } from "../sanitization/contracts";
import { datasetSchema, DurablePrivacyError, exactPublicationSchema, type GovernedArtifactStore, type PublicationPort } from "./contracts";
import { PrivacyStore, type DurableJob, type DurableWork } from "./store";

type Binding = { sourceId: string; typeKey: string; principalId: string };
export interface DataCenterBinding {
  resolve(job: { jobId: string; organizationId: string; clientId: string; packageId: string }, actorId: string): Promise<Binding>;
}
const payload = (receipt: Omit<PublicationReceipt, "signature">) => new TextEncoder().encode(privacyHash(receipt));

/** Uses the existing DRAFT/review/approval/publication lifecycle; it cannot approve a proposal. */
export class GovernedDataCenterPublication implements PublicationPort {
  readonly qualification = "GOVERNED_DATA_CENTER" as const;
  constructor(private readonly store: PrivacyStore, private readonly artifacts: GovernedArtifactStore,
    private readonly bindings: DataCenterBinding, private readonly signer: ReceiptSigner) {}
  private async context(tx: DbExecutor, job: DurableJob, actorId: string) {
    await this.store.authorize(job, actorId, "PUBLISHER");
    const binding = await this.bindings.resolve({ jobId: job.id, organizationId: job.organizationId,
      clientId: job.clientId, packageId: job.packageId }, actorId);
    const user = await tx.user.findUnique({ where: { id: binding.principalId }, select: { id: true, status: true, systemRole: true } });
    if (!user || user.status !== "ACTIVE") throw new DurablePrivacyError("AUTHORIZATION_DENIED");
    const actor: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: user.systemRole };
    const source = await tx.dataCenterSource.findUnique({ where: { id: binding.sourceId } });
    if (!source || source.scope !== "ORGANIZATION" || source.organizationId !== job.organizationId ||
      source.allowExport || source.kind === "GENERATED" || source.licenseClass !== "RESTRICTED") {
      throw new DurablePrivacyError("AUTHORIZATION_DENIED");
    }
    return { binding, actor };
  }
  async dispatch(intent: Parameters<PublicationPort["dispatch"]>[0]) {
    const dataset = parsePrivacy(datasetSchema, intent.dataset);
    if (privacyHash(dataset) !== intent.artifactHash) throw new DurablePrivacyError("HASH_MISMATCH");
    await this.store.client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "PrivacyDurableJob" WHERE "id"=${intent.jobId}::uuid FOR UPDATE`;
      const job = await tx.privacyDurableJob.findUniqueOrThrow({ where: { id: intent.jobId } });
      const work = await tx.privacyDurableWork.findUniqueOrThrow({ where: { id: intent.releaseId } });
      if (work.jobId !== job.id || work.kind !== "PUBLICATION" || work.state !== "DISPATCHED" ||
        job.revision !== intent.revision || job.attemptId !== intent.attemptId || job.fence !== intent.fence || work.leaseOwner !== intent.workerId ||
        work.itemId || work.attemptId !== job.attemptId || work.fence !== job.fence || job.revokedAt ||
        job.artifactHash !== intent.artifactHash || job.rawExpiresAt.toISOString() <= this.store.runtime.now() ||
        !work.leaseUntil || work.leaseUntil.toISOString() <= this.store.runtime.now() ||
        !samePrivacyValue(dataset.scope, { jobId: job.id, organizationId: job.organizationId, clientId: job.clientId, packageId: job.packageId }) ||
        privacyHash(dataset.pins) !== job.pinsHash || dataset.attemptId !== job.attemptId || dataset.fence !== job.fence) {
        throw new DurablePrivacyError("STALE_ATTEMPT");
      }
      const { binding, actor } = await this.context(tx, job, intent.actorId);
      const type = await tx.dataCenterType.findUnique({ where: { key: binding.typeKey } });
      if (!type || type.layer !== "DATA" || !type.requiresIndependentReview) throw new DurablePrivacyError("AUTHORIZATION_DENIED");
      const item = await createDataCenterItemInTransaction(tx, { sourceId: binding.sourceId, typeKey: binding.typeKey,
        layer: "DATA", title: "Privacy Gateway sanitized structured dataset", content: JSON.stringify(dataset),
        evidenceStatus: "UNVERIFIED", origin: "IMPORT",
        provenance: [{ kind: "DOCUMENT", label: "Independent privacy verification; not business verification",
          reference: `privacy:${job.id}:${job.verificationHash}` }],
      }, actor);
      await tx.privacyDurableWork.update({ where: { id: work.id }, data: { sourceId: item.sourceId, itemId: item.id,
        versionId: item.version.id, version: item.version.number, checksum: item.version.checksum,
        updatedAt: new Date(this.store.runtime.now()) } });
      await this.store.authorize(job, intent.actorId, "PUBLISHER");
    });
    return { state: "AWAITING_DATA_CENTER_REVIEW", releaseId: intent.releaseId };
  }
  private exact(work: DurableWork) {
    return exactPublicationSchema.parse({ sourceId: work.sourceId, itemId: work.itemId, versionId: work.versionId,
      version: work.version, checksum: work.checksum });
  }
  private async published(tx: DbExecutor, job: DurableJob, work: DurableWork, actorId: string) {
    const exact = this.exact(work);
    const { binding, actor } = await this.context(tx, job, actorId);
    if (binding.sourceId !== exact.sourceId) throw new DurablePrivacyError("LINEAGE_MISMATCH");
    await lockDataCenterItem(tx, exact.itemId);
    const item = await getAccessibleItem(tx, actor, exact.itemId, true);
    const version = await tx.dataCenterVersion.findUnique({ where: { id: exact.versionId } });
    if (!version || version.itemId !== item.id || item.sourceId !== exact.sourceId || version.number !== exact.version ||
      version.checksum !== exact.checksum || item.currentVersion !== exact.version || item.publishedVersion !== exact.version ||
      item.status !== "PUBLISHED" || privacyHash(parsePrivacy(datasetSchema, JSON.parse(version.content))) !== job.artifactHash ||
      version.evidenceStatus === "CONFLICTED" || version.expiresAt && version.expiresAt.toISOString() <= this.store.runtime.now() ||
      version.effectiveTo && version.effectiveTo.toISOString() <= this.store.runtime.now()) {
      throw new DurablePrivacyError("PUBLICATION_RECONCILIATION_REQUIRED");
    }
    return exact;
  }
  async reconcile(intent: Parameters<PublicationPort["reconcile"]>[0]) {
    return this.store.client.$transaction(async (tx) => {
      const job = await tx.privacyDurableJob.findUniqueOrThrow({ where: { id: intent.jobId } });
      const work = await tx.privacyDurableWork.findUniqueOrThrow({ where: { id: intent.releaseId } });
      if (work.jobId !== job.id || work.kind !== "PUBLICATION" || work.state !== "DISPATCHED" ||
        job.revision !== intent.revision || job.attemptId !== intent.attemptId || job.fence !== intent.fence || work.leaseOwner !== intent.workerId ||
        !work.leaseUntil || work.leaseUntil.toISOString() <= this.store.runtime.now() ||
        job.artifactHash !== intent.artifactHash || !intent.exact || !samePrivacyValue(intent.exact, this.exact(work))) {
        throw new DurablePrivacyError("PUBLICATION_RECONCILIATION_REQUIRED");
      }
      const exact = await this.published(tx, job, work, intent.actorId);
      const reference = await tx.privacyDurableReceipt.findUniqueOrThrow({ where: { jobId_kind: { jobId: job.id, kind: "VERIFICATION" } } });
      const bundle = await this.artifacts.verification(reference.objectRef, reference.hash);
      if (reference.hash !== job.verificationHash || privacyHash(bundle.receipt) !== reference.hash ||
        !await this.store.runtime.authenticateVerification(bundle)) throw new DurablePrivacyError("VERIFICATION_FAILED");
      const unsigned: Omit<PublicationReceipt, "signature"> = {
        contract: "jenan.privacy-gateway.publication/v1", id: this.store.runtime.id(),
        scope: bundle.receipt.scope, attemptId: job.attemptId, fence: job.fence, pins: bundle.receipt.pins,
        at: this.store.runtime.now(), actorId: intent.actorId, auditId: this.store.runtime.id(),
        artifactId: job.artifactId, artifactHash: job.artifactHash, verificationReceiptId: reference.id,
        releaseId: work.id, ...exact, allPartsAcknowledged: true, rawAccessRevokedAt: this.store.runtime.now(),
        result: "SANITIZED_PUBLISHED",
      };
      unsigned.rawAccessRevokedAt = unsigned.at;
      return { receipt: { ...unsigned, signature: await this.signer.sign(payload(unsigned)) }, objectRef: this.store.runtime.id() };
    });
  }
  async authenticate(receipt: PublicationReceipt) {
    const { signature, ...unsigned } = receipt;
    return this.signer.verify(payload(unsigned), signature);
  }
  async confirm(tx: DbExecutor, receipt: PublicationReceipt) {
    const job = await tx.privacyDurableJob.findUniqueOrThrow({ where: { id: receipt.scope.jobId } });
    const work = await tx.privacyDurableWork.findUniqueOrThrow({ where: { id: receipt.releaseId } });
    if (work.jobId !== job.id || work.state !== "DISPATCHED") return false;
    const exact = await this.published(tx, job, work, receipt.actorId);
    return samePrivacyValue(exact, { sourceId: receipt.sourceId, itemId: receipt.itemId,
      versionId: receipt.versionId, version: receipt.version, checksum: receipt.checksum });
  }
}
