import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { DbExecutor } from "@/lib/db";
const context = vi.hoisted(() => ({ tx: null as unknown, actual: null as unknown }));
vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>(); context.actual = original.db;
  return { ...original, db: new Proxy(original.db, { get(target, key) {
    const tx = context.tx as Record<string | symbol, unknown> | null;
    if (tx && key === "$transaction") return async (callback: (executor: unknown) => Promise<unknown>) => callback(tx);
    if (tx) { const value = tx[key]; return typeof value === "function" ? value.bind(tx) : value; }
    return Reflect.get(target, key);
  } }) };
});
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { interpretRiskRetainedOutputs, prepareRiskRetainedOutputs } from "@/services/analysis-engines/risk-decision/adapters/retained-reads";
import { canonicalHash, canonicalize, omitKeys, sha256Hex } from "@/services/analysis-engines/shared/canonical";
import { computeInputsHash, computeOutputHash, computeRequestHash, engineInputSchema } from "@/services/analysis-engines/shared/contracts";
import { toRunInputRecord, type RunRecord } from "@/services/analysis-engines/shared/run-record";
import { riskCompatibilityDimensions, parseRiskReadPolicy, readRiskPointer, riskNativeManifest, type RiskReadPolicy, type RiskRunPin } from "@/services/analysis-engines/risk-decision";
import { createDataCenterItem, createDataCenterSource, createDataCenterVersion, reviewDataCenterItem, transitionDataCenterItem } from "@/services/data-center/service";
import { readDataCenterVersionContent } from "@/services/data-center/version-content";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { riskNativeRecords } from "../unit/support/risk-retained-fixtures";
import { riskFixture, riskScope, riskBasis } from "../unit/support/risk-decision-fixtures";

const enabled = process.env.DATA_CENTER_DATABASE_TESTS === "1";
const rollback = new Error("ROLLBACK_RISK_M2");
const evaluatedAt = "2026-12-01T00:00:00.000Z";
let natives: Awaited<ReturnType<typeof riskNativeRecords>>;
beforeAll(async () => { if (enabled) natives = await riskNativeRecords(); }, 30_000);
afterAll(async () => { if (enabled) await (context.actual as typeof db).$disconnect(); });
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(canonicalize(value));
const object = (value: unknown) => z.record(z.string(), z.unknown()).parse(value);
async function isolated(work: (tx: DbExecutor, actor: DataCenterActor) => Promise<void>) {
  try {
    await (context.actual as typeof db).$transaction(async (tx) => {
      context.tx = tx;
      try {
        const user = await tx.user.create({ data: { email: `risk-m2-${randomUUID()}@example.test`, status: "ACTIVE", systemRole: "ADMIN" } });
        await work(tx, { id: user.id, kind: "HUMAN", systemRole: "ADMIN" }); throw rollback;
      } finally { context.tx = null; }
    }, { timeout: 60_000, maxWait: 10_000 });
  } catch (error) {
    if (error === rollback) return;
    throw error;
  }
  throw new Error("Expected fixture transaction rollback");
}
async function publish(itemId: string, actor: DataCenterActor) {
  await transitionDataCenterItem({ itemId, status: "IN_REVIEW", reason: "Synthetic Risk M2 fixture" }, actor);
  await reviewDataCenterItem({ itemId, decision: "APPROVED", notes: "Synthetic retained evidence, no real-data acceptance" }, actor);
  await transitionDataCenterItem({ itemId, status: "APPROVED", reason: "Reviewed fixture" }, actor);
  await transitionDataCenterItem({ itemId, status: "PUBLISHED", reason: "Governed fixture" }, actor);
}
async function dataset(sourceId: string, actor: DataCenterActor, content: string) {
  const item = await createDataCenterItem({ sourceId, title: `Synthetic retained ${randomUUID()}`, typeKey: "dataset", layer: "DATA",
    content, evidenceStatus: "VERIFIED", provenance: [{ label: "Synthetic source", reference: "test:retained", kind: "SOURCE" }],
  }, actor);
  await publish(item.id, actor);
  return { item, read: await readDataCenterVersionContent({ versionId: item.version.id, expectedChecksum: item.version.checksum }, actor) };
}
function selected(result: unknown, path = ""): { pointer: string; metric: Record<string, unknown> } | null {
  if (result === null || typeof result !== "object") return null;
  if (!Array.isArray(result)) {
    const row = object(result);
    if (typeof row.key === "string" && row.unit !== undefined && row.method !== undefined) return { pointer: path, metric: row };
  }
  for (const [key, child] of Object.entries(result)) {
    const found = selected(child, `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`); if (found) return found;
  }
  return null;
}
async function fixture(tx: DbExecutor, actor: DataCenterActor, mutatePolicy?: (policy: RiskReadPolicy) => void, missing?: RiskRunPin["engineKey"]) {
  const source = await createDataCenterSource({ name: `Risk source ${randomUUID()}`, kind: "MANUAL", scope: "PLATFORM",
    owner: "Synthetic owner", license: "Internal", licenseClass: "RESTRICTED", usagePolicy: "Test only; no export", allowExport: false,
  }, actor);
  const request = riskFixture().request; request.claims = [];
  const bindings: RiskReadPolicy["runs"] = [];
  const stored: Array<{ record: RunRecord; pin: RiskRunPin; references: Map<string, Awaited<ReturnType<typeof dataset>>> }> = [];
  for (const { record: original } of natives.values()) {
    const record = structuredClone(original); record.runId = `${record.engineKey}-${randomUUID()}`;
    record.actor = { kind: "USER", id: actor.id }; record.subject = riskScope.subject;
    const references = new Map<string, Awaited<ReturnType<typeof dataset>>>();
    for (const input of record.inputs.filter((input) => input.kind === "DATA_CENTER_VERSION")) {
      const data = await dataset(source.id, actor, JSON.stringify({ syntheticOriginalRef: input.refId }));
      references.set(input.inputId, data);
      const r = data.read.reference;
      input.snapshot = engineInputSchema.parse({ ...input.snapshot, ref: { system: "DATA_CENTER", id: r.version.versionId, version: r.version.number, label: r.dataset.title },
        checksum: r.version.checksum, source: { name: r.source.name, organization: r.source.organization, url: r.source.url },
        ownership: r.ownership.ownership, license: r.rights.license, licenseClass: r.rights.licenseClass,
        usagePolicy: r.rights.usagePolicy, attribution: { required: r.rights.attribution.required, text: r.rights.attribution.text },
        allowExport: r.rights.allowExport, evidenceStatus: r.version.evidenceStatus });
    }
    record.inputs = record.inputs.map((input) => toRunInputRecord(input.snapshot));
    const rebind = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(rebind);
      if (value === null || typeof value !== "object") return value;
      const row = object(value);
      const bound = typeof row.inputId === "string" ? references.get(row.inputId) : undefined;
      return { ...Object.fromEntries(Object.entries(row).map(([key, child]) => [key, rebind(child)])),
        ...(bound && "checksum" in row ? { checksum: bound.item.version.checksum } : {}),
        ...(bound && "versionId" in row ? { versionId: bound.item.version.id } : {}),
        ...(bound && "refId" in row ? { refId: bound.item.version.id } : {}),
      };
    };
    const result = object(rebind(record.result)); result.runId = record.runId; result.inputs = record.inputs.map((input) => input.snapshot);
    record.request = object(result.request);
    const shared = riskNativeManifest[record.engineKey as RiskRunPin["engineKey"]].recipe === "SHARED_V1";
    const hashes = { requestHash: shared ? computeRequestHash(object(result.request)) : canonicalHash(result.request),
      inputsHash: shared ? computeInputsHash(record.inputs.map((input) => input.snapshot)) : canonicalHash(result.inputs),
      outputHash: shared ? computeOutputHash(result) : canonicalHash(omitKeys(result, ["determinism", "runId", "timing"])) };
    result.determinism = hashes; Object.assign(record, hashes); record.result = result;
    const key = record.engineKey as RiskRunPin["engineKey"];
    const pin: RiskRunPin = { engineKey: key, runId: record.runId, engineVersion: record.engineVersion, requestContract: record.requestContract,
      resultContract: record.resultContract, ...hashes, contentHash: canonicalHash(result), evaluatedAt: String(result.evaluatedAt) };
    const metric = selected(result);
    const unit = metric && typeof metric.metric.unit === "object" ? object(metric.metric.unit) : null;
    const money = unit?.kind === "MONEY";
    const nativeBasis = metric && metric.metric.basis ? object(metric.metric.basis) : null;
    const method = metric ? z.object({ id: z.string(), version: z.string() }).safeParse(metric.metric.method) : null;
    const basis = { ...structuredClone(riskBasis), unit: String(unit?.kind ?? metric?.metric.unit ?? "COUNT"),
      currency: money ? String(unit?.currency) : null, priceBasis: money ? String(nativeBasis?.priceBasis) : null,
      cashFlowBasis: money ? String(nativeBasis?.cashFlowBasis) : null,
      methodology: method?.success ? method.data : structuredClone(riskBasis.methodology) };
    const claim = metric ? { id: `claim-${key}`, runId: pin.runId, pointer: metric.pointer, nativeKey: String(metric.metric.key),
      scope: { ...structuredClone(riskScope), siteId: String(metric.metric.siteId ?? riskScope.siteId) }, basis,
      variant: String(metric.metric.variant ?? "base"), entityId: String(metric.metric.entityId ?? "synthetic-entity") } : null;
    const coordinates = {
      project: ["/request/subject"], site: ["/request/scope/siteId", "/request/site/id"],
      geography: ["/request/scope/geography"], sector: ["/request/scope/sector"],
      time: ["/request/basis/periods", "/request/scope/period"], scenario: ["/request/scenarios"],
      currency: ["/request/basis/currency"],
      unit: [metric ? `${metric.pointer}/unit` : "/engine/version"],
      method: [metric ? `${metric.pointer}/method` : "/engine/version"],
    };
    bindings.push({ pin, checks: riskCompatibilityDimensions.map((dimension) => {
      const pointer = coordinates[dimension].find((candidate) => readRiskPointer(result, candidate).found);
      return pointer ? {
        dimension, state: "EXACT" as const, pointer, expected: JSON.parse(canonicalize(readRiskPointer(result, pointer).value)),
        rationale: "Explicit synthetic native coordinate mapping; not production taxonomy or scope certification",
      } : { dimension, state: "NOT_APPLICABLE" as const,
        rationale: "Synthetic reviewer declares no native coordinate for this dimension; persisted subject is checked independently" };
    }), selections: metric && claim ? [{ ...claim, expectedHash: canonicalHash(metric.metric),
      method: { pointer: `${metric.pointer}/method`, expected: z.union([z.string(), z.object({ id: z.string(), version: z.string() })]).parse(metric.metric.method) } }] : [] });
    if (claim) request.claims.push(claim);
    stored.push({ record, pin, references });
  }
  request.engineSlots = stored.map(({ pin }) => ({ engineKey: pin.engineKey, state: "PINNED", runs: [pin] }));
  if (missing) {
    const entry = bindings.findIndex((binding) => binding.pin.engineKey === missing);
    const [removed] = bindings.splice(entry, 1);
    request.claims = request.claims.filter((claim) => claim.runId !== removed.pin.runId);
    request.engineSlots = request.engineSlots.map((slot) => slot.engineKey === missing
      ? { engineKey: missing, state: "MISSING", reason: "explicitly-not-provided" } : slot);
  }
  request.policy.rules = [{ id: "rule-1", operator: "PRESENT", claimId: "claim-financial-feasibility", rationale: "Preparation only, never evaluated" }];
  const policy: RiskReadPolicy = { contract: "jenan.risk-decision.read-policy/v1", policy: request.policy, scope: request.scope, runs: bindings };
  mutatePolicy?.(policy); parseRiskReadPolicy(policy);
  const policySource = await createDataCenterSource({ name: `Risk policy ${randomUUID()}`, kind: "MANUAL", scope: "PLATFORM",
    owner: "Synthetic policy reviewer", license: "Internal", licenseClass: "RESTRICTED", usagePolicy: "Approved test mappings only", allowExport: false,
  }, actor);
  const governedPolicy = await dataset(policySource.id, actor, JSON.stringify(policy));
  request.policySource = { inputId: "dc:policy-v1", sourceId: policySource.id, versionId: governedPolicy.item.version.id, checksum: governedPolicy.item.version.checksum };
  for (const entry of stored) {
    const r = entry.record;
    await tx.analysisEngineRun.create({ data: {
      runId: r.runId, engineKey: r.engineKey, engineVersion: r.engineVersion, requestContract: r.requestContract, resultContract: r.resultContract,
      environment: r.environment, status: r.status, requestHash: r.requestHash, inputsHash: r.inputsHash, outputHash: r.outputHash,
      request: json(r.request), result: json(r.result), errorCode: null, confidence: Prisma.DbNull, gaps: json(r.gaps), actorKind: "USER", actorId: actor.id,
      subject: r.subject, startedAt: new Date(r.timing.startedAt), finishedAt: new Date(r.timing.finishedAt), durationMs: r.timing.durationMs,
      costUnits: r.cost.costUnits, budgetUnits: r.cost.budgetUnits, runtime: json(r.runtime), createdAt: new Date(r.createdAt),
      inputs: { create: r.inputs.map((input) => {
        const data = entry.references.get(input.inputId); const ref = data?.read.reference;
        return { ...input, snapshot: json(input.snapshot), dataCenterVersionId: ref?.version.versionId,
          dataCenterSourceId: ref?.source.sourceId, dataCenterTypeKey: ref?.dataset.typeKey,
          contentHash: data ? (["spatial", "market-demand", "competitor-analysis"].includes(r.engineKey) ? data.item.version.checksum : sha256Hex(data.read.content)) : null,
          provenance: ref ? json({ reference: ref }) : undefined,
          usageIntent: ref ? json({ contract: "synthetic-risk-m2-input", versionId: ref.version.versionId, checksum: ref.version.checksum.value }) : undefined,
        };
      }) },
    } });
  }
  return { request, stored, source, governedPolicy,
    run: (principal = actor) => prepareRiskRetainedOutputs(request, evaluatedAt, principal),
    interpret: (principal = actor) => interpretRiskRetainedOutputs(request, evaluatedAt, principal) };
}
function enableInterpretation(policy: RiskReadPolicy) {
  policy.interpretation = {
    contract: "jenan.risk-decision.interpretation-policy/v1", method: { id: "synthetic-risk-interpretation", version: "1" },
    engineSlots: policy.runs.map((run) => ({ engineKey: run.pin.engineKey, state: "PINNED", runs: [run.pin] })),
    declaredScenarios: [],
    projections: policy.runs.flatMap((run) => run.selections.map((selection) => ({
      claimId: selection.id, kind: "DECIMAL" as const,
      estimated: "ALLOW_CONDITIONAL" as const,
      value: run.pin.engineKey === "operational-feasibility" ? "exactValue" as const : "value" as const,
      rationale: "Explicit native fixture selection; no recalculation or precision promotion",
    }))),
    findings: [{ id: "adequacy", conditionId: "condition-1", category: "OPERATIONAL", impact: null, likelihood: null,
      rationale: "Approved operational condition under the declared plan" }],
    conflicts: [], scenarios: [],
  };
}
async function tamper(tx: DbExecutor, work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRun" DISABLE TRIGGER "AnalysisEngineRun_append_only"');
  try { await work(); } finally { await tx.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRun" ENABLE TRIGGER "AnalysisEngineRun_append_only"'); }
}
describe.skipIf(!enabled)("Risk M2 governed exact retained reads on PostgreSQL", { timeout: 80_000 }, () => {
  it("reads six exact native envelopes, exposes only validated selections, and fails closed for Map/no-evidence lineage", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor); const before = [await tx.analysisEngineRun.count(), await tx.dataCenterUsage.count(), await tx.auditLog.count()];
      const output = await f.run();
      expect(output.phase).toBe("M2_EXACT_READS"); expect(output.decision).toBeNull(); expect(output.findings).toEqual([]); expect(output.conditionOutcomes).toEqual([]);
      expect(output.outcomes).toHaveLength(6);
      expect(output.outcomes.find((row) => row.runId.startsWith("financial-feasibility"))?.status).toBe("AVAILABLE");
      expect(output.outcomes.find((row) => row.runId.startsWith("operational-feasibility"))?.status).toBe("AVAILABLE");
      const map = output.outcomes.find((row) => row.runId.startsWith("spatial"));
      expect(map).toMatchObject({ status: "NOT_SUPPORTED", evidence: null });
      expect(JSON.stringify(map)).not.toMatch(/inputs|native|checksum|source|method|license/);
      expect([await tx.analysisEngineRun.count(), await tx.dataCenterUsage.count(), await tx.auditLog.count()]).toEqual(before);
      expect(await f.run()).toEqual(output);
    });
  });
  it.each(riskCompatibilityDimensions)("rejects approved-but-mismatching native %s coordinates without returning evidence", async (dimension) => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor, (policy) => {
        const checks = policy.runs.find((row) => row.pin.engineKey === "financial-feasibility")!.checks;
        const index = checks.findIndex((check) => check.dimension === dimension);
        const check = checks[index];
        checks[index] = { dimension, state: "EXACT", pointer: check.state === "EXACT" ? check.pointer : "/request/subject",
          expected: "incompatible-native-coordinate", rationale: "Synthetic explicit mismatch" };
      });
      expect((await f.run()).outcomes.find((row) => row.runId.startsWith("financial-feasibility"))).toMatchObject({ status: "INCOMPATIBLE", evidence: null });
    });
  });
  it("keeps owned-absent and other-owner runs externally indistinguishable, even when the hidden result is corrupt", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor); const foreign = await tx.user.create({ data: { email: `foreign-${randomUUID()}@example.test`, status: "ACTIVE" } });
      const viewer: DataCenterActor = { ...actor, systemRole: "USER" };
      const financial = f.stored.find((row) => row.pin.engineKey === "financial-feasibility")!;
      await tamper(tx, () => tx.analysisEngineRun.update({ where: { runId: financial.pin.runId }, data: { actorId: foreign.id, result: { secret: "hidden-content" } } }));
      const hidden = (await f.run(viewer)).outcomes.find((row) => row.runId === financial.pin.runId)!;
      expect(hidden).toEqual({ runId: financial.pin.runId, status: "UNAVAILABLE", evidence: null });
      await tx.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRun" DISABLE TRIGGER "AnalysisEngineRun_append_only"');
      await tx.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRunInput" DISABLE TRIGGER "AnalysisEngineRunInput_append_only"');
      try {
        await tx.analysisEngineRunInput.deleteMany({ where: { runId: financial.pin.runId } });
        await tx.analysisEngineRun.delete({ where: { runId: financial.pin.runId } });
      } finally {
        await tx.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRunInput" ENABLE TRIGGER "AnalysisEngineRunInput_append_only"');
        await tx.$executeRawUnsafe('ALTER TABLE "AnalysisEngineRun" ENABLE TRIGGER "AnalysisEngineRun_append_only"');
      }
      expect((await f.run(viewer)).outcomes.find((row) => row.runId === financial.pin.runId)).toEqual(hidden);
    });
  });
  it("checks current source authorization before disclosing tamper details and rechecks on every call", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor); expect((await f.run()).outcomes.some((row) => row.status === "AVAILABLE")).toBe(true);
      const target = f.stored.find((row) => row.pin.engineKey === "financial-feasibility")!;
      await tamper(tx, () => tx.analysisEngineRun.update({ where: { runId: target.pin.runId }, data: { result: { secret: "must-not-disclose-corruption" } } }));
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data: { allowRetrieval: false } });
      const output = await f.run();
      for (const row of output.outcomes) expect(row.evidence).toBeNull();
      expect(output.outcomes.find((row) => row.runId.startsWith("financial-feasibility"))?.status).toBe("UNAVAILABLE");
    });
  });
  it.each(["scope", "unit", "nativeKey", "policy"] as const)("refuses caller %s substitution against the exact approved policy", async (kind) => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor); const claim = f.request.claims.find((claim) => claim.id === "claim-financial-feasibility")!;
      if (kind === "scope") claim.scope.siteId = "unapproved-site";
      if (kind === "unit") claim.basis.unit = "COUNT";
      if (kind === "nativeKey") claim.nativeKey = "substituted-metric";
      if (kind === "policy") f.request.policy.method.version = "unapproved-version";
      expect(await f.run()).toMatchObject({ status: "INCOMPATIBLE", outcomes: [], decision: null });
    });
  });
  it("does not use stale retained rights after current source licensing changes", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor);
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data: { usagePolicy: "Current use requires a new authorization review" } });
      expect((await f.run()).outcomes.find((row) => row.runId.startsWith("financial-feasibility")))
        .toMatchObject({ status: "UNAVAILABLE", evidence: null });
    });
  });
  it("keeps an unavailable policy and a nonexistent exact policy indistinguishable without returning run metadata", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor);
      await tx.dataCenterSource.update({ where: { id: f.governedPolicy.read.reference.source.sourceId }, data: { allowRetrieval: false } });
      const hidden = await f.run();
      expect(hidden).toMatchObject({ status: "UNAVAILABLE", outcomes: [] });
      const absent = structuredClone(f.request); absent.policySource.versionId = randomUUID();
      expect(await prepareRiskRetainedOutputs(absent, evaluatedAt, actor)).toMatchObject({ status: hidden.status, outcomes: [], decision: null });
    });
  });
  it("preserves a caller-declared missing engine without substituting its available stored run or inventing risk", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor, undefined, "market-demand"); const result = await f.run();
      expect(result.declaredMissing).toEqual(["market-demand"]);
      expect(result.outcomes).toHaveLength(5);
      expect(result.outcomes.some((row) => row.runId.startsWith("market-demand"))).toBe(false);
      expect(result.findings).toEqual([]); expect(result.decision).toBeNull();
    });
  });
  it.each(["result", "version", "hash", "subject"] as const)("rejects an authorized %s mismatch without output or substitution", async (kind) => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor); const target = f.stored.find((row) => row.pin.engineKey === "financial-feasibility")!;
      await tamper(tx, () => tx.analysisEngineRun.update({ where: { runId: target.pin.runId }, data: kind === "result" ? { result: { secret: "tampered" } }
        : kind === "version" ? { engineVersion: "latest" } : kind === "hash" ? { outputHash: "a".repeat(64) } : { subject: "other-project" } }));
      expect((await f.run()).outcomes.find((row) => row.runId === target.pin.runId)).toMatchObject({ status: kind === "subject" ? "INCOMPATIBLE" : "TAMPERED", evidence: null });
    });
  });
  it("continues reading the exact original policy version after supersession without latest fallback", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor); const original = await f.run();
      await createDataCenterVersion({ itemId: f.governedPolicy.item.id, title: "Changed", content: "not-the-pinned-policy", evidenceStatus: "ESTIMATED", reason: "Supersede" }, actor);
      await publish(f.governedPolicy.item.id, actor);
      expect(await f.run()).toEqual(original);
    });
  });
  it("M3 interprets only governed selections, retains Map exclusion, and writes no run/input/audit/usage records", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor, enableInterpretation);
      const counts = async () => [await tx.analysisEngineRun.count(), await tx.analysisEngineRunInput.count(),
        await tx.auditLog.count(), await tx.dataCenterUsage.count()];
      const before = await counts(); const preparation = await f.run(); const output = await f.interpret();
      expect(preparation.decision).toBeNull(); expect(preparation.findings).toEqual([]);
      expect(output.phase).toBe("M3_INTERPRETATION"); expect(output.decision).toBe("NOT_SUPPORTED");
      expect(output.result?.conditionOutcomes[0]?.state).toBe("SATISFIED");
      expect(output.result?.claims.some((claim) => claim.id === "claim-spatial")).toBe(false);
      expect(output.result?.coverage.find((entry) => entry.engineKey === "spatial")?.state).toBe("NOT_SUPPORTED");
      expect(output.automaticAction).toBe(false); expect(output.humanReview).toBe("REQUIRED");
      expect(await f.interpret()).toEqual(output); expect(await counts()).toEqual(before);
    });
  });
  it("M3 identifies an exact native Operational threshold failure as conditional, without inventing likelihood/severity", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor, (policy) => {
        enableInterpretation(policy);
        const claim = policy.runs.find((run) => run.pin.engineKey === "operational-feasibility")!.selections[0]!;
        policy.policy.rules = [{ id: "rule-1", operator: "GTE", claimId: claim.id,
          operand: { kind: "DECIMAL", value: "999999999999999999", basis: claim.basis }, rationale: "Explicit synthetic adequacy threshold" }];
      });
      const output = await f.interpret();
      expect(output.result?.conditionOutcomes[0]?.state).toBe("NOT_SATISFIED");
      expect(output.result?.findings[0]).toMatchObject({ kind: "CONDITIONAL_RISK", state: "CONDITIONAL",
        impact: null, likelihood: null, severity: null, severityState: "NOT_ASSESSABLE" });
      expect(output.result?.claims.find((claim) => claim.id === "claim-operational-feasibility")?.value?.kind).toBe("DECIMAL");
      expect(output.decision).toBe("NOT_SUPPORTED");
    });
  });
  it("M3 refuses a missing approved interpretation policy instead of inventing one", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor);
      expect(await f.interpret()).toMatchObject({ status: "NOT_SUPPORTED", decision: null, result: null,
        reason: "APPROVED_INTERPRETATION_POLICY_REQUIRED" });
    });
  });
  it("M3 reauthorizes every call and returns no interpretation when current source access is withdrawn", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor, enableInterpretation); expect((await f.interpret()).result).not.toBeNull();
      await tx.dataCenterSource.update({ where: { id: f.source.id }, data: { allowRetrieval: false } });
      expect(await f.interpret()).toMatchObject({ status: "REJECTED", decision: null, result: null });
    });
  });
  it("M3 continues using the original governed interpretation policy after supersession", async () => {
    await isolated(async (tx, actor) => {
      const f = await fixture(tx, actor, enableInterpretation); const original = await f.interpret();
      await createDataCenterVersion({ itemId: f.governedPolicy.item.id, title: "Superseding interpretation policy", content: "not-an-interpretation-policy",
        evidenceStatus: "ESTIMATED", reason: "Superseding fixture" }, actor);
      await publish(f.governedPolicy.item.id, actor);
      expect(await f.interpret()).toEqual(original);
    });
  });
});
