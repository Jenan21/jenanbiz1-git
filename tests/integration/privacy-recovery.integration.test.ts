import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { RestartObjects } from "../unit/support/privacy-restart-objects";
import { recoveryStates } from "@/services/privacy-gateway/durable/recovery-contracts";
import { restartFixture } from "../unit/support/privacy-recovery-process";
import { PrivacyWorkflow } from "@/services/privacy-gateway/durable/workflow";
import { GovernedDataCenterPublication } from "@/services/privacy-gateway/durable/data-center";
import type { DestructionPort, DurableCommand } from "@/services/privacy-gateway/durable/contracts";
import { createDataCenterSource, registerDataCenterType, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { db } from "@/lib/db";
import { privacyHash } from "@/services/privacy-gateway/policy";
import { PrivacyRecovery } from "@/services/privacy-gateway/durable/recovery";
import { privacyId } from "../unit/support/privacy-gateway-fixtures";
import { assertPrivacyAcceptanceDatabase } from "../unit/support/privacy-isolated-database";

const url = assertPrivacyAcceptanceDatabase(process.env.PRIVACY_M4_DATABASE_URL);
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const directories: string[] = [];
afterAll(async () => {
  await client.$disconnect();
  await db.$disconnect();
  for (const path of directories) await rm(path, { recursive: true, force: true });
});
async function fixture(admissionCrash = false, defaults: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), "jenan-privacy-restart-")); directories.push(root);
  await RestartObjects.initialize(root);
  const ids = { jobId: randomUUID(), packageId: randomUUID(), organizationId: randomUUID(), clientId: randomUUID(),
    attemptId: randomUUID(), key: randomUUID(), workerId: randomUUID() };
  const step = async (action = "advance", extra: Record<string, unknown> = {}) => {
    await writeFile(join(root, "command.json"), JSON.stringify({ ...ids, ...defaults, action, ...extra }));
    const entry = resolve("tests", "unit", "support", "privacy-recovery-process.ts");
    const script = `
      const {registerHooks}=require('node:module'); const {existsSync}=require('node:fs');
      const {join}=require('node:path'); const {pathToFileURL,fileURLToPath}=require('node:url');
      registerHooks({resolve(specifier,context,next){
        let path;
        if(specifier.startsWith('@/')) path=join(process.cwd(),specifier.slice(2));
        else if(specifier.startsWith('.') && context.parentURL?.startsWith('file:')) path=fileURLToPath(new URL(specifier,context.parentURL));
        if(path){for(const candidate of [path,path+'.ts',join(path,'index.ts')]){
          if(existsSync(candidate) && (candidate.endsWith('.ts')||candidate.endsWith('.js'))) return next(pathToFileURL(candidate).href,context);
        }}
        return next(specifier,context);
      }});
      import(pathToFileURL(${JSON.stringify(entry)}).href).then(m=>m.main())
        .then(()=>process.exit(process.exitCode??0)).catch(e=>{process.stderr.write(String(e));process.exit(2)});
    `;
    return new Promise<{ code: number | null; out: string; error: string }>((resolveResult, reject) => {
      const child = spawn(process.execPath, ["--experimental-transform-types", "--disable-warning=ExperimentalWarning", "-e", script], { cwd: process.cwd(), env: {
        ...process.env, PRIVACY_RECOVERY_ROOT: root, NODE_OPTIONS: "--max-old-space-size=2048",
      }, stdio: ["ignore", "pipe", "pipe"] });
      let out = ""; let error = "";
      child.stdout.on("data", (data) => { out += String(data); }); child.stderr.on("data", (data) => { error += String(data); });
      const timeout = setTimeout(() => { child.kill(); reject(new Error("TEST_CHILD_TIMEOUT")); }, 25_000);
      child.on("error", reject); child.on("exit", (code) => { clearTimeout(timeout); resolveResult({ code, out, error }); });
    });
  };
  const status = () => client.privacyAdmission.findUniqueOrThrow({ where: { id: ids.jobId } });
  const reach = async (state: string) => {
    for (let i = 0; i < 20; i++) {
      const j = await status(); if (j.state === state) return j;
      const result = await step(); expect(result, `${j.state}: ${result.error}`).toMatchObject({ code: 0 });
    }
    throw new Error("CHECKPOINT_NOT_REACHED");
  };
  expect(await step("admit", admissionCrash ? { crash: "INTAKE_ACCEPTED" } : {})).toMatchObject({ code: admissionCrash ? 73 : 0 });
  return { root, ids, step, status, reach };
}
describe("M4 real process restart recovery from admission", () => {
  it("M5 recovers actual-process death after publication effect and destruction cleanup without blind retry or false certification", async () => {
    const f = await fixture(); await f.reach("SANITIZATION_VERIFIED");
    for (const action of ["publication-enroll", "publication-authorize", "publication-claim"]) {
      expect(await f.step(action)).toMatchObject({ code: 0 });
    }
    expect(await f.step("publication-dispatch", { crash: "PUBLISH_RESPONSE_LOST" })).toMatchObject({ code: 73 });
    const before = await readFile(join(f.root, "publication.test-result.json"), "utf8");
    expect(await client.privacyDurableReceipt.count({ where: { jobId: f.ids.jobId, kind: "PUBLICATION" } })).toBe(0);
    expect(await f.step("publication-claim", { now: "2026-10-23T04:01:01.000Z" })).toMatchObject({ code: 0 });
    expect(await f.step("publication-dispatch", { now: "2026-10-23T04:01:01.000Z" })).toMatchObject({ code: 1 });
    expect(await f.step("publication-reconcile", { now: "2026-10-23T04:01:01.000Z" })).toMatchObject({ code: 0 });
    expect(await readFile(join(f.root, "publication.test-result.json"), "utf8")).toBe(before);
    const published = await client.privacyDurableJob.findUniqueOrThrow({ where: { id: f.ids.jobId } });
    expect(published).toMatchObject({ publication: "SANITIZED_PUBLISHED", destruction: "DESTRUCTION_PENDING" });
    expect(published.revokedAt).not.toBeNull();
    expect(await f.step("deny-raw")).toMatchObject({ code: 1 });
    expect(await f.step("destruction-claim", { now: "2026-10-23T04:01:01.000Z" })).toMatchObject({ code: 0 });
    expect(await f.step("destruction-run", { now: "2026-10-23T04:01:01.000Z", crash: "DESTRUCTION_RESPONSE_LOST" })).toMatchObject({ code: 73 });
    expect((await f.status()).cleanup).toBe("REFERENCE_CLEANED");
    expect(await f.step("destruction-claim", { now: "2026-10-23T04:02:02.000Z" })).toMatchObject({ code: 0 });
    expect(await f.step("destruction-run", { now: "2026-10-23T04:02:02.000Z" })).toMatchObject({ code: 0 });
    const final = await client.privacyDurableJob.findUniqueOrThrow({ where: { id: f.ids.jobId } });
    expect(final.destruction).toBe("DESTRUCTION_FAILED");
    expect(await client.privacyDurableReceipt.count({ where: { jobId: f.ids.jobId, kind: "PUBLICATION" } })).toBe(1);
    expect(await client.privacyDurableReceipt.count({ where: { jobId: f.ids.jobId, kind: "DESTRUCTION" } })).toBe(0);
  }, 120_000);
  it("recovers a committed intake after the admitting process dies before acknowledgement", async () => {
    const f = await fixture(true);
    expect((await f.status()).state).toBe("INTAKE_ACCEPTED");
    expect((await f.reach("RAW_READY")).manifestHash).not.toBeNull();
  }, 120_000);
  it("connects restart-persistent verification to exact governed publication, revocation and honest destruction failure", async () => {
    const f = await fixture(); await f.reach("SANITIZATION_VERIFIED");
    let r = await restartFixture(f.root, f.ids);
    const bundle = await r.recovery.bundle(f.ids.jobId, r.f.actor(12).id);
    const user = await client.user.create({ data: { email: `${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
    const reviewer = await client.user.create({ data: { email: `${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
    const actor: DataCenterActor = { id: user.id, kind: "HUMAN", systemRole: "ADMIN" };
    const independent: DataCenterActor = { id: reviewer.id, kind: "HUMAN", systemRole: "ADMIN" };
    await client.organization.create({ data: { id: f.ids.organizationId, name: "Synthetic recovery organization", slug: randomUUID() } });
    const source = await createDataCenterSource({ name: "Synthetic recovery source", kind: "FILE", scope: "ORGANIZATION",
      organizationId: f.ids.organizationId, owner: "Synthetic owner", license: "Synthetic test only",
      licenseClass: "RESTRICTED", allowExport: false }, actor);
    const typeKey = `privacy-recovery-${randomUUID()}`;
    await registerDataCenterType({ key: typeKey, label: "Synthetic recovery", layer: "DATA", requiresIndependentReview: true }, actor);
    const bindingPath = join(f.root, "publication.binding.json");
    await writeFile(bindingPath, JSON.stringify({ sourceId: source.id, typeKey, principalId: user.id }));
    const command = (j: { id: string; attemptId: string; fence: number; revision: number }, destroy = false): DurableCommand =>
      ({ jobId: j.id, attemptId: j.attemptId, fence: j.fence, revision: j.revision, actorId: r.f.actor(destroy ? 14 : 13).id, key: randomUUID() });
    const workflow = () => {
      const destruction: DestructionPort = {
        qualification: "TEST_ONLY",
        async revoke() {
          const j = await r.client.privacyAdmission.findUniqueOrThrow({ where: { id: f.ids.jobId } });
          await r.recovery.revokePublished(r.cmd(j, "DESTROYER"));
        },
        async destroy() {
          const j = await r.client.privacyAdmission.findUniqueOrThrow({ where: { id: f.ids.jobId } });
          const result = await r.recovery.cleanup(r.cmd(j, "DESTROYER"));
          if (result.cleanup !== "REFERENCE_CLEANED") throw new Error("TEST_REFERENCE_CLEANUP_FAILED");
          // File/key reference deletion is not the complete M1 destruction-evidence contract.
          return { state: "DESTRUCTION_PENDING" };
        },
        async authenticate() { return false; },
      };
      const artifacts = r.recovery.artifactStore();
      const publisher = new GovernedDataCenterPublication(r.store, artifacts, {
        async resolve() { return JSON.parse(await readFile(bindingPath, "utf8")); },
      }, r.runtime.signer);
      return new PrivacyWorkflow(r.store, artifacts, publisher, destruction, r.recovery);
    };
    try {
      let w = workflow(); const enrolled = await w.enroll(bundle, randomUUID());
      const authorized = await w.authorizePublication(command(enrolled));
      const claimed = await w.claim(command(authorized), "PUBLICATION", f.ids.workerId);
      const proposed = await w.publish(command(claimed.job), f.ids.workerId);
      expect(proposed.publication).toBe("RECONCILIATION_REQUIRED");
      const work = await client.privacyDurableWork.findUniqueOrThrow({ where: { jobId_kind: { jobId: f.ids.jobId, kind: "PUBLICATION" } } });
      expect(work.itemId).not.toBeNull();
      await r.client.$disconnect();
      r = await restartFixture(f.root, f.ids); w = workflow();
      await transitionDataCenterItem({ itemId: work.itemId!, status: "IN_REVIEW", reason: "Synthetic review" }, actor);
      await reviewDataCenterItem({ itemId: work.itemId!, decision: "APPROVED", notes: "Synthetic independent review" }, independent);
      await transitionDataCenterItem({ itemId: work.itemId!, status: "APPROVED", reason: "Synthetic approved" }, independent);
      await transitionDataCenterItem({ itemId: work.itemId!, status: "PUBLISHED", reason: "Synthetic published" }, independent);
      const reclaimed = await w.claim(command(proposed), "PUBLICATION", f.ids.workerId);
      const published = await w.publish(command(reclaimed.job), f.ids.workerId, true);
      expect(published.publication).toBe("SANITIZED_PUBLISHED");
      expect((await f.step("deny-raw")).code).toBe(1);
      const destruction = await w.claim(command(published, true), "DESTRUCTION", f.ids.workerId);
      expect((await w.destroy(command(destruction.job, true), f.ids.workerId)).destruction).toBe("DESTRUCTION_FAILED");
      const inventory = await client.privacyInventoryArtifact.findMany({ where: { jobId: f.ids.jobId } });
      expect(inventory.filter((a) => a.taint === "RAW").every((a) => a.state === "REVOKED")).toBe(true);
      expect(await r.recovery.artifactStore().dataset(bundle.artifactObject, privacyHash(bundle.dataset))).toEqual(bundle.dataset);
      expect(await r.recovery.artifactStore().verification(bundle.receiptObject, privacyHash(bundle.receipt))).toEqual(bundle);
      expect((await r.recovery.audit(f.ids.jobId, r.f.actor(15).id)).length).toBeGreaterThan(10);
      expect(await client.privacyDurableReceipt.count({ where: { jobId: f.ids.jobId } })).toBe(2);
      expect((await readdir(join(f.root, f.ids.jobId))).sort()).toHaveLength(5);
    } finally { await r.client.$disconnect(); }
  }, 120_000);
  it("recovers the entire exact pipeline through independent verification across fresh processes", async () => {
    const f = await fixture(); const completed = await f.reach("SANITIZATION_VERIFIED");
    expect(completed.verificationHash).not.toBeNull();
    const inventory = await client.privacyInventoryArtifact.findMany({ where: { jobId: f.ids.jobId } });
    expect(inventory.map((a) => a.kind).sort()).toEqual(["CANDIDATE", "EXTRACTED", "ORIGINAL", "TOKEN_MAPPING", "VERIFICATION"]);
    expect(inventory.every((a) => a.state === "COMPLETE")).toBe(true);
    const db = JSON.stringify({ completed, inventory });
    for (const value of ["Synthetic Person", "synth@example.test", "-100.2300", "tok_"]) expect(db).not.toContain(value);
  }, 120_000);
  it.each(["STAGING", "BEFORE_KEY", "KEY_PENDING", "BEFORE_OBJECT", "OBJECT_PENDING", "AFTER_OBJECT", "WRITE_ORIGINAL", "AFTER_KEY", "DURING_SCAN", "SCAN_CLEAN", "EXTRACTING",
    "WRITE_EXTRACTED", "BEFORE_RAW_READY", "CLASSIFYING", "SANITIZING", "WRITE_TOKEN_MAPPING", "WRITE_CANDIDATE",
    "SANITIZATION_CANDIDATE_READY", "SANITIZATION_VERIFICATION", "WRITE_VERIFICATION"])(
    "recovers without partial evidence or duplicate inventory after process death at %s", async (point) => {
      const f = await fixture();
      const phase = ["BEFORE_KEY", "KEY_PENDING", "BEFORE_OBJECT", "OBJECT_PENDING", "AFTER_OBJECT", "WRITE_ORIGINAL", "AFTER_KEY"].includes(point) ? "STAGING" : point === "DURING_SCAN" ? "SCAN_PENDING" :
        ["WRITE_EXTRACTED", "BEFORE_RAW_READY"].includes(point) ? "EXTRACTING" :
          ["WRITE_TOKEN_MAPPING", "WRITE_CANDIDATE"].includes(point) ? "SANITIZING" :
            point === "WRITE_VERIFICATION" ? "SANITIZATION_VERIFICATION" : point;
      await f.reach(phase);
      const result = await f.step("advance", { crash: point });
      // EXTRACTING first reserves all child identities in a single transaction.
      if (point === "WRITE_EXTRACTED" || point === "BEFORE_RAW_READY") {
        if (result.code === 0) expect(await f.step("advance", { crash: point })).toMatchObject({ code: 73 });
        else expect(result.code).toBe(73);
      } else expect(result, result.error).toMatchObject({ code: 73 });
      const interrupted = await f.status();
      expect(interrupted.state).not.toBe("SANITIZATION_VERIFIED");
      const complete = await f.reach("SANITIZATION_VERIFIED");
      expect(complete.verificationHash).not.toBeNull();
      const inventory = await client.privacyInventoryArtifact.findMany({ where: { jobId: f.ids.jobId } });
      expect(new Set(inventory.map((a) => `${a.kind}:${a.ordinal}`)).size).toBe(inventory.length);
      expect(inventory.filter((a) => a.kind === "TOKEN_MAPPING")).toHaveLength(1);
      expect(inventory.filter((a) => a.kind === "VERIFICATION")).toHaveLength(1);
    }, 120_000);
  it("denies revoked current authorization after process restart and retains cleanup intents", async () => {
    const f = await fixture(); await f.reach("RAW_READY");
    expect((await f.step("advance", { revoked: true })).code).toBe(1);
    expect((await f.status()).state).toBe("RAW_READY");
    expect(await f.step("cleanup", { revoked: true })).toMatchObject({ code: 0 });
    expect((await f.status()).cleanup).toBe("REFERENCE_CLEANED");
  }, 120_000);
  it("enforces TTL expiry while no coordinator is running, then recovers cleanup", async () => {
    const f = await fixture(); await f.reach("SCAN_PENDING");
    const now = "2026-10-25T04:00:00.000Z";
    expect((await f.step("advance", { now })).code).toBe(1);
    expect(await f.step("cleanup", { now })).toMatchObject({ code: 0 });
    const j = await f.status(); expect(j.failure).toBe("EXPIRED"); expect(j.cleanup).toBe("REFERENCE_CLEANED");
  }, 120_000);
  it("rejects a stale worker after restart and expired-lease takeover, including stale fence evidence", async () => {
    const f = await fixture(); expect((await f.step("claim")).code).toBe(0);
    const old = await f.status();
    const r = await restartFixture(f.root, { ...f.ids, now: "2026-10-23T04:01:01.000Z", workerId: randomUUID() });
    try {
      const claimed = await r.recovery.claim(r.cmd(old, "INTAKE"));
      const stale = { ...r.cmd(old, "INTAKE"), workerId: f.ids.workerId };
      await expect(r.recovery.advance(stale)).rejects.toHaveProperty("code", "STALE_ATTEMPT");
      await expect(r.recovery.advance({ ...r.cmd(claimed, "INTAKE"), fence: 200 })).rejects.toHaveProperty("code", "STALE_ATTEMPT");
      expect((await f.status()).revision).toBe(claimed.revision);
    } finally { await r.client.$disconnect(); }
  }, 120_000);
  it("deduplicates concurrent delivery and preserves the exact committed command after a fresh coordinator", async () => {
    const f = await fixture(); let r = await restartFixture(f.root, f.ids);
    try {
      const claimed = await r.recovery.claim(r.cmd(await f.status(), "INTAKE"));
      const command = r.cmd(claimed, "INTAKE");
      const results = await Promise.all([r.recovery.advance(command), r.recovery.advance(command),
        r.recovery.audit(f.ids.jobId, r.f.actor(15).id)]);
      expect(results[0]).toEqual(results[1]);
      await r.client.$disconnect(); r = await restartFixture(f.root, f.ids);
      expect(await r.recovery.advance(command)).toEqual(results[0]);
      await expect(r.recovery.advance({ ...command, fence: 200 })).rejects.toHaveProperty("code", "IDEMPOTENCY_CONFLICT");
    } finally { await r.client.$disconnect(); }
  }, 120_000);
  it("keeps exact mapping/candidate/receipt bytes and rejects role-change self-verification after restart", async () => {
    const f = await fixture(); await f.reach("SANITIZATION_VERIFICATION");
    expect((await f.status()).sanitizerId).toBe(privacyId(11));
    expect((await f.step("advance", { actorId: privacyId(11), changedRole: "VERIFIER" })).code).toBe(1);
    const r = await restartFixture(f.root, f.ids);
    try {
      const items = await client.privacyInventoryArtifact.findMany({ where: { jobId: f.ids.jobId } });
      const mapping = items.find((a) => a.kind === "TOKEN_MAPPING")!; const candidate = items.find((a) => a.kind === "CANDIDATE")!;
      const mapBefore = await r.objects.read(mapping); const candidateBefore = await r.objects.read(candidate);
      expect(await f.step("advance", { crash: "WRITE_VERIFICATION" })).toMatchObject({ code: 73 });
      const receiptArtifact = items.find((a) => a.kind === "VERIFICATION")!;
      const receiptBefore = await r.objects.read(receiptArtifact);
      await f.reach("SANITIZATION_VERIFIED");
      expect(await r.objects.read(mapping)).toEqual(mapBefore);
      expect(await r.objects.read(candidate)).toEqual(candidateBefore);
      expect(await r.objects.read(receiptArtifact)).toEqual(receiptBefore);
      const events = await r.recovery.audit(f.ids.jobId, r.f.actor(15).id);
      const safe = JSON.stringify(events);
      for (const value of ["Synthetic Person", "synth@example.test", "-100.2300", "tok_"]) expect(safe).not.toContain(value);
      mapBefore?.fill(0); candidateBefore?.fill(0); receiptBefore?.fill(0);
    } finally { await r.client.$disconnect(); }
  }, 120_000);
  it.each(["BEFORE_KEY", "AFTER_KEY", "BEFORE_OBJECT", "AFTER_OBJECT"])("blocks a late side effect at %s after restart/revocation and reference cleanup", async (point) => {
    const f = await fixture(); await f.reach("STAGING");
    const r = await restartFixture(f.root, f.ids);
    try {
      let interrupted = false;
      const objects = new RestartObjects(f.root, async (p) => {
        if (p !== point || interrupted) return;
        interrupted = true;
        const current = await f.status();
        const revoked = await r.recovery.fail(r.cmd(current, "DESTROYER"), "REVOKED");
        await r.recovery.cleanup(r.cmd(revoked, "DESTROYER"));
      });
      const recovery = new PrivacyRecovery(r.store, objects, r.runtime);
      const claimed = await recovery.claim(r.cmd(await f.status(), "INTAKE"));
      const { safeCsv } = await import("../unit/support/privacy-sanitization-fixtures");
      await expect(recovery.advance(r.cmd(claimed, "INTAKE"), safeCsv())).rejects.toHaveProperty("code", "AUTHORIZATION_DENIED");
      expect(interrupted).toBe(true);
      expect(await readdir(join(f.root, f.ids.jobId))).toEqual(["revoked"]);
      expect((await f.status()).cleanup).toBe("REFERENCE_CLEANED");
    } finally { await r.client.$disconnect(); }
  }, 120_000);
  it.each(["CANCELLED", "ABANDONED"] as const)("recovers %s cleanup intent after a cleanup process dies", async (failureReason) => {
    const f = await fixture(); await f.reach("SCAN_PENDING");
    expect(await f.step("cleanup", { failureReason, crash: "CLEANUP_OBJECT" })).toMatchObject({ code: 73 });
    expect((await f.status()).cleanup).toBe("PENDING");
    expect(await f.step("cleanup", { failureReason })).toMatchObject({ code: 0 });
    expect((await f.status()).cleanup).toBe("REFERENCE_CLEANED");
    expect(await readdir(join(f.root, f.ids.jobId))).toEqual(["revoked"]);
  }, 120_000);
  it("pins scanner version across restarts and refuses a replacement scanner for recorded CLEAN evidence", async () => {
    const f = await fixture(); await f.reach("SCAN_CLEAN");
    expect((await f.step("advance", { scannerVersion: "synthetic-scanner-v2" })).code).toBe(1);
    expect((await f.status()).state).toBe("SCAN_CLEAN");
  }, 120_000);
  it.each(["PARSER_FAILURE", "SANITIZATION_FAILURE"])("persists %s cleanup evidence across restart without granting verified status", async (payload) => {
    const f = await fixture(false, { payload });
    await f.reach(payload === "PARSER_FAILURE" ? "EXTRACTING" : "SANITIZING");
    expect((await f.step()).code).toBe(1);
    const failed = await f.status();
    expect(failed.state).toBe(payload === "PARSER_FAILURE" ? "FAILED" : "MANUAL_PRIVACY_REVIEW_REQUIRED");
    expect(failed.cleanup).toBe("PENDING"); expect(failed.verificationHash).toBeNull();
    expect(await f.step("cleanup")).toMatchObject({ code: 0 });
    expect((await f.status()).cleanup).toBe("REFERENCE_CLEANED");
  }, 120_000);
  it("preserves verification failure and cleanup intents when signing becomes unavailable after restart", async () => {
    const f = await fixture(); await f.reach("SANITIZATION_VERIFICATION");
    const r = await restartFixture(f.root, f.ids);
    try {
      r.runtime.signer.sign = async () => { throw new Error("SYNTHETIC_SIGNER_UNAVAILABLE"); };
      const claimed = await r.recovery.claim(r.cmd(await f.status(), "VERIFIER"));
      await expect(r.recovery.advance(r.cmd(claimed, "VERIFIER"))).rejects.toHaveProperty("code", "ADAPTER_UNAVAILABLE");
      expect(await f.status()).toMatchObject({ state: "FAILED", failure: "VERIFICATION_FAILED", cleanup: "PENDING", verificationHash: null });
      expect(await f.step("cleanup")).toMatchObject({ code: 0 });
    } finally { await r.client.$disconnect(); }
  }, 120_000);
  it("records storage failure and recovers a failed cleanup from a fresh process", async () => {
    const f = await fixture(); await f.reach("STAGING");
    const r = await restartFixture(f.root, f.ids);
    try {
      const objects = new RestartObjects(f.root, async (point) => { if (point === "BEFORE_OBJECT") throw new Error("SYNTHETIC_STORAGE_FAILURE"); });
      const recovery = new PrivacyRecovery(r.store, objects, r.runtime);
      const claimed = await recovery.claim(r.cmd(await f.status(), "INTAKE"));
      const { safeCsv } = await import("../unit/support/privacy-sanitization-fixtures");
      await expect(recovery.advance(r.cmd(claimed, "INTAKE"), safeCsv())).rejects.toHaveProperty("code", "ADAPTER_UNAVAILABLE");
      expect(await f.status()).toMatchObject({ state: "FAILED", cleanup: "PENDING" });
      objects.remove = async () => { throw new Error("SYNTHETIC_DELETE_FAILURE"); };
      expect((await recovery.cleanup(r.cmd(await f.status(), "DESTROYER"))).cleanup).toBe("RETRY");
      expect(await f.step("cleanup")).toMatchObject({ code: 0 });
      expect((await f.status()).cleanup).toBe("REFERENCE_CLEANED");
    } finally { await r.client.$disconnect(); }
  }, 120_000);
  it("bounds incomplete-stage retries rather than rescanning indefinitely", async () => {
    const f = await fixture(); const r = await restartFixture(f.root, f.ids);
    try {
      let j = await f.status();
      for (let i = 0; i < 5; i++) j = await r.recovery.claim(r.cmd(j, "INTAKE"));
      await expect(r.recovery.claim(r.cmd(j, "INTAKE"))).rejects.toHaveProperty("code", "ADAPTER_UNAVAILABLE");
      expect((await f.status()).stageAttempts).toBe(5);
    } finally { await r.client.$disconnect(); }
  }, 120_000);
  it("enforces duplicate/orphan/cross-scope inventory and immutable scan/audit constraints in PostgreSQL", async () => {
    const f = await fixture(); await f.reach("SCAN_CLEAN");
    const original = await client.privacyInventoryArtifact.findFirstOrThrow({ where: { jobId: f.ids.jobId } });
    for (const change of [{}, { jobId: randomUUID() }, { organizationId: randomUUID() }, { attemptId: randomUUID() }]) {
      await expect(client.privacyInventoryArtifact.create({ data: { ...original, id: randomUUID(), objectRef: randomUUID(),
        keyRef: randomUUID(), ...change } })).rejects.toBeInstanceOf(Error);
    }
    await expect(client.privacyInventoryArtifact.update({ where: { id: original.id }, data: { checksum: "e".repeat(64), scanHash: "e".repeat(64) } })).rejects.toBeInstanceOf(Error);
    await expect(client.privacyInventoryArtifact.update({ where: { id: original.id }, data: { scannerVersion: "rewritten" } })).rejects.toBeInstanceOf(Error);
    await expect(client.privacyAdmissionEvent.updateMany({ where: { jobId: f.ids.jobId }, data: { hash: "f".repeat(64) } })).rejects.toBeInstanceOf(Error);
    await expect(client.privacyAdmissionEvent.deleteMany({ where: { jobId: f.ids.jobId } })).rejects.toBeInstanceOf(Error);
    const child = { ...original, id: randomUUID(), objectRef: randomUUID(), keyRef: randomUUID(), kind: "EXTRACTED",
      parentId: original.id, state: "RESERVED", scan: "PENDING", scanHash: null, scannerVersion: null };
    await expect(client.privacyInventoryArtifact.createMany({ data: [child,
      { ...child, id: randomUUID(), ordinal: 1, objectRef: randomUUID(), keyRef: randomUUID(), organizationId: randomUUID() }] })).rejects.toBeInstanceOf(Error);
    expect(await client.privacyInventoryArtifact.count({ where: { jobId: f.ids.jobId, kind: "EXTRACTED" } })).toBe(0);
    await expect(client.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE jenan_privacy_process`;
      await tx.privacyAdmission.update({ where: { id: f.ids.jobId }, data: { verificationHash: "a".repeat(64) } });
    })).rejects.toBeInstanceOf(Error);
    await expect(client.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE jenan_privacy_verify`;
      await tx.privacyInventoryArtifact.update({ where: { id: original.id }, data: { state: "REVOKED" } });
    })).rejects.toBeInstanceOf(Error);
    expect(await client.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE jenan_privacy_publish`;
      return tx.privacyInventoryArtifact.count({ where: { jobId: f.ids.jobId } });
    })).toBe(0);
    expect((await f.status()).state).toBe("SCAN_CLEAN");
  }, 120_000);
  it("fails closed without regenerating a missing key for persisted encrypted RAW", async () => {
    const f = await fixture(); await f.reach("SCAN_PENDING");
    const a = await client.privacyInventoryArtifact.findUniqueOrThrow({ where: { jobId_kind_ordinal: { jobId: f.ids.jobId, kind: "ORIGINAL", ordinal: 0 } } });
    await rm(join(f.root, f.ids.jobId, `${a.keyRef}.key`));
    const result = await f.step(); expect(result.code).toBe(1);
    expect((await f.status()).state).toBe("FAILED");
    expect((await readdir(join(f.root, f.ids.jobId))).some((name) => name === `${a.keyRef}.key`)).toBe(false);
    expect(result.error).not.toContain("synth@example.test");
  }, 120_000);
  it("binds CLEAN to the exact checksum/scanner version and never completes failed scans", async () => {
    const f = await fixture(); await f.reach("SCAN_PENDING");
    expect((await f.step("advance", { scanFailure: true })).code).toBe(1);
    const j = await f.status(); expect(j.state).toBe("FAILED"); expect(j.cleanup).toBe("PENDING");
    expect(j.manifestHash).toBeNull();
    expect(await f.step("cleanup")).toMatchObject({ code: 0 });
  }, 120_000);
  it("uses explicit checkpoint enums rather than accepting unbounded parser text", () => {
    expect(recoveryStates).toContain("INTAKE_ACCEPTED"); expect(recoveryStates).toContain("SANITIZATION_VERIFICATION");
  });
});
