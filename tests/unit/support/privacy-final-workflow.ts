import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrivacyWorkflow } from "@/services/privacy-gateway/durable/workflow";
import type { DestructionPort, DurableCommand, PublicationPort } from "@/services/privacy-gateway/durable/contracts";
import type { PublicationReceipt } from "@/services/privacy-gateway/contracts";
import { publicationReceiptSchema } from "@/services/privacy-gateway/contracts";
import { privacyHash, samePrivacyValue } from "@/services/privacy-gateway/policy";
import type { restartFixture, RestartConfig } from "./privacy-recovery-process";

export async function finalWorkflow(r: Awaited<ReturnType<typeof restartFixture>>, root: string, config: RestartConfig) {
  const resultPath = join(root, "publication.test-result.json");
  const exact = { sourceId: "50000000-0000-4000-8000-000000000001",
    itemId: "50000000-0000-4000-8000-000000000002", versionId: "50000000-0000-4000-8000-000000000003",
    version: 1, checksum: "a".repeat(64) };
  const readResult = async () => publicationReceiptSchema.parse(JSON.parse(await readFile(resultPath, "utf8")));
  const acknowledged = async () => ({ ...await readResult(), at: r.runtime.now(), rawAccessRevokedAt: r.runtime.now() });
  const publisher: PublicationPort = {
    qualification: "TEST_ONLY",
    async dispatch(intent) {
      const bundle = await r.recovery.bundle(config.jobId, r.f.actor(12).id);
      const receipt: PublicationReceipt = { ...r.f.publication, id: randomUUID(), scope: r.scope,
        actorId: intent.actorId, attemptId: config.attemptId, fence: 1, pins: bundle.receipt.pins,
        artifactId: bundle.receipt.artifactId, artifactHash: intent.artifactHash,
        verificationReceiptId: bundle.receipt.id, releaseId: intent.releaseId, ...exact,
        at: r.runtime.now(), rawAccessRevokedAt: r.runtime.now() };
      await writeFile(resultPath, JSON.stringify(receipt), { flag: "wx" });
      await r.runtime.checkpoint("PUBLISH_RESPONSE_LOST");
      return { receipt, objectRef: receipt.id };
    },
    async reconcile(intent) {
      const receipt = await readResult();
      if (receipt.releaseId !== intent.releaseId || receipt.scope.jobId !== intent.jobId ||
        receipt.attemptId !== intent.attemptId || receipt.fence !== intent.fence ||
        receipt.artifactHash !== intent.artifactHash) throw new Error("TEST_PUBLICATION_MISMATCH");
      return { receipt: await acknowledged(), objectRef: receipt.id };
    },
    async authenticate(receipt) { return samePrivacyValue(receipt, await acknowledged()); },
    async confirm(_tx, receipt) { return samePrivacyValue(receipt, await acknowledged()); },
  };
  const destroyer: DestructionPort = {
    qualification: "TEST_ONLY",
    async revoke() {
      const j = await r.client.privacyAdmission.findUniqueOrThrow({ where: { id: config.jobId } });
      await r.recovery.revokePublished(r.cmd(j, "DESTROYER"));
    },
    async destroy() {
      const j = await r.client.privacyAdmission.findUniqueOrThrow({ where: { id: config.jobId } });
      const cleaned = await r.recovery.cleanup(r.cmd(j, "DESTROYER"));
      if (cleaned.cleanup !== "REFERENCE_CLEANED") throw new Error("TEST_CLEANUP_INCOMPLETE");
      await r.runtime.checkpoint("DESTRUCTION_RESPONSE_LOST");
      return { state: "DESTRUCTION_PENDING" };
    },
    async authenticate() { return false; },
  };
  const workflow = new PrivacyWorkflow(r.store, r.recovery.artifactStore(), publisher, destroyer, r.recovery);
  const action = config.action;
  if (action === "publication-enroll") {
    const bundle = await r.recovery.bundle(config.jobId, r.f.actor(12).id);
    return workflow.enroll(bundle, config.key);
  }
  const job = await r.client.privacyDurableJob.findUniqueOrThrow({ where: { id: config.jobId } });
  const command: DurableCommand = { jobId: job.id, attemptId: job.attemptId, fence: job.fence, revision: job.revision,
    actorId: r.f.actor(action?.startsWith("destruction-") ? 14 : 13).id, key: randomUUID() };
  if (action === "publication-authorize") return workflow.authorizePublication(command);
  if (action === "publication-claim" || action === "destruction-claim") {
    return workflow.claim(command, action === "publication-claim" ? "PUBLICATION" : "DESTRUCTION", config.workerId);
  }
  if (action === "publication-dispatch" || action === "publication-reconcile") {
    return workflow.publish(command, config.workerId, action === "publication-reconcile");
  }
  if (action === "destruction-run") return workflow.destroy(command, config.workerId);
  throw new Error(`TEST_ACTION_REJECTED_${privacyHash(action)}`);
}
