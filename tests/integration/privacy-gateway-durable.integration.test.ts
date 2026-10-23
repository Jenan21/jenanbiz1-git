import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { PrivacyStore } from "@/services/privacy-gateway/durable/store";
import { PrivacyWorkflow } from "@/services/privacy-gateway/durable/workflow";
import { GovernedDataCenterPublication } from "@/services/privacy-gateway/durable/data-center";
import { db } from "@/lib/db";
import { createDataCenterSource, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { authenticateM3 } from "@/services/privacy-gateway/durable/verification";
import { privacyHash, samePrivacyValue } from "@/services/privacy-gateway/policy";
import type { PrivacyJob, PrivacyRole } from "@/services/privacy-gateway/contracts";
import type { DurableCommand, DurableRuntime, EnrollBundle, GovernedArtifactStore,
  PublicationPort, DestructionPort } from "@/services/privacy-gateway/durable/contracts";
import { sanitizationFixture } from "../unit/support/privacy-sanitization-fixtures";
import { privacyFixture, privacyId } from "../unit/support/privacy-gateway-fixtures";
import { assertPrivacyAcceptanceDatabase } from "../unit/support/privacy-isolated-database";

const testUrl = assertPrivacyAcceptanceDatabase(process.env.PRIVACY_M4_DATABASE_URL);
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }), omit: { user: { passwordHash: true } } });
afterAll(async () => { await client.$disconnect(); await db.$disconnect(); });
async function fixture() {
  const f = sanitizationFixture();
  f.job.scope = { jobId: randomUUID(), packageId: randomUUID(), organizationId: randomUUID(), clientId: randomUUID() };
  for (const grants of f.roles.values()) for (const grant of grants) grant.scope = structuredClone(f.job.scope);
  f.runtime.id = randomUUID;
  await f.receive();
  expect((await f.service.sanitize(f.job, f.sanitizer.id)).result).toBe("CANDIDATE");
  expect((await f.service.verify(f.job, f.verifier.id)).result).toBe("VERIFIED");
  const checkpoint = await f.service.durableCheckpoint(f.job, f.verifier.id);
  const bundle: EnrollBundle = { ...checkpoint, artifactObject: randomUUID(), receiptObject: randomUUID() };
  const owner = privacyFixture(); const publisherId = privacyId(13); const destroyerId = privacyId(14); const auditorId = privacyId(15);
  for (const [id, role] of [[publisherId, "PUBLISHER"], [destroyerId, "DESTROYER"], [auditorId, "AUDITOR"]] as const) {
    f.roles.set(id, owner.grants(owner.actor(Number(id.slice(-12))), role).map((g) => ({ ...g, scope: f.job.scope })));
  }
  const denied = new Set<string>();
  const runtime: DurableRuntime = {
    now: f.runtime.now, id: randomUUID,
    async authorization(_jobId, actorId) { return { actor: { ...f.actor, id: actorId, active: !denied.has(actorId) }, grants: f.roles.get(actorId) ?? [] }; },
    async policy(hash) { if (hash !== privacyHash(f.policy)) throw new Error("synthetic policy absent"); return structuredClone(f.policy); },
    async authenticateVerification(candidate) { return samePrivacyValue(candidate.job, bundle.job) && authenticateM3(candidate, f.signer); },
  };
  const saved = new Map<string, unknown>();
  const artifacts: GovernedArtifactStore = {
    qualification: "TEST_ONLY",
    async dataset(ref, hash) {
      if (ref !== bundle.artifactObject || hash !== privacyHash(bundle.dataset)) throw new Error("synthetic absent");
      return structuredClone(bundle.dataset);
    },
    async verification(ref, hash) {
      if (ref !== bundle.receiptObject || hash !== privacyHash(bundle.receipt)) throw new Error("synthetic absent");
      return structuredClone(bundle);
    },
    async saveReceipt(ref, value, hash) { expect(privacyHash(value)).toBe(hash); saved.set(ref, structuredClone(value)); },
  };
  let dispatches = 0; let reconciliations = 0; let revocations = 0; let destructions = 0;
  let publishFailure = false; let cleanupFailure = true;
  const exact = { sourceId: randomUUID(), itemId: randomUUID(), versionId: randomUUID(), version: 1, checksum: "4".repeat(64) };
  const pubReceipt = (releaseId: string) => ({ ...owner.publication, id: randomUUID(), scope: f.job.scope,
    actorId: publisherId, attemptId: f.job.attemptId, fence: f.job.fence, pins: f.policy.pins,
    artifactId: bundle.receipt.artifactId, artifactHash: bundle.receipt.artifactHash, verificationReceiptId: bundle.receipt.id,
    releaseId, ...exact, at: runtime.now(), rawAccessRevokedAt: runtime.now() });
  const publisher: PublicationPort = {
    qualification: "TEST_ONLY",
    async dispatch(intent) { dispatches++; if (publishFailure) throw new Error("synthetic adapter timeout"); return { receipt: pubReceipt(intent.releaseId), objectRef: randomUUID() }; },
    async reconcile(intent) { reconciliations++; return { receipt: pubReceipt(intent.releaseId), objectRef: randomUUID() }; },
    async authenticate() { return true; }, async confirm() { return true; },
  };
  const destroyer: DestructionPort = {
    qualification: "TEST_ONLY",
    async revoke() { revocations++; },
    async destroy(intent) {
      destructions++; if (cleanupFailure) throw new Error("synthetic storage failure");
      const receipt = { ...owner.destruction, id: randomUUID(), scope: f.job.scope, attemptId: f.job.attemptId,
        fence: f.job.fence, pins: f.policy.pins, actorId: destroyerId, at: runtime.now(),
        inventoryHash: bundle.job.rawInventoryHash, inventoryCount: bundle.job.rawInventoryCount,
        checkedCount: bundle.job.rawInventoryCount };
      return { receipt, evidence: { contract: "jenan.privacy.destruction-evidence/v1",
        jobId: f.job.scope.jobId, packageId: f.job.scope.packageId, attemptId: f.job.attemptId, fence: f.job.fence,
        inventoryHash: bundle.job.rawInventoryHash, artifactCount: bundle.job.rawInventoryCount,
        cleanupAttempt: intent.cleanupAttempt, receiptHash: privacyHash(receipt), keyRefs: [randomUUID()], evidenceRefs: [randomUUID()],
        categories: ["ORIGINAL", "EXTRACTED", "TEMPORARY", "OCR", "CACHE", "QUARANTINE", "TOKEN_MAPPING",
          "TEMPORARY_KEY", "MULTIPART", "STAGING", "SANITIZED_WORKING_COPY"], result: "M1_EVIDENCE_COMPLETE" },
        objectRef: randomUUID() };
    },
    async authenticate() { return true; },
  };
  const store = new PrivacyStore(client, runtime);
  const workflow = new PrivacyWorkflow(store, artifacts, publisher, destroyer, f.intake);
  const enrollmentKey = randomUUID();
  const job = await workflow.enroll(bundle, enrollmentKey);
  const command = (current = job, role: PrivacyRole = "PUBLISHER"): DurableCommand => ({
    jobId: current.id, actorId: role === "DESTROYER" ? destroyerId : publisherId,
    attemptId: current.attemptId, fence: current.fence, revision: current.revision, key: randomUUID(),
  });
  const ready = async () => {
    const authorized = await workflow.authorizePublication(command());
    const worker = randomUUID(); const claimed = await workflow.claim(command(authorized), "PUBLICATION", worker);
    return { ...claimed, worker };
  };
  return { f, bundle, job, client, store, workflow, runtime, artifacts, publisher, destroyer, command, ready,
    publisherId, destroyerId, auditorId, enrollmentKey, denied, exact, saved,
    counts: () => ({ dispatches, reconciliations, revocations, destructions }),
    failPublication: () => { publishFailure = true; }, allowCleanup: () => { cleanupFailure = false; },
    restart: () => new PrivacyWorkflow(new PrivacyStore(client, runtime), artifacts, publisher, destroyer, f.intake),
  };
}

async function governed(f: Awaited<ReturnType<typeof fixture>>) {
  const user = await client.user.create({ data: { email: `${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
  const reviewer = await client.user.create({ data: { email: `${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
  const actor: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "ADMIN" };
  const independent: DataCenterActor = { id: reviewer.id, kind: "HUMAN", systemRole: "ADMIN" };
  await client.organization.create({ data: { id: f.job.organizationId, name: "Synthetic Privacy M4 organization", slug: randomUUID() } });
  const source = await createDataCenterSource({ name: "Synthetic Privacy M4 source", kind: "FILE", scope: "ORGANIZATION",
    organizationId: f.job.organizationId, owner: "Synthetic owner", license: "Internal synthetic fixtures",
    licenseClass: "RESTRICTED", allowExport: false }, actor);
  const typeKey = `privacy-m4-${randomUUID()}`;
  await registerDataCenterType({ key: typeKey, label: "Synthetic privacy dataset", layer: "DATA", requiresIndependentReview: true }, actor);
  const bindings = { async resolve() { return { sourceId: source.id, typeKey, principalId: user.id }; } };
  const port = new GovernedDataCenterPublication(f.store, f.artifacts, bindings, f.f.signer);
  const workflow = new PrivacyWorkflow(f.store, f.artifacts, port, f.destroyer, f.f.intake);
  const approve = async (itemId: string) => {
    await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Synthetic M4 review" }, actor);
    await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Synthetic M4 independent business review" }, independent);
    await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Synthetic M4 reviewed" }, independent);
    await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Synthetic M4 governed publication" }, independent);
  };
  return { workflow, port, bindings, actor, independent, approve, source };
}

describe("Privacy M4 isolated PostgreSQL durable lifecycle", () => {
  it("M5 bounds six-job publication/destruction races across independent scopes and reports synthetic load", async () => {
    const started = performance.now();
    const rssBefore = process.memoryUsage().rss;
    const latencies: number[] = [];
    let expectedRaceRejections = 0;
    const jobs: string[] = [];
    const organizations = new Set<string>();
    const clients = new Set<string>();
    let maxEnvelopeBytes = 0;
    for (let batch = 0; batch < 2; batch++) {
      await Promise.all(Array.from({ length: 3 }, async () => {
        const begin = performance.now();
        const f = await fixture();
        jobs.push(f.job.id); organizations.add(f.job.organizationId); clients.add(f.job.clientId);
        maxEnvelopeBytes = Math.max(maxEnvelopeBytes, Buffer.byteLength(JSON.stringify(f.job)));
        const authorize = f.command();
        const authorized = await Promise.all([f.workflow.authorizePublication(authorize), f.workflow.authorizePublication(authorize)]);
        expect(authorized[0]).toEqual(authorized[1]);
        const worker = randomUUID();
        const lease = await f.workflow.claim(f.command(authorized[0]), "PUBLICATION", worker);
        const command = f.command(lease.job);
        const race = await Promise.allSettled([f.workflow.publish(command, worker), f.workflow.publish(command, worker)]);
        expect(race.some((result) => result.status === "fulfilled")).toBe(true);
        expectedRaceRejections += race.filter((result) => result.status === "rejected").length;
        expect(f.counts().dispatches).toBe(1);
        const published = await f.store.read(f.job.id, f.destroyerId, "DESTROYER");
        expect(published.publication).toBe("SANITIZED_PUBLISHED");
        f.allowCleanup();
        const destroyWorker = randomUUID();
        const destruction = await f.workflow.claim(f.command(published, "DESTROYER"), "DESTRUCTION", destroyWorker);
        const destroyCommand = f.command(destruction.job, "DESTROYER");
        const cleanup = await Promise.allSettled([
          f.workflow.destroy(destroyCommand, destroyWorker), f.workflow.destroy(destroyCommand, destroyWorker),
        ]);
        expect(cleanup.some((result) => result.status === "fulfilled")).toBe(true);
        expectedRaceRejections += cleanup.filter((result) => result.status === "rejected").length;
        expect(await client.privacyDurableReceipt.count({ where: { jobId: f.job.id, kind: "PUBLICATION" } })).toBe(1);
        expect(await client.privacyDurableReceipt.count({ where: { jobId: f.job.id, kind: "DESTRUCTION" } })).toBe(1);
        expect((await f.store.read(f.job.id, f.auditorId, "AUDITOR")).destruction).toBe("RAW_DESTROYED");
        latencies.push(performance.now() - begin);
      }));
    }
    expect(new Set(jobs).size).toBe(6); expect(organizations.size).toBe(6); expect(clients.size).toBe(6);
    expect(maxEnvelopeBytes).toBeLessThan(64 * 1024);
    latencies.sort((a, b) => a - b);
    console.log("PRIVACY_M5_SYNTHETIC_PUBLICATION_LOAD", JSON.stringify({
      qualification: "TEST_ONLY_NOT_PRODUCTION_SLA", jobs: 6, concurrency: 3,
      organizations: organizations.size, clients: clients.size,
      batchMs: performance.now() - started, p50Ms: latencies[2], p95Ms: latencies[5],
      rssBefore, rssAfter: process.memoryUsage().rss, processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
      maxEnvelopeBytes, expectedRaceRejections, unexpectedFailures: 0,
      destructionEvidence: "SYNTHETIC_COMPLETE_M1_FIXTURE_ONLY",
    }));
  }, 120_000);
  it("enrolls a real M2/M3 signed synthetic result with metadata only and survives coordinator recreation", async () => {
    const f = await fixture();
    expect(await f.restart().store.read(f.job.id, f.publisherId, "PUBLISHER")).toEqual(f.job);
    const json = JSON.stringify(f.job);
    for (const secret of ["Synthetic Person", "synth@example.test", "-100.2300", "tok_"]) expect(json).not.toContain(secret);
    expect((await f.store.audit(f.job.id, f.auditorId))).toHaveLength(1);
    expect(await f.workflow.enroll(f.bundle, f.enrollmentKey)).toEqual(f.job);
  });
  it("atomically persists publication receipt, exact DC references, RAW denial and destruction intent", async () => {
    const f = await fixture(); const lease = await f.ready();
    const published = await f.workflow.publish(f.command(lease.job), lease.worker);
    expect(published.publication).toBe("SANITIZED_PUBLISHED"); expect(published.revokedAt).not.toBeNull();
    expect(published.destruction).toBe("DESTRUCTION_PENDING");
    const work = await client.privacyDurableWork.findUniqueOrThrow({ where: { jobId_kind: { jobId: f.job.id, kind: "PUBLICATION" } } });
    expect(work).toMatchObject({ ...f.exact, state: "COMPLETED" });
    expect(await client.privacyDurableReceipt.count({ where: { jobId: f.job.id } })).toBe(2);
    expect(await client.privacyDurableWork.count({ where: { jobId: f.job.id, kind: "DESTRUCTION" } })).toBe(1);
    await expect(f.store.rawAllowed(f.job.id, f.f.sanitizer.id, "SANITIZER")).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(f.store.rawAllowed(f.job.id, f.f.verifier.id, "VERIFIER")).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(f.f.intake.withReadyRaw(f.f.job, f.f.sanitizer.id, "SANITIZER", async () => true)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(f.f.intake.withReadyRaw(f.f.job, f.f.verifier.id, "VERIFIER", async () => true)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect((await f.store.audit(f.job.id, f.auditorId))).toHaveLength(5);
  });
  it("serializes concurrent authorize requests and deduplicates identical committed intent", async () => {
    const f = await fixture(); const command = f.command();
    const result = await Promise.all([f.workflow.authorizePublication(command), f.workflow.authorizePublication(command)]);
    expect(result[0]).toEqual(result[1]);
    expect(await client.privacyDurableWork.count({ where: { jobId: f.job.id } })).toBe(1);
    expect((await f.store.audit(f.job.id, f.auditorId))).toHaveLength(2);
  });
  it("rejects stale revision, attempt and fence", async () => {
    const f = await fixture();
    for (const changes of [{ revision: 100 }, { attemptId: randomUUID() }, { fence: 100 }]) {
      await expect(f.workflow.authorizePublication({ ...f.command(), ...changes })).rejects.toBeInstanceOf(Error);
    }
    expect(await client.privacyDurableWork.count({ where: { jobId: f.job.id } })).toBe(0);
  });
  it.each(["owner", "sanitizer", "verifier"] as const)("prevents %s from publishing even after role change", async (kind) => {
    const f = await fixture(); const actorId = kind === "owner" ? f.job.ownerId : kind === "sanitizer" ? f.job.sanitizerId : f.job.verifierId;
    f.f.roles.set(actorId, f.f.roles.get(f.publisherId)!.map((g) => ({ ...g, actorId })));
    await expect(f.workflow.authorizePublication({ ...f.command(), actorId })).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
  it("rechecks current authorization and does not dispatch after revocation", async () => {
    const f = await fixture(); const lease = await f.ready(); f.denied.add(f.publisherId);
    await expect(f.workflow.publish(f.command(lease.job), lease.worker)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(f.counts().dispatches).toBe(0);
  });
  it("routes timeout to exact reconciliation without repeating dispatch", async () => {
    const f = await fixture(); const lease = await f.ready(); f.failPublication();
    const uncertain = await f.workflow.publish(f.command(lease.job), lease.worker);
    expect(uncertain.publication).toBe("RECONCILIATION_REQUIRED"); expect(uncertain.revokedAt).toBeNull();
    const worker = randomUUID(); const recovered = await f.restart().claim(f.command(uncertain), "PUBLICATION", worker);
    expect(recovered.dispatch).toBe(false);
    const published = await f.restart().publish(f.command(recovered.job), worker, true);
    expect(published.publication).toBe("SANITIZED_PUBLISHED");
    expect(f.counts()).toMatchObject({ dispatches: 1, reconciliations: 1 });
  });
  it("fences concurrent dispatch and never creates a second external publication", async () => {
    const f = await fixture(); const lease = await f.ready();
    const command = f.command(lease.job);
    const result = await Promise.allSettled([f.workflow.publish(command, lease.worker), f.workflow.publish(command, lease.worker)]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(f.counts().dispatches).toBe(1);
  });
  it("returns the same committed result after the final success response was lost", async () => {
    const f = await fixture(); const lease = await f.ready(); const command = f.command(lease.job);
    const completed = await f.workflow.publish(command, lease.worker);
    expect(await f.restart().publish(command, lease.worker)).toEqual(completed);
    expect(f.counts().dispatches).toBe(1);
    expect(await client.privacyDurableReceipt.count({ where: { jobId: f.job.id, kind: "PUBLICATION" } })).toBe(1);
    await expect(f.restart().publish({ ...command, fence: command.fence + 1 }, lease.worker)).rejects.toMatchObject({ code: "STALE_ATTEMPT" });
  });
  it("takes over an expired lease after restart through reconciliation only and denies late workers", async () => {
    const f = await fixture(); const lease = await f.ready();
    f.f.setNow("2026-10-23T04:01:00.000Z");
    const worker = randomUUID(); const recovered = await f.restart().claim(f.command(lease.job), "PUBLICATION", worker);
    expect(recovered.dispatch).toBe(false);
    await expect(f.workflow.publish(f.command(recovered.job), lease.worker)).rejects.toMatchObject({ code: "STALE_ATTEMPT" });
    expect(f.counts().dispatches).toBe(0);
  });
  it("keeps failed destruction explicit and recovers with complete M1 evidence only", async () => {
    const f = await fixture(); const revoked = await f.workflow.revoke(f.command(f.job, "DESTROYER"));
    const worker = randomUUID(); const lease = await f.workflow.claim(f.command(revoked, "DESTROYER"), "DESTRUCTION", worker);
    const failed = await f.workflow.destroy(f.command(lease.job, "DESTROYER"), worker);
    expect(failed.destruction).toBe("DESTRUCTION_FAILED");
    expect(await client.privacyDurableReceipt.count({ where: { jobId: f.job.id, kind: "DESTRUCTION" } })).toBe(0);
    f.allowCleanup();
    const retry = await f.restart().claim(f.command(failed, "DESTROYER"), "DESTRUCTION", worker);
    const destroyed = await f.restart().destroy(f.command(retry.job, "DESTROYER"), worker);
    expect(destroyed.destruction).toBe("RAW_DESTROYED");
    expect(f.counts().destructions).toBe(2);
    expect((await f.store.audit(f.job.id, f.auditorId)).length).toBeGreaterThan(4);
  });
  it("cannot certify destruction from incomplete evidence", async () => {
    const f = await fixture(); f.allowCleanup(); const original = f.destroyer.destroy;
    f.destroyer.destroy = async (intent) => {
      const result = await original(intent);
      return { receipt: { ...privacyFixture().destruction, tokenMappingsAbsent: false }, objectRef: randomUUID(), original: result };
    };
    const revoked = await f.workflow.revoke(f.command(f.job, "DESTROYER"));
    const worker = randomUUID(); const lease = await f.workflow.claim(f.command(revoked, "DESTROYER"), "DESTRUCTION", worker);
    expect((await f.workflow.destroy(f.command(lease.job, "DESTROYER"), worker)).destruction).toBe("DESTRUCTION_FAILED");
  });
  it("authoritative RAW gate rejects stale pre-revocation snapshots after recreation", async () => {
    const f = await fixture();
    const authorization = f.store.rawAuthorization(f.f.runtime.currentAuthorization);
    await authorization(f.f.job, f.f.sanitizer.id);
    await f.workflow.revoke(f.command(f.job, "DESTROYER"));
    await expect(authorization(f.f.job, f.f.sanitizer.id)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    await expect(f.restart().store.rawAuthorization(f.f.runtime.currentAuthorization)(f.f.job, f.f.verifier.id)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });
  it("refuses metadata tampering and a forged M3 snapshot", async () => {
    const f = await fixture();
    const forged: PrivacyJob = { ...f.bundle.job, ownerId: randomUUID() };
    await expect(f.workflow.enroll({ ...f.bundle, job: forged }, randomUUID())).rejects.toMatchObject({ code: "VERIFICATION_FAILED" });
  });
  it.each(["PrivacyDurableEvent", "PrivacyDurableReceipt"] as const)("prevents %s updates and deletes at DB level", async (table) => {
    const f = await fixture();
    await expect(client.$executeRawUnsafe(`UPDATE "${table}" SET "actorId"=$1::uuid WHERE "jobId"=$2::uuid`, randomUUID(), f.job.id)).rejects.toThrow("PRIVACY_APPEND_ONLY");
    await expect(client.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "jobId"=$1::uuid`, f.job.id)).rejects.toThrow("PRIVACY_APPEND_ONLY");
  });
  it("prevents stale DB revisions and illegal publication jumps", async () => {
    const f = await fixture();
    await expect(client.privacyDurableJob.update({ where: { id: f.job.id }, data: { revision: 0 } })).rejects.toThrow("PRIVACY_IMMUTABLE_OR_STALE");
    await expect(client.privacyDurableJob.update({ where: { id: f.job.id }, data: { revision: 1, publication: "SANITIZED_PUBLISHED", revokedAt: new Date(f.runtime.now()) } })).rejects.toThrow("PRIVACY_IMMUTABLE_OR_STALE");
  });
  it("rejects orphan receipt and audit chain gaps", async () => {
    const f = await fixture();
    await expect(client.privacyDurableReceipt.create({ data: { id: randomUUID(), jobId: randomUUID(), kind: "VERIFICATION",
      hash: "0".repeat(64), objectRef: randomUUID(), actorId: randomUUID(), at: new Date(f.runtime.now()) } })).rejects.toThrow();
    await expect(client.privacyDurableEvent.create({ data: { jobId: f.job.id, sequence: 100, revision: 0, actorId: f.auditorId,
      role: "AUDITOR", action: "CLAIM", result: "ALLOWED", intentHash: "0".repeat(64), idempotencyKey: randomUUID(),
      previousHash: "0".repeat(64), eventHash: "1".repeat(64), at: new Date(f.runtime.now()) } })).rejects.toThrow("PRIVACY_AUDIT_CHAIN");
  });
  it("rolls back enrollment without its verification receipt", async () => {
    const f = await fixture(); const id = randomUUID();
    await expect(client.privacyDurableJob.create({ data: { ...f.job, id, packageId: randomUUID() } })).rejects.toThrow("PRIVACY_INCOMPLETE_RECEIPTS");
    expect(await client.privacyDurableJob.findUnique({ where: { id } })).toBeNull();
  });
  it("uses the unchanged Data Center API, waits for independent human governance and reconciles exact version/checksum", async () => {
    const f = await fixture(); const dc = await governed(f); const lease = await f.ready();
    const pending = await dc.workflow.publish(f.command(lease.job), lease.worker);
    expect(pending.publication).toBe("RECONCILIATION_REQUIRED"); expect(pending.revokedAt).toBeNull();
    const work = await client.privacyDurableWork.findUniqueOrThrow({ where: { jobId_kind: { jobId: f.job.id, kind: "PUBLICATION" } } });
    const item = await client.dataCenterItem.findUniqueOrThrow({ where: { id: work.itemId! } });
    const version = await client.dataCenterVersion.findUniqueOrThrow({ where: { id: work.versionId! } });
    expect(item.status).toBe("DRAFT"); expect(version.evidenceStatus).toBe("UNVERIFIED");
    expect(version.content).toBe(JSON.stringify(f.bundle.dataset));
    expect(work.checksum).toBe(version.checksum);
    await dc.approve(item.id);
    let reconciliationError: unknown = null;
    const reconcile = dc.port.reconcile.bind(dc.port);
    dc.port.reconcile = async (intent) => {
      try { return await reconcile(intent); }
      catch (error) { reconciliationError = error; throw error; }
    };
    const worker = randomUUID(); const retry = await dc.workflow.claim(f.command(pending), "PUBLICATION", worker);
    const published = await dc.workflow.publish(f.command(retry.job), worker, true);
    expect(reconciliationError).toBeNull();
    expect(published.publication).toBe("SANITIZED_PUBLISHED"); expect(published.revokedAt).not.toBeNull();
    expect(await client.dataCenterItem.count({ where: { sourceId: dc.source.id } })).toBe(1);
    expect(await client.dataCenterVersion.count({ where: { itemId: item.id } })).toBe(1);
    const receipt = await client.privacyDurableReceipt.findUniqueOrThrow({ where: { jobId_kind: { jobId: f.job.id, kind: "PUBLICATION" } } });
    expect(receipt.hash).toBe(privacyHash(f.saved.get(receipt.objectRef)));
  });
  it("recovers a lost adapter response with no duplicate Data Center proposal", async () => {
    const f = await fixture(); const dc = await governed(f); const lease = await f.ready();
    const dispatch = dc.port.dispatch.bind(dc.port);
    dc.port.dispatch = async (intent) => { await dispatch(intent); throw new Error("synthetic response lost"); };
    const pending = await dc.workflow.publish(f.command(lease.job), lease.worker);
    const work = await client.privacyDurableWork.findUniqueOrThrow({ where: { jobId_kind: { jobId: f.job.id, kind: "PUBLICATION" } } });
    await dc.approve(work.itemId!);
    const worker = randomUUID(); const retry = await dc.workflow.claim(f.command(pending), "PUBLICATION", worker);
    expect((await dc.workflow.publish(f.command(retry.job), worker, true)).publication).toBe("SANITIZED_PUBLISHED");
    expect(await client.dataCenterItem.count({ where: { sourceId: dc.source.id } })).toBe(1);
  });
  it("does not accept a DRAFT proposal or silently substitute another exact source", async () => {
    const f = await fixture(); const dc = await governed(f); const lease = await f.ready();
    const pending = await dc.workflow.publish(f.command(lease.job), lease.worker);
    const worker = randomUUID(); const retry = await dc.workflow.claim(f.command(pending), "PUBLICATION", worker);
    expect((await dc.workflow.publish(f.command(retry.job), worker, true)).publication).toBe("RECONCILIATION_REQUIRED");
    expect(await client.privacyDurableReceipt.count({ where: { jobId: f.job.id, kind: "PUBLICATION" } })).toBe(0);
    expect(await client.dataCenterItem.count({ where: { sourceId: dc.source.id } })).toBe(1);
  });
  it("rolls back a real child-process crash in a job/work transaction and recovers the prior exact revision", async () => {
    const f = await fixture(); const authorized = await f.workflow.authorizePublication(f.command());
    const child = spawnSync(process.execPath, ["-e", `
      const { Client } = require("pg");
      (async () => {
        const c = new Client({ connectionString: process.env.PRIVACY_M4_DATABASE_URL }); await c.connect();
        await c.query('BEGIN');
        await c.query('UPDATE "PrivacyDurableJob" SET "revision"="revision"+1, "publication"=$1 WHERE "id"=$2::uuid',
          ['PUBLISHING', process.env.PRIVACY_CRASH_JOB]);
        await c.query('UPDATE "PrivacyDurableWork" SET "state"=$1, "leaseOwner"=gen_random_uuid(), "leaseUntil"=NOW()+INTERVAL \\'30 seconds\\' WHERE "jobId"=$2::uuid',
          ['LEASED', process.env.PRIVACY_CRASH_JOB]);
        process.exit(27);
      })().catch(() => process.exit(28));
    `], { cwd: process.cwd(), env: { ...process.env, PRIVACY_CRASH_JOB: f.job.id }, encoding: "utf8", timeout: 15_000 });
    expect(child.status).toBe(27); expect(child.stdout).toBe("");
    expect(await f.store.read(f.job.id, f.publisherId, "PUBLISHER")).toEqual(authorized);
    const work = await client.privacyDurableWork.findUniqueOrThrow({ where: { jobId_kind: { jobId: f.job.id, kind: "PUBLICATION" } } });
    expect(work.state).toBe("READY"); expect(work.leaseOwner).toBeNull();
    expect((await f.restart().claim(f.command(authorized), "PUBLICATION", randomUUID())).dispatch).toBe(true);
  });
  it.each(["jenan_privacy_process", "jenan_privacy_verify", "jenan_privacy_publish", "jenan_privacy_destroy", "jenan_privacy_audit"])(
    "keeps %s unable to update/delete append-only history or access existing customer tables", async (role) => {
      const f = await fixture();
      await expect(client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        return tx.$executeRaw`DELETE FROM "PrivacyDurableEvent" WHERE "jobId"=${f.job.id}::uuid`;
      })).rejects.toThrow("permission denied");
      await expect(client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        return tx.$queryRaw`SELECT "id" FROM "FileAsset" LIMIT 1`;
      })).rejects.toThrow("permission denied");
    });
  it("enforces publication/destruction RLS separation and verifier cannot create a publication receipt", async () => {
    const f = await fixture();
    for (const [role, kind] of [["jenan_privacy_verify", "PUBLICATION"], ["jenan_privacy_publish", "DESTRUCTION"],
      ["jenan_privacy_destroy", "VERIFICATION"]] as const) {
      await expect(client.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
        await tx.privacyDurableReceipt.create({ data: { id: randomUUID(), jobId: f.job.id, kind,
          hash: "7".repeat(64), objectRef: randomUUID(), actorId: randomUUID(), at: new Date(f.runtime.now()) } });
      })).rejects.toThrow("row-level security");
    }
  });
  it("rejects stale attempt/fence even when an idempotency key already succeeded", async () => {
    const f = await fixture(); const command = f.command();
    await f.workflow.authorizePublication(command);
    await expect(f.workflow.authorizePublication({ ...command, fence: command.fence + 1 })).rejects.toMatchObject({ code: "STALE_ATTEMPT" });
    await expect(f.workflow.authorizePublication({ ...command, attemptId: randomUUID() })).rejects.toMatchObject({ code: "STALE_ATTEMPT" });
  });
  it("rejects changed command intent under an existing key", async () => {
    const f = await fixture(); const authorized = await f.workflow.authorizePublication(f.command());
    const command = f.command(authorized); await f.workflow.claim(command, "PUBLICATION", randomUUID());
    await expect(f.workflow.claim(command, "PUBLICATION", randomUUID())).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("rejects cross-client grants without touching publication state", async () => {
    const f = await fixture();
    f.f.roles.set(f.publisherId, f.f.roles.get(f.publisherId)!.map((grant) => ({ ...grant, scope: { ...grant.scope, clientId: randomUUID() } })));
    await expect(f.workflow.authorizePublication(f.command())).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(await client.privacyDurableWork.count({ where: { jobId: f.job.id } })).toBe(0);
  });
  it("does not leak adapter error content in state, errors or durable audit", async () => {
    const f = await fixture(); const secret = "Synthetic Person synth@example.test RAW_ACCOUNT_987";
    f.artifacts.dataset = async () => { throw new Error(secret); };
    await expect(f.workflow.authorizePublication(f.command())).rejects.toMatchObject({ message: "ADAPTER_UNAVAILABLE" });
    expect(JSON.stringify(await f.store.audit(f.job.id, f.auditorId))).not.toContain(secret);
    expect(await client.privacyDurableWork.count({ where: { jobId: f.job.id } })).toBe(0);
  });
  it("rejects invalid opaque IDs before the driver can echo caller input", async () => {
    const f = await fixture();
    await expect(f.workflow.authorizePublication({ ...f.command(), jobId: "Synthetic Person synth@example.test" }))
      .rejects.toMatchObject({ message: "MALFORMED_INPUT" });
    expect((await f.store.audit(f.job.id, f.auditorId))).toHaveLength(1);
  });
  it("rejects mismatched policy, unavailable artifact and changed candidate hash", async () => {
    const f = await fixture(); const original = f.artifacts.dataset;
    f.artifacts.dataset = async () => ({ ...f.bundle.dataset, anonymous: true });
    await expect(f.workflow.authorizePublication(f.command())).rejects.toThrow("MALFORMED_INPUT");
    f.artifacts.dataset = original;
    const policy = structuredClone(f.f.policy); policy.pins.tokenization.hash = "9".repeat(64);
    f.runtime.policy = async () => policy;
    await expect(f.workflow.authorizePublication(f.command())).rejects.toThrow("POLICY_MISMATCH");
  });
  it("rejects a partial publication acknowledgment without revoking RAW or creating a receipt", async () => {
    const f = await fixture(); const lease = await f.ready();
    f.publisher.dispatch = async () => ({ itemId: "partial", allPartsAcknowledged: false });
    const pending = await f.workflow.publish(f.command(lease.job), lease.worker);
    expect(pending.publication).toBe("RECONCILIATION_REQUIRED"); expect(pending.revokedAt).toBeNull();
    expect(await client.privacyDurableReceipt.count({ where: { jobId: f.job.id, kind: "PUBLICATION" } })).toBe(0);
  });
  it("revokes and schedules cleanup on TTL expiration rather than publishing stale verification", async () => {
    const f = await fixture(); f.f.setNow("2026-10-24T04:00:00.000Z");
    await expect(f.workflow.authorizePublication(f.command())).rejects.toThrow();
    // Trusted cleanup grant renewal is explicit; an expired grant cannot clean as an old worker.
    const grants = f.f.roles.get(f.destroyerId)!;
    f.f.roles.set(f.destroyerId, grants.map((g) => ({ ...g, expiresAt: "2026-10-25T04:00:00.000Z" })));
    const revoked = await f.workflow.revoke(f.command(f.job, "DESTROYER"));
    expect(revoked.destruction).toBe("DESTRUCTION_PENDING");
    expect(revoked.revokedAt).not.toBeNull();
  });
});
