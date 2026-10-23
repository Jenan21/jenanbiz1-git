import { describe, expect, it, vi } from "vitest";
import { extractRaw } from "@/services/privacy-gateway/intake/archive";
import { initialIntakeLimits, intakeLimits, intakePolicyHash, type IntakeLimits } from "@/services/privacy-gateway/intake/contracts";
import { mediaOf } from "@/services/privacy-gateway/intake/formats";
import { EphemeralIntake } from "@/services/privacy-gateway/intake/staging";
import { csv, intakeFixture, storedZip } from "./support/privacy-intake-fixtures";
import { privacyEnd, privacyId } from "./support/privacy-gateway-fixtures";

const descriptor = { extension: "csv", mime: "text/csv" };
const zipDescriptor = { extension: "zip", mime: "application/zip" };
const limits = (patch: Partial<IntakeLimits> = {}) => intakeLimits({ ...initialIntakeLimits, ...patch });
const extract = (bytes: Uint8Array, patch: Partial<IntakeLimits> = {}) => extractRaw(bytes, "ZIP", limits(patch), () => 0);
function setup(patch: Partial<IntakeLimits> = {}) {
  const f = intakeFixture(); const service = new EphemeralIntake(f.runtime, f.storage, f.keys, f.scanner, f.policy, limits(patch));
  return { ...f, service, run: (bytes: Uint8Array = csv(), desc = descriptor) => service.receive(f.job, f.actor.id, bytes, desc) };
}
describe("M2 bounded format and parser eligibility", () => {
  it("pins exact limits and parser version deterministically", () => {
    expect(intakePolicyHash(limits())).toBe(intakePolicyHash(limits()));
    expect(intakePolicyHash(limits({ cells: 10 }))).not.toBe(intakePolicyHash(limits()));
  });
  it.each(Object.keys(initialIntakeLimits) as (keyof IntakeLimits)[])("cannot widen %s", (key) => {
    expect(() => limits({ [key]: initialIntakeLimits[key] + 1 })).toThrow("MALFORMED_INPUT");
  });
  it.each(["doc", "xls", "docx", "xlsx", "pdf", "jpg", "png", "webp", "exe"])("rejects unqualified %s", (extension) => {
    expect(() => mediaOf(csv(), { extension, mime: "application/octet-stream" })).toThrow("UNSUPPORTED_FILE_TYPE");
  });
  it.each([
    { extension: "zip", mime: "application/zip" }, { extension: "csv", mime: "application/pdf" },
    { extension: "csv", mime: "application/zip" },
  ])("rejects MIME/extension/signature mismatch %j", (desc) => expect(() => mediaOf(csv(), desc)).toThrow("MIME_MISMATCH"));
  it("rejects ZIP disguised as CSV", () => expect(() => mediaOf(storedZip([{ name: "x.csv" }]), descriptor)).toThrow("MIME_MISMATCH"));
  it.each(["bad", "a,b\n1", 'a,b\n"x', 'a,b\nx"y,z', 'a,b\n"x"y,z', "a,b\nx,\u0000"])("rejects malformed CSV %j", (body) => {
    expect(() => extractRaw(csv(body), "CSV", limits(), () => 0)).toThrow();
  });
  it("accepts bounded quoted CSV without business interpretation", () => {
    const bytes = csv('type,amount\r\n"rent,office",100\r\n"one""two",200');
    const out = extractRaw(bytes, "CSV", limits(), () => 0);
    expect(out[0]).toEqual({ bytes, media: "CSV", taint: "RAW_TAINTED" });
  });
  it("enforces aggregate spreadsheet-cell budget for CSV", () => {
    expect(() => extractRaw(csv(), "CSV", limits({ cells: 3 }), () => 0)).toThrow("PARSER_LIMIT_EXCEEDED");
  });
  it("enforces parser input allocation envelope", () => {
    expect(() => extractRaw(csv(), "CSV", limits({ parserMemoryBytes: 8 }), () => 0)).toThrow("PARSER_LIMIT_EXCEEDED");
  });
  it("enforces monotonic processing deadline", () => {
    let now = 0;
    expect(() => extractRaw(csv(), "CSV", limits({ processingMs: 1 }), () => now++)).toThrow("PARSER_LIMIT_EXCEEDED");
  });
});
describe("M2 hostile strict ZIP extraction", () => {
  it("extracts stored regular CSV without materializing RAW paths", () => {
    const bytes = csv(); const out = extract(storedZip([{ name: "safe/report.csv", bytes }]));
    expect(out).toHaveLength(1); expect(Uint8Array.from(out[0].bytes)).toEqual(bytes);
    expect(out[0]).toMatchObject({ media: "CSV", taint: "RAW_TAINTED" });
  });
  it.each(["../x.csv", "/x.csv", "C:/x.csv", "\\\\host\\x.csv", "a/../../x.csv", "./x.csv", "a//x.csv",
    "a\\x.csv", "a./x.csv", "CON.csv", "aux/x.csv", "x.csv ", "é.csv", "e\u0301.csv", "x\u202e.csv", "x.csv:stream",
  ])("rejects traversal/ambiguous path %s", (name) => expect(() => extract(storedZip([{ name }]))).toThrow("MALFORMED_INPUT"));
  it.each([0xa1ff, 0x61a4, 0x21a4, 0x11a4, 0xc1a4, 0x41ed])("rejects nonregular mode %s", (mode) => {
    expect(() => extract(storedZip([{ name: "x.csv", mode }]))).toThrow("MALFORMED_INPUT");
  });
  it("rejects hardlink-capable extra fields", () => expect(() => extract(storedZip([{ name: "x.csv", extra: new Uint8Array([0x0d, 0, 0, 0]) }]))).toThrow("MALFORMED_INPUT"));
  it.each([1, 0x40])("rejects password/encryption flag %s", (flags) => expect(() => extract(storedZip([{ name: "x.csv", flags }]))).toThrow("PASSWORD_PROTECTED"));
  it("rejects unqualified deflate instead of inflating a bomb", () => expect(() => extract(storedZip([{ name: "x.csv", method: 8 }]))).toThrow("UNSUPPORTED_FILE_TYPE"));
  it("rejects expansion-ratio bomb before allocation", () => expect(() => extract(storedZip([{ name: "x.csv", declaredSize: 200_000 }]))).toThrow("ARCHIVE_LIMIT_EXCEEDED"));
  it("rejects individual overflow", () => expect(() => extract(storedZip([{ name: "x.csv" }]), { individualBytes: 2 })).toThrow("ARCHIVE_LIMIT_EXCEEDED"));
  it("rejects cumulative expansion overflow", () => expect(() => extract(storedZip([{ name: "a.csv" }, { name: "b.csv" }]), { expandedBytes: 30 })).toThrow("ARCHIVE_LIMIT_EXCEEDED"));
  it("rejects file-count overflow", () => expect(() => extract(storedZip([{ name: "a.csv" }, { name: "b.csv" }]), { entries: 1 })).toThrow("ARCHIVE_LIMIT_EXCEEDED"));
  it("rejects nesting overflow", () => {
    let bytes = storedZip([{ name: "x.csv" }]);
    for (let i = 0; i < 3; i++) bytes = storedZip([{ name: "inner.zip", bytes }]);
    expect(() => extract(bytes)).toThrow("ARCHIVE_LIMIT_EXCEEDED");
  });
  it.each([["x.csv", "X.CSV"], ["x.csv", "x.csv"], ["folder.csv", "folder.csv/x.csv"]])("rejects duplicate/colliding paths %j", (...names) => {
    expect(() => extract(storedZip(names.map((name) => ({ name }))))).toThrow("DUPLICATE_ARTIFACT");
  });
  it.each([0, 1, 4, 21, 25])("rejects truncated archive length %s", (length) => {
    expect(() => extract(storedZip([{ name: "x.csv" }]).slice(0, length))).toThrow("MALFORMED_INPUT");
  });
  it("rejects bad CRC", () => {
    const zip = storedZip([{ name: "x.csv" }]); zip[35] ^= 1;
    expect(() => extract(zip)).toThrow("MALFORMED_INPUT");
  });
  it("rejects central/local header substitution", () => {
    const zip = storedZip([{ name: "x.csv" }]); zip[6] = 8;
    expect(() => extract(zip)).toThrow("MALFORMED_INPUT");
  });
  it("rejects appended payloads/polyglot bytes", () => {
    const zip = Buffer.concat([storedZip([{ name: "x.csv" }]), Buffer.from("tail")]);
    expect(() => extract(zip)).toThrow("MALFORMED_INPUT");
  });
});
describe("M2 encrypted ephemeral staging and scan boundary", () => {
  it("reaches only RAW_READY, with encrypted opaque objects and no public access API", async () => {
    const f = setup(); const result = await f.run();
    expect(result).toMatchObject({ stage: "RAW_READY", scan: "SCAN_CLEAN", entries: 1 });
    expect(f.encrypted.size).toBe(2);
    expect(f.expiry).toEqual([{ jobId: f.job.scope.jobId, attemptId: f.job.attemptId, fence: f.job.fence, expiresAt: f.job.rawExpiresAt }]);
    for (const [key, cipher] of f.encrypted) {
      expect(key).toMatch(/^[a-f0-9/-]+$/); expect(key).not.toContain("csv"); expect(Buffer.from(cipher.body).includes(Buffer.from("rent"))).toBe(false);
    }
    expect(JSON.stringify(result)).not.toMatch(/rent|category|filename|keyHandle/);
  });
  it.each(["UNAVAILABLE", "ERROR", "TIMEOUT", "UNKNOWN", "REJECTED"] as const)("fail-closes %s and cleans RAW", async (verdict) => {
    const f = setup(); f.setVerdict(verdict);
    await expect(f.run()).rejects.toThrow(verdict === "REJECTED" ? "SCAN_REJECTED" : "MALWARE_SCAN_UNAVAILABLE");
    expect(f.encrypted.size).toBe(0); expect(f.material.size).toBe(0); expect(f.cleanup).toHaveLength(1);
    const status = await f.service.status(f.job, f.actor.id);
    expect(status.stage).toBe("CLEANUP_PENDING"); expect(status).not.toHaveProperty("destructionReceipt");
  });
  it("rejects absent scanner without CLEAN fallback", async () => {
    const f = intakeFixture(); const service = new EphemeralIntake(f.runtime, f.storage, f.keys, null, f.policy);
    await expect(service.receive(f.job, f.actor.id, csv(), descriptor)).rejects.toThrow("MALWARE_SCAN_UNAVAILABLE");
    expect(f.material.size).toBe(0);
  });
  it("bounds scanner timeout and aborts", async () => {
    const f = setup({ scanMs: 5 }); let signal: AbortSignal | undefined;
    f.scanner.scan = async (_bytes, abort) => { signal = abort; return new Promise(() => {}); };
    await expect(f.run()).rejects.toThrow("MALWARE_SCAN_UNAVAILABLE"); expect(signal?.aborted).toBe(true);
    expect(f.encrypted.size).toBe(0);
  });
  it("does not expose provider exception text", async () => {
    const f = setup(); f.scanner.scan = async () => { throw new Error("secret-client@example.test RAW rent"); };
    await expect(f.run()).rejects.toThrow(/^MALWARE_SCAN_UNAVAILABLE$/);
    expect(JSON.stringify(f.cleanup)).not.toMatch(/secret|rent|@/);
  });
  it("scans extracted artifacts independently", async () => {
    const f = setup(); let calls = 0; f.scanner.scan = async () => ++calls === 1 ? "CLEAN" : "REJECTED";
    await expect(f.run(storedZip([{ name: "a.csv" }]), zipDescriptor)).rejects.toThrow("SCAN_REJECTED");
    expect(f.encrypted.size).toBe(0);
  });
  it("rejects oversize package and schedules cleanup", async () => {
    const f = setup({ packageBytes: 1 }); await expect(f.run()).rejects.toThrow("PACKAGE_LIMIT_EXCEEDED");
    expect(f.cleanup).toHaveLength(1); expect(f.encrypted.size).toBe(0);
  });
  it("cleans parser failure", async () => {
    const f = setup(); await expect(f.run(csv('a,b\n"bad'))).rejects.toThrow("MALFORMED_INPUT");
    expect(f.encrypted.size).toBe(0); expect(f.material.size).toBe(0);
  });
  it("rejects duplicate content under different archive names", async () => {
    const f = setup(); await expect(f.run(storedZip([{ name: "a.csv" }, { name: "b.csv" }]), zipDescriptor)).rejects.toThrow("DUPLICATE_ARTIFACT");
    expect(f.encrypted.size).toBe(0);
  });
  it("isolates concurrent duplicate attempts without overwrite", async () => {
    const f = setup(); const results = await Promise.allSettled([f.run(), f.run(), f.run()]);
    expect(results.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((v) => v.status === "rejected")).toHaveLength(2); expect(f.encrypted.size).toBe(2);
  });
  it("rejects stale attempt/fence", async () => {
    const f = setup(); await f.run();
    await expect(f.service.status({ ...f.job, fence: 2 }, f.actor.id)).rejects.toThrow("STALE_ATTEMPT");
    await expect(f.service.receive({ ...f.job, attemptId: privacyId(5000) }, f.actor.id, csv(), descriptor)).rejects.toThrow("STALE_ATTEMPT");
  });
  it("rejects cross-organization reads identically to absence", async () => {
    const f = setup(); await f.run();
    await expect(f.service.status({ ...f.job, scope: { ...f.scope, organizationId: privacyId(90) } }, f.actor.id)).rejects.toThrow("AUTHORIZATION_DENIED");
    await expect(f.service.status({ ...f.job, scope: { ...f.scope, jobId: privacyId(91) } }, f.actor.id)).rejects.toThrow("AUTHORIZATION_DENIED");
  });
  it("rechecks current authorization after an asynchronous scan", async () => {
    const f = setup(); f.scanner.scan = async () => { f.revoke(); return "CLEAN"; };
    await expect(f.run()).rejects.toThrow("AUTHORIZATION_DENIED"); expect(f.material.size).toBe(0);
  });
  it("enforces TTL and cleanup without claiming RAW_DESTROYED", async () => {
    const f = setup(); await f.run(); f.setNow(privacyEnd); await f.service.sweep();
    expect(f.encrypted.size).toBe(0); expect(f.material.size).toBe(0);
    expect(f.cleanup[0].reason).toBe("EXPIRED");
    await expect(f.service.status(f.job, f.actor.id)).rejects.toThrow("AUTHORIZATION_DENIED");
  });
  it("fails if TTL expires during scan", async () => {
    const f = setup(); f.scanner.scan = async () => { f.setNow(privacyEnd); return "CLEAN"; };
    await expect(f.run()).rejects.toThrow("EXPIRED"); expect(f.encrypted.size).toBe(0);
  });
  it("cleans cancellation and abandoned completed intake", async () => {
    const f = setup(); await f.run(); await f.service.cancel(f.job, f.actor.id);
    expect(f.encrypted.size).toBe(0); expect(f.cleanup[0].reason).toBe("CANCELLED");
    const other = setup(); await other.run(); await other.service.sweep("ABANDONED");
    expect(other.material.size).toBe(0); expect(other.cleanup[0].reason).toBe("ABANDONED");
  });
  it("surfaces cleanup adapter failure and permits safe retry", async () => {
    const f = setup(); await f.run(); const remove = f.storage.deleteOpaque; f.storage.deleteOpaque = async () => { throw new Error("private path"); };
    await expect(f.service.cancel(f.job, f.actor.id)).rejects.toThrow(/^CLEANUP_PENDING$/);
    expect(f.material.size).toBe(0); f.storage.deleteOpaque = remove; await f.service.sweep();
    expect(f.encrypted.size).toBe(0);
  });
  it("does not leak parser/key/storage errors into logs or safe status", async () => {
    const f = setup(); const spy = vi.spyOn(console, "log"); f.keys.create = async () => { throw new Error("secret key filename"); };
    try {
      await expect(f.run()).rejects.toThrow(/^KEY_UNAVAILABLE$/); expect(spy).not.toHaveBeenCalled();
      expect(JSON.stringify(f.cleanup)).not.toContain("secret");
    } finally { spy.mockRestore(); }
  });
  it("binds AEAD to scope and object and rejects tampering", async () => {
    const f = intakeFixture(); const handle = await f.keys.create(f.job);
    const binding = csv("opaque,context"); const cipher = await f.keys.seal(handle, csv(), binding);
    await expect(f.keys.open(handle, cipher, csv("wrong,context"))).rejects.toThrow();
    cipher.body[0] ^= 1; await expect(f.keys.open(handle, cipher, binding)).rejects.toThrow();
  });
  it("isolates parallel organizations and jobs sharing one encrypted adapter", async () => {
    const f = setup();
    const other = { ...structuredClone(f.job), scope: { organizationId: privacyId(80), clientId: privacyId(81),
      packageId: privacyId(82), jobId: privacyId(83) }, attemptId: privacyId(84) };
    f.runtime.currentAuthorization = async (job) => {
      const allowed = [f.job, other].find((item) => item.scope.jobId === job.scope.jobId);
      return { actor: { ...f.actor, active: !!allowed },
        grants: f.grants.map((grant) => ({ ...grant, scope: allowed?.scope ?? f.scope })) };
    };
    const outcomes = await Promise.all([f.run(), f.service.receive(other, f.actor.id, csv("cost,amount\ntax,200"), descriptor)]);
    expect(outcomes.map((result) => result.jobId)).toEqual([f.job.scope.jobId, other.scope.jobId]);
    expect(f.encrypted.size).toBe(4);
    await f.service.cancel(f.job, f.actor.id);
    expect(f.encrypted.size).toBe(2);
    expect([...f.encrypted.keys()].every((key) => key.startsWith(other.scope.organizationId))).toBe(true);
    expect((await f.service.status(other, f.actor.id)).stage).toBe("RAW_READY");
    await expect(f.service.status({ ...other, scope: { ...other.scope, jobId: f.job.scope.jobId } }, f.actor.id)).rejects.toThrow("AUTHORIZATION_DENIED");
  });
  it("prevents late storage writes from surviving a concurrent cancellation", async () => {
    const f = setup(); const put = f.storage.putOpaque;
    let unblock: () => void = () => {}; let entered: () => void = () => {};
    const gate = new Promise<void>((resolve) => { unblock = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    f.storage.putOpaque = async (key, cipher) => { entered(); await gate; await put(key, cipher); };
    const work = f.run(); const rejected = expect(work).rejects.toThrow();
    await ready; await f.service.cancel(f.job, f.actor.id); unblock(); await rejected;
    expect(f.encrypted.size).toBe(0); expect(f.material.size).toBe(0); expect(f.cleanup).toHaveLength(1);
  });
  it("revokes a key created after cancellation and never writes plaintext fallback", async () => {
    const f = setup(); const create = f.keys.create;
    let unblock: () => void = () => {}; let entered: () => void = () => {};
    const gate = new Promise<void>((resolve) => { unblock = resolve; });
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    f.keys.create = async (attempt) => { entered(); await gate; return create(attempt); };
    const work = f.run(); const rejected = expect(work).rejects.toThrow();
    await ready; await f.service.cancel(f.job, f.actor.id); unblock(); await rejected;
    expect(f.material.size).toBe(0); expect(f.encrypted.size).toBe(0);
  });
  it("reevaluates grants after key creation before encryption", async () => {
    const f = setup(); const create = f.keys.create; const seal = vi.spyOn(f.keys, "seal");
    f.keys.create = async (attempt) => { const key = await create(attempt); f.revoke(); return key; };
    await expect(f.run()).rejects.toThrow("AUTHORIZATION_DENIED"); expect(seal).not.toHaveBeenCalled();
    expect(f.material.size).toBe(0); expect(f.encrypted.size).toBe(0);
  });
  it("rejects publisher and missing key grants before receiving RAW", async () => {
    const f = setup();
    f.runtime.currentAuthorization = async () => ({ actor: f.actor, grants: f.grants.filter((grant) => grant.role !== "KEY_ACCESS") });
    await expect(f.run()).rejects.toThrow("AUTHORIZATION_DENIED"); expect(f.material.size).toBe(0);
  });
  it("bounds aggregate ciphertext staging budget without partial success", async () => {
    const f = setup({ stagedBytes: 40 }); await expect(f.run()).rejects.toThrow("PARSER_LIMIT_EXCEEDED");
    expect(f.encrypted.size).toBe(0); expect(f.material.size).toBe(0);
  });
  it("enforces job admission limit without evicting earlier RAW", async () => {
    const f = setup({ jobs: 1 }); await f.run();
    const other = { ...f.job, scope: { ...f.scope, jobId: privacyId(88) } };
    f.runtime.currentAuthorization = async (job) => ({ actor: f.actor, grants: f.grants.map((grant) => ({ ...grant, scope: job.scope })) });
    await expect(f.service.receive(other, f.actor.id, csv(), descriptor)).rejects.toThrow("PARSER_LIMIT_EXCEEDED");
    expect(f.encrypted.size).toBe(2);
  });
  it("bounds concurrent admission while scanner work is pending", async () => {
    const f = setup({ concurrentJobs: 1 }); let unblock: () => void = () => {}; let entered: () => void = () => {};
    const ready = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { unblock = resolve; });
    f.scanner.scan = async () => { entered(); await gate; return "CLEAN"; };
    f.runtime.currentAuthorization = async (job) => ({ actor: f.actor, grants: f.grants.map((grant) => ({ ...grant, scope: job.scope })) });
    const work = f.run(); await ready;
    const other = { ...f.job, scope: { ...f.scope, jobId: privacyId(89) } };
    try { await expect(f.service.receive(other, f.actor.id, csv(), descriptor)).rejects.toThrow("PARSER_LIMIT_EXCEEDED"); }
    finally { unblock(); }
    expect((await work).stage).toBe("RAW_READY");
  });
  it("cleans other jobs even when one TTL deletion fails", async () => {
    const f = setup(); const other = { ...f.job, scope: { ...f.scope, jobId: privacyId(89) } };
    f.runtime.currentAuthorization = async (job) => ({ actor: f.actor, grants: f.grants.map((grant) => ({ ...grant, scope: job.scope })) });
    await f.run(); await f.service.receive(other, f.actor.id, csv(), descriptor);
    const remove = f.storage.deleteOpaque;
    f.storage.deleteOpaque = async (key) => { if (key.includes(f.scope.jobId)) throw new Error("synthetic delete failure"); await remove(key); };
    f.setNow(privacyEnd); await expect(f.service.sweep()).rejects.toThrow("CLEANUP_PENDING");
    expect(f.encrypted.size).toBe(2); expect(f.material.size).toBe(0);
    expect([...f.encrypted.keys()].every((key) => key.includes(f.scope.jobId))).toBe(true);
  });
  it("enforces the total per-attempt processing deadline", async () => {
    const f = setup({ processingMs: 1, scanMs: 1 });
    f.scanner.scan = async () => { f.setNow("2026-10-23T04:00:00.002Z"); return "CLEAN"; };
    await expect(f.run()).rejects.toThrow("PARSER_LIMIT_EXCEEDED"); expect(f.material.size).toBe(0);
  });
  it("surfaces cleanup scheduling failure and retries without exposing adapter details", async () => {
    const f = setup(); await f.run(); const enqueue = f.runtime.enqueueCleanup;
    f.runtime.enqueueCleanup = async () => { throw new Error("client-sensitive-queue"); };
    await expect(f.service.cancel(f.job, f.actor.id)).rejects.toThrow(/^CLEANUP_PENDING$/);
    f.runtime.enqueueCleanup = enqueue; await f.service.sweep();
    expect(f.cleanup).toHaveLength(1); expect(f.encrypted.size).toBe(0);
  });
  it("never writes RAW when TTL cleanup cannot be scheduled", async () => {
    const f = setup(); f.runtime.scheduleExpiry = async () => { throw new Error("private queue"); };
    await expect(f.run()).rejects.toThrow(/^CLEANUP_PENDING$/);
    expect(f.encrypted.size).toBe(0); expect(f.material.size).toBe(0); expect(f.cleanup).toHaveLength(1);
  });
});
