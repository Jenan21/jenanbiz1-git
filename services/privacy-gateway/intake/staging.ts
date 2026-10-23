import {
  PrivacyError, type PrivacyJob, type SanitizationPolicy,
} from "../contracts";
import { assertPrivacyRole, privacyHash, samePrivacyValue, validatePolicy } from "../policy";
import { assertJobRawAccess, transitionPrivacyJob, validatePrivacyJob } from "../states";
import { extractRaw } from "./archive";
import {
  IntakeError, checkedId, initialIntakeLimits, intakeLimits, intakePolicyHash,
  type Attempt, type IntakeContext, type IntakeFailure, type IntakeLimits, type IntakeRuntime, type IntakeSummary,
  type KeyBoundary, type ScanBoundary, type ScanVerdict, type StagingStorage,
} from "./contracts";
import { mediaOf, type IntakeDescriptor } from "./formats";

type RecordEntry = {
  job: PrivacyJob; binding: Attempt; keys: string[]; objects: string[]; leafCount: number;
  actorId: string; revoked: boolean; busy: boolean; started: number; reservedBytes: number; cleanupScheduled: boolean; summary: IntakeSummary;
  authority?: (actorId: string, role: "INTAKE" | "SANITIZER" | "VERIFIER") => Promise<void>;
};
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

/** Non-activated reference coordinator. Only TEST_ONLY adapters are accepted in M2. */
export class EphemeralIntake {
  private readonly records = new Map<string, RecordEntry>();
  private stagedBytes = 0;
  private readonly limits: IntakeLimits;
  private readonly policy: SanitizationPolicy;
  constructor(private readonly runtime: IntakeRuntime, private readonly storage: StagingStorage,
    private readonly keys: KeyBoundary, private readonly scanner: ScanBoundary | null,
    policy: SanitizationPolicy, limits: IntakeLimits = { ...initialIntakeLimits }) {
    this.limits = intakeLimits(limits); this.policy = validatePolicy(policy);
    if (storage.qualification !== "TEST_ONLY" || keys.qualification !== "TEST_ONLY" ||
      scanner && scanner.qualification !== "TEST_ONLY") throw new IntakeError("STORAGE_UNAVAILABLE");
    for (const field of ["packageBytes", "expandedBytes", "entries", "depth", "expansionRatio"] as const) {
      if (this.limits[field] > this.policy[field]) throw new IntakeError("PARSER_LIMIT_EXCEEDED");
    }
  }
  private now() { return this.runtime.now(); }
  private async authorize(job: PrivacyJob, actorId: string, role: "INTAKE" | "SANITIZER" | "VERIFIER" = "INTAKE"): Promise<IntakeContext> {
    try {
      const context = await this.runtime.currentAuthorization(structuredClone(job), checkedId(actorId));
      if (context.actor.id !== actorId) throw new IntakeError("AUTHORIZATION_DENIED");
      assertPrivacyRole(context.actor, context.grants, role, job.scope, this.now());
      assertJobRawAccess(job, context.actor, context.grants, this.now());
      await this.records.get(job.scope.jobId)?.authority?.(actorId, role);
      return context;
    } catch { throw new IntakeError("AUTHORIZATION_DENIED"); }
  }
  private assertLive(entry: RecordEntry) {
    if (entry.revoked) throw new IntakeError(entry.summary.failure ?? "CANCELLED");
    if (this.now() >= entry.job.rawExpiresAt) throw new IntakeError("EXPIRED");
    if (Date.parse(this.now()) - entry.started >= this.limits.processingMs + this.limits.scanMs) throw new IntakeError("PARSER_LIMIT_EXCEEDED");
  }
  async bindDurableAuthority(job: PrivacyJob, actorId: string,
    authority: NonNullable<RecordEntry["authority"]>) {
    const entry = this.records.get(job.scope.jobId);
    if (!entry || !samePrivacyValue(entry.binding.scope, job.scope) ||
      entry.binding.attemptId !== job.attemptId || entry.binding.fence !== job.fence) throw new IntakeError("AUTHORIZATION_DENIED");
    if (entry.authority) return;
    await this.authorize(entry.job, actorId, "VERIFIER");
    entry.authority = authority;
  }
  private async checkpoint(entry: RecordEntry, actorId = entry.actorId, role: "INTAKE" | "SANITIZER" = "INTAKE") {
    this.assertLive(entry); const context = await this.authorize(entry.job, actorId, role); this.assertLive(entry);
    return context;
  }
  private move(entry: RecordEntry, target: "RECEIVING" | "INTAKE_VALIDATING" | "MALWARE_SCANNING" | "RAW_READY",
    context: IntakeContext) {
    entry.job = transitionPrivacyJob(entry.job, { lifecycle: "processing", target }, {
      now: this.now(), expectedRevision: entry.job.revision, expectedFence: entry.job.fence,
      attemptId: entry.job.attemptId, policyHash: privacyHash(this.policy),
    }, context.actor, context.grants, this.policy, target === "RAW_READY" ? { scanCleared: true } : {});
  }
  private objectKey(entry: RecordEntry) {
    const { organizationId, clientId, jobId } = entry.job.scope;
    return [organizationId, clientId, jobId, entry.job.attemptId, checkedId(this.runtime.id())].join("/");
  }
  private async store(entry: RecordEntry, bytes: Uint8Array, actorId = entry.actorId, role: "INTAKE" | "SANITIZER" = "INTAKE") {
    await this.checkpoint(entry, actorId, role);
    if (entry.objects.length >= 1000) throw new IntakeError("ARCHIVE_LIMIT_EXCEEDED");
    if (this.stagedBytes + bytes.length > this.limits.stagedBytes) throw new IntakeError("PARSER_LIMIT_EXCEEDED");
    this.stagedBytes += bytes.length; entry.reservedBytes += bytes.length;
    let handle: string;
    try { handle = checkedId(await this.keys.create(entry.binding)); } catch { throw new IntakeError("KEY_UNAVAILABLE"); }
    entry.keys.push(handle);
    await this.checkpoint(entry, actorId, role);
    const object = this.objectKey(entry);
    entry.objects.push(object);
    try {
      const binding = encode({ ...entry.binding, object });
      const cipher = await this.keys.seal(handle, bytes, binding);
      await this.checkpoint(entry, actorId, role);
      if (cipher.nonce.length !== 12 || cipher.tag.length !== 16 || cipher.body.length !== bytes.length) throw new IntakeError("KEY_UNAVAILABLE");
      await this.storage.putOpaque(object, cipher);
      await this.checkpoint(entry, actorId, role);
    } catch (error) {
      if (error instanceof IntakeError) throw error;
      throw new IntakeError("STORAGE_UNAVAILABLE");
    }
    return handle;
  }
  private async scan(bytes: Uint8Array): Promise<ScanVerdict> {
    if (!this.scanner) return "UNAVAILABLE";
    const controller = new AbortController(); const copy = Uint8Array.from(bytes);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.scanner.scan(copy, controller.signal),
        new Promise<ScanVerdict>((resolve) => { timer = setTimeout(() => { controller.abort(); resolve("TIMEOUT"); }, this.limits.scanMs); }),
      ]);
    } catch { return "ERROR"; }
    finally { if (timer) clearTimeout(timer); controller.abort(); copy.fill(0); }
  }
  private async cleanup(entry: RecordEntry, reason: IntakeFailure) {
    entry.revoked = true; entry.summary.stage = "CLEANUP_PENDING"; entry.summary.failure = reason;
    if (entry.summary.scan === "SCAN_PENDING") entry.summary.scan = "MALWARE_SCAN_UNAVAILABLE";
    let failed = false;
    for (const handle of entry.keys) { try { await this.keys.revoke(handle); } catch { failed = true; } }
    for (const object of entry.objects) { try { await this.storage.deleteOpaque(object); } catch { failed = true; } }
    if (!entry.cleanupScheduled) {
      try {
        await this.runtime.enqueueCleanup({ jobId: entry.job.scope.jobId, attemptId: entry.job.attemptId, fence: entry.job.fence, reason });
        entry.cleanupScheduled = true;
      } catch { failed = true; }
    }
    // No evidence of all locations, worker termination or irreversible keys: never RAW_DESTROYED.
    if (failed) throw new IntakeError("CLEANUP_PENDING");
    if (!entry.busy) { this.stagedBytes -= entry.reservedBytes; entry.reservedBytes = 0; }
  }
  async receive(rawJob: PrivacyJob, actorId: string, input: Uint8Array, descriptor: IntakeDescriptor): Promise<IntakeSummary> {
    let job: PrivacyJob;
    try { job = validatePrivacyJob(rawJob); } catch { throw new IntakeError("MALFORMED_INPUT"); }
    const initial = await this.authorize(job, actorId);
    if (!samePrivacyValue(job.pins, this.policy.pins) || job.processing !== "CREATED" ||
      job.rawInventoryCount !== 0 || Date.parse(job.rawExpiresAt) - Date.parse(job.createdAt) > this.policy.rawTtlMs) {
      throw new IntakeError("STALE_ATTEMPT");
    }
    const old = this.records.get(job.scope.jobId);
    if (old) {
      if (!samePrivacyValue(old.binding.scope, job.scope)) throw new IntakeError("AUTHORIZATION_DENIED");
      throw new IntakeError(old.binding.attemptId === job.attemptId && old.binding.fence === job.fence ? "DUPLICATE_PACKAGE" : "STALE_ATTEMPT");
    }
    if (this.records.size >= this.limits.jobs ||
      [...this.records.values()].filter((entry) => entry.busy).length >= this.limits.concurrentJobs) {
      throw new IntakeError("PARSER_LIMIT_EXCEEDED");
    }
    const entry: RecordEntry = {
      job: structuredClone(job), binding: { scope: structuredClone(job.scope), attemptId: job.attemptId, fence: job.fence },
      keys: [], objects: [], leafCount: 0, actorId, revoked: false, busy: true, started: Date.parse(this.now()), reservedBytes: 0, cleanupScheduled: false,
      summary: { jobId: job.scope.jobId, attemptId: job.attemptId, fence: job.fence,
        scan: "SCAN_PENDING", stage: "RECEIVING", bytes: 0, entries: 0, policyHash: intakePolicyHash(this.limits) },
    };
    // Synchronous claim before the first storage await isolates concurrent duplicate callers.
    this.records.set(job.scope.jobId, entry);
    let bytes: Uint8Array | undefined;
    try {
      this.move(entry, "RECEIVING", initial);
      try {
        await this.runtime.scheduleExpiry({ jobId: job.scope.jobId, attemptId: job.attemptId, fence: job.fence, expiresAt: job.rawExpiresAt });
      } catch { throw new IntakeError("CLEANUP_PENDING"); }
      if (!(input instanceof Uint8Array) || !input.length) throw new IntakeError("MALFORMED_INPUT");
      if (input.length > this.limits.packageBytes) throw new IntakeError("PACKAGE_LIMIT_EXCEEDED");
      if (input.length * 2 > this.limits.stagedBytes) throw new IntakeError("PARSER_LIMIT_EXCEEDED");
      bytes = Uint8Array.from(input); entry.summary.bytes = bytes.length;
      const originalHandle = await this.store(entry, bytes);
      this.move(entry, "INTAKE_VALIDATING", await this.checkpoint(entry)); entry.summary.stage = "VALIDATING";
      const media = mediaOf(bytes, descriptor);
      this.move(entry, "MALWARE_SCANNING", await this.checkpoint(entry)); entry.summary.stage = "SCANNING";
      const scan = await this.scan(bytes); await this.checkpoint(entry);
      entry.summary.scan = scan === "CLEAN" ? "SCAN_CLEAN" : scan === "REJECTED" ? "SCAN_REJECTED" : "MALWARE_SCAN_UNAVAILABLE";
      if (scan !== "CLEAN") throw new IntakeError(scan === "REJECTED" ? "SCAN_REJECTED" : "MALWARE_SCAN_UNAVAILABLE");
      entry.summary.stage = "EXTRACTING";
      const extracted = extractRaw(bytes, media, this.limits, () => Date.parse(this.now()));
      const seen = new Set<string>();
      for (const artifact of extracted) {
        await this.checkpoint(entry);
        // Same package key only; ephemeral fingerprints never enter audit/status/retained metadata.
        const digest = await this.keys.fingerprint(originalHandle, artifact.bytes);
        if (seen.has(digest)) throw new IntakeError("DUPLICATE_ARTIFACT");
        seen.add(digest);
        await this.checkpoint(entry);
        const verdict = await this.scan(artifact.bytes); await this.checkpoint(entry);
        if (verdict !== "CLEAN") {
          entry.summary.scan = verdict === "REJECTED" ? "SCAN_REJECTED" : "MALWARE_SCAN_UNAVAILABLE";
          throw new IntakeError(verdict === "REJECTED" ? "SCAN_REJECTED" : "MALWARE_SCAN_UNAVAILABLE");
        }
        await this.store(entry, artifact.bytes);
      }
      entry.leafCount = extracted.length;
      entry.job.rawInventoryCount = entry.objects.length;
      entry.job.rawInventoryHash = privacyHash(entry.objects.map((object, i) => ({ object, key: entry.keys[i] })));
      this.move(entry, "RAW_READY", await this.checkpoint(entry));
      entry.summary.entries = extracted.length; entry.summary.stage = "RAW_READY";
      return { ...entry.summary };
    } catch (error) {
      const code = error instanceof IntakeError ? error.code : error instanceof PrivacyError ?
        error.code === "AUTHORIZATION_DENIED" ? "AUTHORIZATION_DENIED" : "STALE_ATTEMPT" : "PARSER_FAILED";
      await this.cleanup(entry, code);
      throw new IntakeError(code);
    } finally {
      bytes?.fill(0); entry.busy = false;
      // Re-run after in-flight writes finish; earlier deletion may have raced a pending put.
      if (entry.revoked) await this.cleanup(entry, entry.summary.failure ?? "CLEANUP_PENDING");
    }
  }
  private async find(job: PrivacyJob, actorId: string) {
    await this.authorize(job, actorId);
    const entry = this.records.get(job.scope.jobId);
    if (!entry || !samePrivacyValue(entry.binding.scope, job.scope)) throw new IntakeError("AUTHORIZATION_DENIED");
    if (entry.binding.attemptId !== job.attemptId || entry.binding.fence !== job.fence) throw new IntakeError("STALE_ATTEMPT");
    return entry;
  }
  /** Trusted internal consumer boundary; never wire reader callbacks to transport input. */
  async withReadyRaw<T>(job: PrivacyJob, actorId: string, role: "SANITIZER" | "VERIFIER",
    reader: (snapshot: { job: PrivacyJob; artifacts: { id: string; bytes: Uint8Array }[];
      tokenMappings: { id: string; bytes: Uint8Array }[]; intakePolicyHash: string }) => Promise<T>): Promise<T> {
    const entry = this.records.get(job.scope.jobId);
    const check = async () => {
      try {
        if (!entry || !samePrivacyValue(entry.binding.scope, job.scope) ||
          entry.binding.attemptId !== job.attemptId || entry.binding.fence !== job.fence ||
          entry.revoked || entry.busy || entry.job.processing !== "RAW_READY") throw new IntakeError("AUTHORIZATION_DENIED");
        const current = await this.runtime.currentAuthorization(structuredClone(entry.job), checkedId(actorId));
        if (current.actor.id !== actorId) throw new IntakeError("AUTHORIZATION_DENIED");
        assertPrivacyRole(current.actor, current.grants, role, entry.job.scope, this.now());
        assertJobRawAccess(entry.job, current.actor, current.grants, this.now());
        await entry.authority?.(actorId, role);
      } catch { throw new IntakeError("AUTHORIZATION_DENIED"); }
    };
    await check();
    if (!entry) throw new IntakeError("AUTHORIZATION_DENIED");
    const artifacts: { id: string; bytes: Uint8Array }[] = [];
    const tokenMappings: { id: string; bytes: Uint8Array }[] = [];
    try {
      for (let i = 1; i < entry.objects.length; i++) {
        await check();
        const object = entry.objects[i];
        let bytes: Uint8Array;
        try {
          const cipher = await this.storage.getOpaque(object);
          await check();
          bytes = await this.keys.open(entry.keys[i], cipher, encode({ ...entry.binding, object }));
        } catch (error) {
          if (error instanceof IntakeError) throw error;
          throw new IntakeError("STORAGE_UNAVAILABLE");
        }
        (i <= entry.leafCount ? artifacts : tokenMappings).push({ id: object.slice(object.lastIndexOf("/") + 1), bytes });
        await check();
      }
      const result = await reader({ job: structuredClone(entry.job), artifacts, tokenMappings, intakePolicyHash: intakePolicyHash(this.limits) });
      await check();
      return result;
    } finally { for (const artifact of [...artifacts, ...tokenMappings]) artifact.bytes.fill(0); }
  }
  async stageTokenMapping(job: PrivacyJob, actorId: string, bytes: Uint8Array): Promise<PrivacyJob> {
    await this.authorize(job, actorId, "SANITIZER");
    const entry = this.records.get(job.scope.jobId);
    if (!entry || !samePrivacyValue(entry.binding.scope, job.scope) || entry.binding.attemptId !== job.attemptId ||
      entry.binding.fence !== job.fence || entry.busy || entry.revoked || entry.job.processing !== "RAW_READY" ||
      entry.objects.length !== entry.leafCount + 1 || bytes.length > 128 * 1024) throw new IntakeError("AUTHORIZATION_DENIED");
    entry.busy = true; entry.started = Date.parse(this.now());
    try {
      await this.store(entry, bytes, actorId, "SANITIZER");
      entry.job.rawInventoryCount = entry.objects.length;
      entry.job.rawInventoryHash = privacyHash(entry.objects.map((object, i) => ({ object, key: entry.keys[i] })));
      return structuredClone(entry.job);
    } catch {
      await this.cleanup(entry, "PARSER_FAILED");
      throw new IntakeError("CLEANUP_PENDING");
    } finally {
      entry.busy = false;
      if (entry.revoked) await this.cleanup(entry, entry.summary.failure ?? "CLEANUP_PENDING");
    }
  }
  async status(job: PrivacyJob, actorId: string): Promise<IntakeSummary> {
    const entry = await this.find(job, actorId);
    if (this.now() >= entry.job.rawExpiresAt) await this.cleanup(entry, "EXPIRED");
    return { ...entry.summary };
  }
  async cancel(job: PrivacyJob, actorId: string) { await this.cleanup(await this.find(job, actorId), "CANCELLED"); }
  async sweep(reason: "EXPIRED" | "ABANDONED" = "EXPIRED") {
    let failed = false;
    for (const entry of this.records.values()) {
      if (entry.revoked || this.now() >= entry.job.rawExpiresAt || reason === "ABANDONED" && !entry.busy) {
        try { await this.cleanup(entry, entry.summary.failure ?? reason); } catch { failed = true; }
      }
    }
    if (failed) throw new IntakeError("CLEANUP_PENDING");
  }
}
