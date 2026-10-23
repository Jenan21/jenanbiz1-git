import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { classifyHeader, detectValue, parseTable } from "@/services/privacy-gateway/sanitization/classification";
import { analyticalKinds, datasetSchema, m3AuditSchema } from "@/services/privacy-gateway/sanitization/contracts";
import { privacyPolicyContentHash } from "@/services/privacy-gateway/policy";
import { EphemeralIntake } from "@/services/privacy-gateway/intake/staging";
import { initialIntakeLimits } from "@/services/privacy-gateway/intake/contracts";
import { emptyMapping, sanitizeTables } from "@/services/privacy-gateway/sanitization/transform";
import { verifyTables } from "@/services/privacy-gateway/sanitization/verifier";
import { PrivacySanitization, receiptPayload } from "@/services/privacy-gateway/sanitization/service";
import { csv, storedZip } from "./support/privacy-intake-fixtures";
import { privacyEnd, privacyId } from "./support/privacy-gateway-fixtures";
import { safeCsv, sanitizationFixture } from "./support/privacy-sanitization-fixtures";

const supported = [
  ["person_name", "PERSON", "TOKENIZE"], ["owner_name", "OWNER", "TOKENIZE"], ["delegate_name", "DELEGATE", "TOKENIZE"],
  ["signatory_name", "SIGNATORY", "TOKENIZE"], ["national_id", "NATIONAL_ID", "REMOVE"], ["iqama", "NATIONAL_ID", "REMOVE"],
  ["phone", "PHONE", "REMOVE"], ["email", "EMAIL", "REMOVE"], ["iban", "IBAN", "REMOVE"], ["bank_account", "BANK_ACCOUNT", "REMOVE"],
  ["payment_card", "PAYMENT_CARD", "REMOVE"], ["signature", "SIGNATURE", "REMOVE"], ["stamp", "STAMP", "REMOVE"],
  ["qr_payload", "QR", "REMOVE"], ["barcode_payload", "BARCODE", "REMOVE"], ["exact_address", "ADDRESS", "REMOVE"],
  ["account_id", "ACCOUNT_ID", "TOKENIZE"], ["user_id", "ACCOUNT_ID", "TOKENIZE"],
  ["document_metadata", "METADATA", "REMOVE"], ["embedded_identifier", "METADATA", "REMOVE"], ["business_id", "BUSINESS_ID", "REMOVE"],
] as const;
const randomToken = () => randomBytes(32).toString("hex");
function transformed(bytes: Uint8Array = safeCsv()) {
  const f = sanitizationFixture();
  const artifacts = [{ id: privacyId(700), bytes }];
  return { ...f, artifacts, ...sanitizeTables(f.job, artifacts, emptyMapping(f.job), randomToken) };
}
describe("M3 explicit classification and detection capabilities", () => {
  it.each(supported)("classifies %s as %s with %s", (header, kind, action) => {
    expect(classifyHeader(header)).toEqual({ kind, action, sensitivity: "IDENTIFIER", required: false, confidence: "EXACT_SCHEMA" });
  });
  it.each(analyticalKinds)("keeps required analytical %s", (header) => {
    expect(classifyHeader(header)).toMatchObject({ kind: header, action: "KEEP", required: true, confidence: "EXACT_SCHEMA" });
  });
  it.each(["notes", "location", "__proto__", "Name", "unknown_identifier", "hidden_xml"])("uncertain unknown %s", (header) => {
    expect(classifyHeader(header)).toMatchObject({ action: "REVIEW", confidence: "AMBIGUOUS" });
  });
  it.each([
    ["synthetic@example.test", "EMAIL"], ["+966 50 123 4567", "PHONE"], ["1234567890", "NATIONAL_ID"],
    ["SA0380000000608010167519", "IBAN"], ["4111111111111111", "PAYMENT_CARD"],
    ["<hidden>synthetic</hidden>", "EMBEDDED"], ["=HYPERLINK(\"x\")", "EMBEDDED"],
  ])("detects supported pattern %s", (value, kind) => expect(detectValue(value)).toContain(kind));
  it("supports Arabic explicit name/identity headers without claiming NER", () => {
    expect(classifyHeader("الاسم").kind).toBe("PERSON"); expect(classifyHeader("الهوية").kind).toBe("NATIONAL_ID");
  });
  it("rejects ambiguous duplicate semantic columns", () => {
    expect(() => parseTable(csv("account_id,user_id,amount\na,b,1"))).toThrow("AMBIGUOUS_VALUE");
  });
});
describe("M3 allowlist sanitization and exact preservation", () => {
  it("builds only structured allowlist output and no original sensitive fields", () => {
    const f = transformed();
    expect(datasetSchema.safeParse(f.dataset).success).toBe(true);
    const encoded = JSON.stringify(f.dataset);
    expect(encoded).not.toMatch(/Synthetic Person|synth@example|person_name|email|original/);
    expect(f.dataset.anonymous).toBe(false);
    expect(verifyTables(f.job, f.artifacts, f.dataset, f.mapping).preservedCells).toBe(18);
  });
  it.each(supported.filter(([, , action]) => action === "REMOVE"))("removes the complete supported %s representation", (header) => {
    const f = transformed(csv(`amount,${header}\n1,synthetic-secret\n1,synthetic-secret\n1,synthetic-secret`));
    expect(JSON.stringify(f.dataset)).not.toContain("synthetic-secret");
    expect(verifyTables(f.job, f.artifacts, f.dataset, f.mapping).rows).toBe(3);
  });
  it.each(analyticalKinds)("preserves %s strings with row association", (kind) => {
    const values = kind === "date" ? ["2026-10-01", "2026-10-01", "2026-10-01"] :
      kind === "period" ? ["2026-10", "2026-10", "2026-10"] :
      kind === "unit" ? ["KG", "KG", "KG"] : kind === "currency" ? ["SAR", "SAR", "SAR"] :
      kind === "category" ? ["RENT", "RENT", "RENT"] : ["-100.2300", "+20.0001", "0.00000001"];
    const other = kind === "amount" ? "quantity" : "amount";
    const f = transformed(csv(`${kind},${other}\n${values.map((value, i) => `${value},${i + 1}`).join("\n")}`));
    expect(f.dataset.rows.map((row) => row.values[kind])).toEqual(values);
    expect(f.dataset.rows.map((row) => row.row)).toEqual([1, 2, 3]);
    // Exact preservation is demonstrated above; unique analytical combinations still require review.
    expect(() => verifyTables(f.job, f.artifacts, f.dataset, f.mapping)).toThrow("QUASI_IDENTIFIER_COMBINATION");
  });
  it.each(["synthetic@example.test", "1234567890", "SA0380000000608010167519", "1e8", "1,000", "NaN", " 1 ", "2026-02-30"])(
    "does not distort ambiguous required value %s", (value) => {
      expect(() => transformed(csv(`amount,quantity\n"${value}",1`))).toThrow();
    });
  it("rejects identity-carrying free text accounting category", () => {
    expect(() => transformed(csv("amount,category\n10,Synthetic Person A office"))).toThrow("FREE_TEXT");
  });
  it("rejects unknown fields rather than silently passing through", () => {
    expect(() => transformed(csv("amount,notes\n1,secret-name"))).toThrow("UNKNOWN_FIELD");
  });
  it("strict output schema rejects RAW fields", () => {
    const f = transformed(); expect(datasetSchema.safeParse({ ...f.dataset, raw: "secret" }).success).toBe(false);
    expect(datasetSchema.safeParse({ ...f.dataset, rows: [{ ...f.dataset.rows[0], filename: "secret" }] }).success).toBe(false);
  });
  it("preserves CSV quoted decimal values without conversion", () => {
    const f = transformed(csv('amount,quantity\n"-0.000",1\n"+1.0000",2\n"99.0100",3'));
    expect(f.dataset.rows.map((row) => row.values.amount)).toEqual(["-0.000", "+1.0000", "99.0100"]);
  });
});
describe("M3 package-local opaque tokens and independent reconstruction", () => {
  it("reuses one random token for exact repeated identity within package", () => {
    const f = transformed(); const tokens = f.dataset.rows.map((row) => row.links[0].token);
    expect(new Set(tokens).size).toBe(1); expect(tokens[0]).toMatch(/^tok_[a-f0-9]{64}$/);
    expect(f.mapping.taint).toBe("RAW"); expect(f.mapping.entries).toHaveLength(1);
  });
  it("does not reuse tokens across packages or clients", () => {
    const first = transformed();
    for (const field of ["packageId", "clientId"] as const) {
      const job = structuredClone(first.job); job.scope[field] = privacyId(field === "clientId" ? 901 : 902);
      const next = sanitizeTables(job, first.artifacts, emptyMapping(job), randomToken);
      expect(next.dataset.rows[0].links[0].token).not.toBe(first.dataset.rows[0].links[0].token);
    }
  });
  it("maintains tokens across multiple artifacts in same package", () => {
    const f = transformed(); const out = sanitizeTables(f.job, [{ id: privacyId(701), bytes: safeCsv() }], f.mapping, randomToken);
    expect(out.dataset.rows[0].links[0].token).toBe(f.dataset.rows[0].links[0].token);
  });
  it("rejects cross-package mapping reuse", () => {
    const f = transformed(); f.mapping.scope.packageId = privacyId(999);
    expect(() => verifyTables(f.job, f.artifacts, f.dataset, f.mapping)).toThrow("TOKEN_SCOPE_MISMATCH");
  });
  it.each(["amount", "date", "currency", "unit", "period"] as const)("detects changed analytical %s", (kind) => {
    const f = transformed(); f.dataset.rows[0].values[kind] = "changed";
    expect(() => verifyTables(f.job, f.artifacts, f.dataset, f.mapping)).toThrow("EXACT_PRESERVATION_FAILED");
  });
  it("detects row reordering and broken association", () => {
    const f = transformed(); f.dataset.rows.reverse();
    expect(() => verifyTables(f.job, f.artifacts, f.dataset, f.mapping)).toThrow("EXACT_PRESERVATION_FAILED");
  });
  it("rejects incomplete artifact/row coverage", () => {
    const f = transformed(); f.dataset.rows.pop();
    expect(() => verifyTables(f.job, f.artifacts, f.dataset, f.mapping)).toThrow("INCOMPLETE_COVERAGE");
    expect(() => verifyTables(f.job, [], f.dataset, f.mapping)).toThrow("INCOMPLETE_COVERAGE");
  });
  it("detects mismatched policy/version and fence", () => {
    const f = transformed(); f.dataset.pins.classification.version = "2.0.0";
    expect(() => verifyTables(f.job, f.artifacts, f.dataset, f.mapping)).toThrow("POLICY_MISMATCH");
    f.dataset.pins = structuredClone(f.job.pins); f.dataset.fence++;
    expect(() => verifyTables(f.job, f.artifacts, f.dataset, f.mapping)).toThrow("STALE_ATTEMPT");
  });
  it("fails closed on unique quasi-identifier combinations", () => {
    const f = transformed(csv("amount,date\n1,2026-10-01\n2,2026-10-02\n3,2026-10-03"));
    expect(() => verifyTables(f.job, f.artifacts, f.dataset, f.mapping)).toThrow("QUASI_IDENTIFIER_COMBINATION");
  });
  it("fails closed on rare token-linked records", () => {
    const f = transformed(csv("person_name,amount\nSynthetic A,1\nSynthetic B,1\nSynthetic C,1"));
    expect(() => verifyTables(f.job, f.artifacts, f.dataset, f.mapping)).toThrow("RARE_TOKEN_LINK");
  });
  it("does not claim universal detection of arbitrary names", () => {
    expect(detectValue("Synthetic Unknown Person")).toEqual([]);
    expect(classifyHeader("notes").action).toBe("REVIEW");
  });
});
describe("M3 independent service and encrypted mapping lifecycle", () => {
  it("runs actual M2 RAW_READY to independent SANITIZATION_VERIFIED without publication", async () => {
    const f = sanitizationFixture(); await f.receive();
    expect((await f.service.sanitize(f.job, f.sanitizer.id)).processing).toBe("SANITIZATION_VERIFICATION");
    expect(f.encrypted.size).toBe(3); expect(f.expiry).toHaveLength(1);
    for (const cipher of f.encrypted.values()) expect(Buffer.from(cipher.body).includes(Buffer.from("Synthetic Person"))).toBe(false);
    expect((await f.service.verify(f.job, f.verifier.id)).processing).toBe("SANITIZATION_VERIFIED");
    const out = await f.service.verified(f.job, f.verifier.id);
    const { signature, ...unsigned } = out.receipt;
    expect(await f.signer.verify(receiptPayload(unsigned, out.evidence), signature)).toBe(true);
    expect(out.receipt.actorId).toBe(f.verifier.id); expect(out.evidence.artifacts).toBe(1);
    expect(f.audits.find((event) => event.id === out.receipt.auditId)?.receiptId).toBe(out.receipt.id);
    expect(JSON.stringify(out)).not.toMatch(/Synthetic Person|synth@example|original|mapping/);
    expect(out.receipt).not.toHaveProperty("publication");
  });
  it("rejects self-verification even after switching role on same principal", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id);
    f.roles.set(f.sanitizer.id, f.roles.get(f.verifier.id)!.map((grant) => ({ ...grant, actorId: f.sanitizer.id })));
    await expect(f.service.verify(f.job, f.sanitizer.id)).rejects.toThrow("AUTHORIZATION_DENIED");
  });
  it("does not expose candidate data before verification", async () => {
    const f = sanitizationFixture(); await f.receive(); const out = await f.service.sanitize(f.job, f.sanitizer.id);
    expect(out).not.toHaveProperty("dataset");
    await expect(f.service.verified(f.job, f.verifier.id)).rejects.toThrow("VERIFICATION_FAILED");
  });
  it("unknown classification goes to explicit uncertainty/manual review", async () => {
    const f = sanitizationFixture(); await f.receive(csv("amount,notes\n1,private"));
    expect(await f.service.sanitize(f.job, f.sanitizer.id)).toMatchObject({
      failure: "SANITIZATION_UNCERTAIN", result: "MANUAL_PRIVACY_REVIEW_REQUIRED", reason: "UNKNOWN_FIELD",
    });
    await expect(f.service.verify(f.job, f.verifier.id)).rejects.toThrow("VERIFICATION_FAILED");
  });
  it("verifier uncertainty transitions to manual review and cannot be approved automatically", async () => {
    const f = sanitizationFixture(); await f.receive(csv("amount,date\n1,2026-10-01\n2,2026-10-02\n3,2026-10-03"));
    await f.service.sanitize(f.job, f.sanitizer.id);
    expect(await f.service.verify(f.job, f.verifier.id)).toMatchObject({
      processing: "MANUAL_PRIVACY_REVIEW_REQUIRED", reason: "QUASI_IDENTIFIER_COMBINATION",
    });
    await expect(f.service.verified(f.job, f.verifier.id)).rejects.toThrow("VERIFICATION_FAILED");
  });
  it("verifier/signing failure cannot claim verified and emits no provider text", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id);
    f.signer.sign = async () => { throw new Error("Synthetic Person A private key"); };
    expect((await f.service.verify(f.job, f.verifier.id)).result).toBe("MANUAL_PRIVACY_REVIEW_REQUIRED");
    expect(JSON.stringify(f.audits)).not.toMatch(/Synthetic Person|private key|@/);
  });
  it("rejects signature verification failure", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id);
    f.signer.verify = async () => false;
    expect((await f.service.verify(f.job, f.verifier.id)).reason).toBe("VERIFICATION_FAILED");
  });
  it("rejects current authorization revocation before commit", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id);
    const sign = f.signer.sign; f.signer.sign = async (payload) => { const signature = await sign(payload); f.revokeM3(); return signature; };
    expect((await f.service.verify(f.job, f.verifier.id)).result).not.toBe("VERIFIED");
    await expect(f.service.verified(f.job, f.verifier.id)).rejects.toThrow("AUTHORIZATION_DENIED");
  });
  it("rejects stale attempt/fence and policy inputs", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id);
    await expect(f.service.verify({ ...f.job, fence: 2 }, f.verifier.id)).rejects.toThrow("STALE_ATTEMPT");
    const job = structuredClone(f.job); job.pins.verification.version = "2.0.0";
    await expect(f.service.verify(job, f.verifier.id)).rejects.toThrow("POLICY_MISMATCH");
  });
  it("prevents concurrent duplicate processing and verification", async () => {
    const f = sanitizationFixture(); await f.receive();
    const processed = await Promise.allSettled([f.service.sanitize(f.job, f.sanitizer.id), f.service.sanitize(f.job, f.sanitizer.id)]);
    expect(processed.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    const verified = await Promise.allSettled([f.service.verify(f.job, f.verifier.id), f.service.verify(f.job, f.verifier.id)]);
    expect(verified.filter((value) => value.status === "fulfilled")).toHaveLength(1);
  });
  it("maps are part of intake RAW cleanup on cancellation/TTL, not a permanent vault", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id);
    expect(f.encrypted.size).toBe(3); await f.intake.cancel(f.job, f.actor.id);
    expect(f.encrypted.size).toBe(0); expect(f.material.size).toBe(0);
    const other = sanitizationFixture(); await other.receive(); await other.service.sanitize(other.job, other.sanitizer.id);
    other.setNow(privacyEnd); await other.intake.sweep();
    expect(other.encrypted.size).toBe(0); expect(other.material.size).toBe(0);
  });
  it("cleans plaintext callback buffers without allowing verifier mutation of stored RAW", async () => {
    const f = sanitizationFixture(); await f.receive(); let copy: Uint8Array | null = null;
    await f.intake.withReadyRaw(f.job, f.verifier.id, "VERIFIER", async (snapshot) => { copy = snapshot.artifacts[0].bytes; copy.fill(1); });
    expect(copy).not.toBeNull();
    await f.intake.withReadyRaw(f.job, f.sanitizer.id, "SANITIZER", async (snapshot) => {
      expect(new TextDecoder().decode(snapshot.artifacts[0].bytes)).toContain("Synthetic Person");
    });
  });
  it("audit failure and cleanup scheduling failure cannot produce approved output", async () => {
    const f = sanitizationFixture(); await f.receive(); f.runtime.scheduleMappingCleanup = async () => { throw new Error("sensitive queue"); };
    expect((await f.service.sanitize(f.job, f.sanitizer.id)).reason).toBe("CLEANUP_PENDING");
    const other = sanitizationFixture(); await other.receive(); await other.service.sanitize(other.job, other.sanitizer.id);
    other.runtime.audit = async () => { throw new Error("sensitive audit"); };
    await expect(other.service.verify(other.job, other.verifier.id)).rejects.toThrow(/^VERIFICATION_FAILED$/);
    await expect(other.service.verified(other.job, other.verifier.id)).rejects.toThrow("VERIFICATION_FAILED");
  });
  it("rejects implementation pin mismatch without modifying policy", () => {
    const f = sanitizationFixture(); f.policy.pins.classification.hash = "a".repeat(64);
    expect(() => new PrivacySanitization(f.intake, f.runtime, f.signer, f.policy)).toThrow("POLICY_MISMATCH");
  });
  it("never logs RAW or mapping values", async () => {
    const f = sanitizationFixture(); const log = vi.spyOn(console, "log");
    try {
      await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id); await f.service.verify(f.job, f.verifier.id);
      expect(log).not.toHaveBeenCalled();
      expect(JSON.stringify(f.audits)).not.toMatch(/Synthetic Person|synth@example|original|tok_/);
    } finally { log.mockRestore(); }
  });
  it("rejects cross-job/organization lookup and keeps concurrently processed package tokens isolated", async () => {
    const f = sanitizationFixture();
    const other = { ...structuredClone(f.job), attemptId: privacyId(600),
      scope: { organizationId: privacyId(601), clientId: privacyId(602), packageId: privacyId(603), jobId: privacyId(604) } };
    const auth = async (job: typeof f.job, actorId: string) => ({
      actor: { ...f.actor, id: actorId, active: true },
      grants: (f.roles.get(actorId) ?? []).map((grant) => ({ ...grant, scope: job.scope })),
    });
    f.runtime.currentAuthorization = auth; // M3 and M2 both use current scoped grants.
    // The intake runtime is a separate adapter instance.
    const intakeRuntime = {
      ...f.runtime, scheduleExpiry: async () => {}, enqueueCleanup: async () => {},
    };
    const intake = new EphemeralIntake(intakeRuntime, f.storage, f.keys, f.scanner, f.policy);
    const service = new PrivacySanitization(intake, f.runtime, f.signer, f.policy);
    await Promise.all([intake.receive(f.job, f.actor.id, safeCsv(), { extension: "csv", mime: "text/csv" }),
      intake.receive(other, f.actor.id, safeCsv(), { extension: "csv", mime: "text/csv" })]);
    await Promise.all([service.sanitize(f.job, f.sanitizer.id), service.sanitize(other, f.sanitizer.id)]);
    const verified = await Promise.all([service.verify(f.job, f.verifier.id), service.verify(other, f.verifier.id)]);
    expect(verified.every((value) => value.result === "VERIFIED")).toBe(true);
    const first = await service.verified(f.job, f.verifier.id); const second = await service.verified(other, f.verifier.id);
    expect(first.dataset.rows[0].links[0].token).not.toBe(second.dataset.rows[0].links[0].token);
    await expect(service.verified({ ...other, scope: { ...other.scope, jobId: f.job.scope.jobId } }, f.verifier.id)).rejects.toThrow("AUTHORIZATION_DENIED");
  });
  it("rejects a second job for an already-bound package instead of inventing mapping migration", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id);
    const other = { ...f.job, scope: { ...f.scope, jobId: privacyId(667) } };
    f.runtime.currentAuthorization = async (job, actorId) => ({
      actor: { ...f.actor, id: actorId }, grants: (f.roles.get(actorId) ?? []).map((grant) => ({ ...grant, scope: job.scope })),
    });
    await expect(f.service.sanitize(other, f.sanitizer.id)).rejects.toThrow("STALE_ATTEMPT");
  });
  it("does not trust caller-supplied TTL when reading verified data", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id); await f.service.verify(f.job, f.verifier.id);
    f.setNow(privacyEnd);
    const forged = { ...f.job, createdAt: privacyEnd, updatedAt: privacyEnd, rawExpiresAt: "2026-10-25T04:00:00.000Z" };
    await expect(f.service.verified(forged, f.verifier.id)).rejects.toThrow("AUTHORIZATION_DENIED");
  });
  it("returns immutable copies, never writable stored candidate or receipt references", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id); await f.service.verify(f.job, f.verifier.id);
    const first = await f.service.verified(f.job, f.verifier.id); first.dataset.rows[0].values.amount = "999"; first.receipt.artifactHash = "0".repeat(64);
    const second = await f.service.verified(f.job, f.verifier.id);
    expect(second.dataset.rows[0].values.amount).toBe("-100.2300"); expect(second.receipt.artifactHash).not.toBe("0".repeat(64));
  });
  it.each(["extraction", "classification", "tokenization", "verification"] as const)("rejects mismatched implemented %s pin", (kind) => {
    const f = sanitizationFixture(); f.policy.pins[kind].version = "2.0.0";
    f.policy.pins.sanitization.hash = privacyPolicyContentHash(f.policy);
    expect(() => new PrivacySanitization(f.intake, f.runtime, f.signer, f.policy)).toThrow("POLICY_MISMATCH");
  });
  it("rejects intake policy substitution even when job pins claim the approved extraction", async () => {
    const f = sanitizationFixture();
    const intakeRuntime = { ...f.runtime, scheduleExpiry: async () => {}, enqueueCleanup: async () => {} };
    const intake = new EphemeralIntake(intakeRuntime, f.storage, f.keys, f.scanner, f.policy, { ...initialIntakeLimits, cells: 1000 });
    const service = new PrivacySanitization(intake, f.runtime, f.signer, f.policy);
    await intake.receive(f.job, f.actor.id, safeCsv(), { extension: "csv", mime: "text/csv" });
    expect((await service.sanitize(f.job, f.sanitizer.id)).reason).toBe("POLICY_MISMATCH");
  });
  it("binds coverage evidence to the receipt signature", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id); await f.service.verify(f.job, f.verifier.id);
    const out = await f.service.verified(f.job, f.verifier.id); const { signature, ...unsigned } = out.receipt;
    out.evidence.rows++;
    expect(await f.signer.verify(receiptPayload(unsigned, out.evidence), signature)).toBe(false);
  });
  it("fails if encrypted RAW or mapping integrity is tampered", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id);
    const last = [...f.encrypted.values()].at(-1)!; last.body[0] ^= 1;
    expect((await f.service.verify(f.job, f.verifier.id)).result).toBe("MANUAL_PRIVACY_REVIEW_REQUIRED");
    await expect(f.service.verified(f.job, f.verifier.id)).rejects.toThrow("VERIFICATION_FAILED");
  });
  it("rejects partial signed output if authorization changes in final audit callback", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id);
    const audit = f.runtime.audit; f.runtime.audit = async (event) => { await audit(event); if (event.stage === "VERIFY") f.revokeM3(); };
    expect((await f.service.verify(f.job, f.verifier.id)).result).not.toBe("VERIFIED");
    await expect(f.service.verified(f.job, f.verifier.id)).rejects.toThrow("AUTHORIZATION_DENIED");
  });
  it("has a strict content-free M3 audit contract", async () => {
    const f = sanitizationFixture(); await f.receive(); await f.service.sanitize(f.job, f.sanitizer.id);
    expect(f.audits.every((event) => m3AuditSchema.safeParse(event).success)).toBe(true);
    expect(m3AuditSchema.safeParse({ ...f.audits[0], original: "synthetic@example.test" }).success).toBe(false);
    expect(m3AuditSchema.safeParse({ ...f.audits[0], reason: "private person" }).success).toBe(false);
  });
  it("rejects mapping storage to a verifier or stale attempt", async () => {
    const f = sanitizationFixture(); await f.receive();
    await expect(f.intake.stageTokenMapping(f.job, f.verifier.id, csv())).rejects.toThrow("AUTHORIZATION_DENIED");
    await expect(f.intake.stageTokenMapping({ ...f.job, fence: 2 }, f.sanitizer.id, csv())).rejects.toThrow("AUTHORIZATION_DENIED");
  });
  it("fences an encrypted RAW read when current grants change", async () => {
    const f = sanitizationFixture(); await f.receive(); const open = f.keys.open;
    f.keys.open = async (handle, cipher, binding) => { const bytes = await open(handle, cipher, binding); f.revokeM3(); return bytes; };
    expect((await f.service.sanitize(f.job, f.sanitizer.id)).result).toBe("MANUAL_PRIVACY_REVIEW_REQUIRED");
    expect(f.encrypted.size).toBe(2);
  });
  it("rejects aggregate M3 source resource overflow before processing", () => {
    const f = transformed(); const artifacts = Array.from({ length: 5 }, (_, n) => ({
      id: privacyId(400 + n), bytes: new Uint8Array(30_000),
    }));
    expect(() => sanitizeTables(f.job, artifacts, emptyMapping(f.job), randomToken)).toThrow("RESOURCE_LIMIT");
    expect(() => verifyTables(f.job, artifacts, f.dataset, f.mapping)).toThrow("RESOURCE_LIMIT");
  });
  it("rejects duplicate mapping token substitution", () => {
    const f = transformed(); f.mapping.entries.push({ ...f.mapping.entries[0], original: "Other Synthetic" });
    expect(() => verifyTables(f.job, f.artifacts, f.dataset, f.mapping)).toThrow("TOKEN_SCOPE_MISMATCH");
  });
  it("fails closed on an identifier-shaped integer in a required amount without changing it", () => {
    expect(() => transformed(csv("amount,quantity\n123456789,1"))).toThrow("AMBIGUOUS_VALUE");
  });
  it("verifies all qualified ZIP leaves and stable identity links across artifacts", async () => {
    const f = sanitizationFixture();
    const other = csv(new TextDecoder().decode(safeCsv()).replaceAll("synth@example.test", "second@example.test"));
    await f.intake.receive(f.job, f.actor.id, storedZip([{ name: "a.csv", bytes: safeCsv() }, { name: "b.csv", bytes: other }]),
      { extension: "zip", mime: "application/zip" });
    expect((await f.service.sanitize(f.job, f.sanitizer.id)).result).toBe("CANDIDATE");
    expect((await f.service.verify(f.job, f.verifier.id)).result).toBe("VERIFIED");
    const out = await f.service.verified(f.job, f.verifier.id);
    expect(out.evidence.artifacts).toBe(2); expect(out.evidence.rows).toBe(6);
    expect(new Set(out.dataset.rows.map((row) => row.links[0].token)).size).toBe(1);
    expect(out.dataset.rows.map((row) => row.row)).toEqual([1, 2, 3, 1, 2, 3]);
  });
});
