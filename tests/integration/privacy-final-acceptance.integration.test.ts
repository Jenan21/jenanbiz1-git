import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { artifactChecksum } from "@/services/privacy-gateway/durable/recovery";
import { recoveryRole } from "@/services/privacy-gateway/durable/recovery-contracts";
import { privacyHash } from "@/services/privacy-gateway/policy";
import { restartFixture, type RestartConfig } from "../unit/support/privacy-recovery-process";
import { RestartObjects } from "../unit/support/privacy-restart-objects";
import { safeCsv } from "../unit/support/privacy-sanitization-fixtures";
import { assertPrivacyAcceptanceDatabase } from "../unit/support/privacy-isolated-database";

assertPrivacyAcceptanceDatabase(process.env.PRIVACY_M4_DATABASE_URL);
const fixtures: { root: string; client: Awaited<ReturnType<typeof restartFixture>>["client"] }[] = [];
async function fixture(organizationId = randomUUID(), clientId = randomUUID()) {
  const root = await mkdtemp(join(tmpdir(), "jenan-privacy-m5-"));
  await RestartObjects.initialize(root);
  const config: RestartConfig = { jobId: randomUUID(), packageId: randomUUID(), organizationId, clientId,
    attemptId: randomUUID(), key: randomUUID(), workerId: randomUUID() };
  const r = await restartFixture(root, config);
  const input = { ...r.scope, ownerId: r.f.actor(10).id, purposeId: randomUUID(), usageBasisId: randomUUID(),
    attemptId: config.attemptId, fence: 1, policyHash: privacyHash(r.f.policy),
    checksum: artifactChecksum(safeCsv()), size: safeCsv().length, media: "CSV" as const, key: config.key };
  const advance = async () => {
    const current = await r.client.privacyAdmission.findUniqueOrThrow({ where: { id: config.jobId } });
    const role = recoveryRole(current.state);
    const claimed = await r.recovery.claim(r.cmd(current, role));
    return r.recovery.advance(r.cmd(claimed, role), safeCsv());
  };
  const reach = async (state: string) => {
    for (let i = 0; i < 16; i++) {
      const current = await r.client.privacyAdmission.findUniqueOrThrow({ where: { id: config.jobId } });
      if (current.state === state) return current;
      await advance();
    }
    throw new Error("ACCEPTANCE_CHECKPOINT_NOT_REACHED");
  };
  const result = { ...r, root, config, input, advance, reach };
  fixtures.push(result);
  return result;
}
afterAll(async () => {
  for (const f of fixtures) {
    await f.client.$disconnect();
    await rm(f.root, { recursive: true, force: true });
  }
});
describe("Privacy M5 bounded final technical acceptance", () => {
  it("runs concurrent multi-tenant admission, exact replay, verification and cleanup with measured envelopes", async () => {
    const started = performance.now(); const rssBefore = process.memoryUsage().rss;
    const organizations = [randomUUID(), randomUUID()];
    const clients = [randomUUID(), randomUUID(), randomUUID()];
    const durations: number[] = []; const jobs: string[] = [];
    let maxMetadataBytes = 0; let maxCandidateBytes = 0; let maxReceiptBytes = 0;
    for (let batch = 0; batch < 2; batch++) {
      await Promise.all(clients.map(async (clientId) => {
        const begin = performance.now(); const f = await fixture(organizations[batch], clientId);
        jobs.push(f.config.jobId);
        const admitted = await Promise.all([f.recovery.admit(f.input), f.recovery.admit(f.input)]);
        expect(admitted[0]).toEqual(admitted[1]);
        const verified = await f.reach("SANITIZATION_VERIFIED");
        const bundle = await f.recovery.bundle(verified.id, f.f.actor(12).id);
        const inventory = await f.client.privacyInventoryArtifact.findMany({ where: { jobId: verified.id } });
        expect(new Set(inventory.map((a) => `${a.kind}:${a.ordinal}`)).size).toBe(inventory.length);
        for (const kind of ["TOKEN_MAPPING", "CANDIDATE", "VERIFICATION"]) {
          expect(inventory.filter((a) => a.kind === kind)).toHaveLength(1);
        }
        const metadata = {
          package: await f.client.privacyClientPackage.findUniqueOrThrow({ where: { id: f.config.packageId } }),
          job: verified, inventory, events: await f.recovery.audit(verified.id, f.f.actor(15).id),
        };
        const safe = JSON.stringify(metadata);
        for (const secret of ["Synthetic Person", "synth@example.test", "-100.2300", "tok_", "BEGIN PRIVATE KEY"]) {
          expect(safe).not.toContain(secret);
        }
        maxMetadataBytes = Math.max(maxMetadataBytes, Buffer.byteLength(safe));
        maxCandidateBytes = Math.max(maxCandidateBytes, Buffer.byteLength(JSON.stringify(bundle.dataset)));
        maxReceiptBytes = Math.max(maxReceiptBytes, Buffer.byteLength(JSON.stringify(bundle.receipt)));
        const revoked = await f.recovery.fail(f.cmd(verified, "DESTROYER"), "CANCELLED");
        const command = f.cmd(revoked, "DESTROYER");
        const clean = await Promise.allSettled([f.recovery.cleanup(command), f.recovery.cleanup(command)]);
        for (const result of clean) {
          if (result.status === "rejected") expect(result.reason).toHaveProperty("code", "IDEMPOTENCY_CONFLICT");
        }
        let cleaned = await f.client.privacyAdmission.findUniqueOrThrow({ where: { id: verified.id } });
        if (cleaned.cleanup === "RETRY") cleaned = await f.recovery.cleanup(f.cmd(cleaned, "DESTROYER"));
        expect(cleaned.cleanup).toBe("REFERENCE_CLEANED");
        expect(cleaned.state).not.toBe("RAW_DESTROYED");
        durations.push(performance.now() - begin);
      }));
    }
    expect(new Set(jobs).size).toBe(6);
    expect(maxMetadataBytes).toBeLessThan(128 * 1024);
    expect(maxCandidateBytes).toBeLessThan(64 * 1024);
    expect(maxReceiptBytes).toBeLessThan(16 * 1024);
    durations.sort((a, b) => a - b);
    console.log("PRIVACY_M5_SYNTHETIC_ADMISSION_LOAD", JSON.stringify({
      qualification: "TEST_ONLY_NOT_PRODUCTION_SLA", jobs: 6, organizations: 2, clients: 3, concurrency: 3,
      batchMs: performance.now() - started, p50Ms: durations[2], p95Ms: durations[5],
      rssBefore, rssAfter: process.memoryUsage().rss, processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
      maxMetadataBytes, maxCandidateBytes, maxReceiptBytes, unexpectedFailures: 0,
    }));
  }, 120_000);
  it.each(["ciphertext", "AAD", "key-reference"] as const)("fails closed for persisted %s tampering without RAW in error or audit", async (kind) => {
    const f = await fixture(); await f.recovery.admit(f.input); await f.reach("SCAN_PENDING");
    const artifact = await f.client.privacyInventoryArtifact.findFirstOrThrow({ where: { jobId: f.config.jobId, kind: "ORIGINAL" } });
    if (kind === "ciphertext") {
      const path = join(f.root, f.config.jobId, `${artifact.objectRef}.object`);
      const bytes = await readFile(path); bytes[16] ^= 1; await writeFile(path, bytes);
      await expect(f.advance()).rejects.toHaveProperty("code", "ADAPTER_UNAVAILABLE");
      expect((await f.client.privacyAdmission.findUniqueOrThrow({ where: { id: artifact.jobId } })).state).toBe("FAILED");
    } else {
      await expect(f.objects.read(kind === "AAD" ? { ...artifact, packageId: randomUUID() } :
        { ...artifact, keyRef: randomUUID() })).rejects.toBeInstanceOf(Error);
      expect((await f.client.privacyAdmission.findUniqueOrThrow({ where: { id: artifact.jobId } })).state).toBe("SCAN_PENDING");
    }
    const safe = JSON.stringify(await f.recovery.audit(artifact.jobId, f.f.actor(15).id));
    expect(safe).not.toMatch(/Synthetic Person|synth@example\.test|-100\.2300|tok_/);
  });
  it.each(["organizationId", "clientId", "packageId", "jobId"] as const)("rejects a current grant for another %s without advancing state", async (field) => {
    const f = await fixture(); const admitted = await f.recovery.admit(f.input);
    const authorization = f.runtime.authorization;
    f.runtime.authorization = async (jobId, actorId) => {
      const current = await authorization(jobId, actorId);
      return { ...current, grants: current.grants.map((g) => ({ ...g, scope: { ...g.scope, [field]: randomUUID() } })) };
    };
    await expect(f.recovery.claim(f.cmd(admitted, "INTAKE"))).rejects.toThrow("AUTHORIZATION_DENIED");
    expect((await f.client.privacyAdmission.findUniqueOrThrow({ where: { id: admitted.id } })).revision).toBe(0);
  });
  it("rejects invalid scanner output and preserves failure cleanup rather than CLEAN evidence", async () => {
    const f = await fixture(); await f.recovery.admit(f.input); await f.reach("SCAN_PENDING");
    f.runtime.scanner = async () => JSON.parse('"UNTRUSTED_SCANNER_RESULT"');
    await expect(f.advance()).rejects.toThrow("ADAPTER_UNAVAILABLE");
    const job = await f.client.privacyAdmission.findUniqueOrThrow({ where: { id: f.config.jobId } });
    expect(job).toMatchObject({ state: "FAILED", cleanup: "PENDING", manifestHash: null });
  });
  it("refuses a manipulated signed receipt after restart without creating a publication job", async () => {
    const f = await fixture(); await f.recovery.admit(f.input); await f.reach("SANITIZATION_VERIFIED");
    const bundle = await f.recovery.bundle(f.config.jobId, f.f.actor(12).id);
    const altered = structuredClone(bundle); altered.receipt.actorId = f.f.actor(11).id;
    expect(await f.runtime.authenticateVerification(altered)).toBe(false);
    expect(await f.client.privacyDurableJob.count({ where: { id: f.config.jobId } })).toBe(0);
  }, 120_000);
});
