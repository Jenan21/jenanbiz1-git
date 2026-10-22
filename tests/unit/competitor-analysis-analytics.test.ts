import { describe, expect, it } from "vitest";
import {
  assertCompetitorAnalyticsResult, competitorAnalyses, competitorAnalyticsResultSchema, evaluateCompetitorAnalytics, normalizeCompetitorRequest,
  prepareCompetitorAnalysis, runCompetitorAnalysis, type CompetitorDataset, type CompetitorDatasetRole,
  type CompetitorRequest, type CompetitorAnalyticsResult,
} from "@/services/analysis-engines/competitor-analysis";
import { buildRunRecord, computeDeterminism, findEnvelopeViolations, runRecordSchema } from "@/services/analysis-engines/shared";
import { competitorGapCatalog } from "@/services/analysis-engines/competitor-analysis";
import { competitorCoverage, competitorEvidence, competitorInstant, competitorRequest, competitorScope, competitorValidity } from "./support/competitor-analysis-fixtures";
import { competitorDataset, competitorPortFixture, competitorReference, competitorVersionIds, selfRef } from "./support/competitor-data-fixtures";

const execution = { runId: "competitor:m3-test", evaluatedAt: competitorInstant, environment: "test" as const,
  timing: { startedAt: competitorInstant, finishedAt: competitorInstant, durationMs: 0 } };
const request = (analyses: CompetitorRequest["analyses"] = ["COUNTS", "DISTRIBUTION"]) => {
  const req = competitorRequest(); req.data.roles = {}; req.analyses = analyses; return req;
};
const run = (fixture = competitorPortFixture(15), req = request()) => runCompetitorAnalysis(fixture.port, req, execution);
const metrics = (result: CompetitorAnalyticsResult) => result.results.flatMap((section) => section.metrics);
function modify(fixture: ReturnType<typeof competitorPortFixture>, role: CompetitorDatasetRole, work: (dataset: CompetitorDataset) => void) {
  const entry = fixture.versions.get(competitorVersionIds[role])!;
  const data = JSON.parse(entry.content) as CompetitorDataset; work(data); entry.content = JSON.stringify(data);
}
const total = (result: CompetitorAnalyticsResult, unit = "UNIQUE_COMPETITOR_ENTITIES") => metrics(result).find((metric) => metric.operation === "COUNT" && metric.countingUnit === unit && metric.countBasis === "SCOPED_TOTAL")!;
const basis = {
  product: { id: "coffee-seat", version: "1" }, quantityBasis: { id: "per-location", version: "1" },
  currency: null, taxBasis: { id: "not-applicable", version: "1" }, deliveryBasis: { id: "on-site", version: "1" },
  observationWindow: { start: "2026-10-01T00:00:00.000Z", end: competitorInstant },
};
function dimensions() {
  const fixture = competitorPortFixture(4); const req = request(["DIMENSION_COMPARISON"]);
  const data = competitorDataset("competitor.attributes", 4);
  if (data.role !== "competitor.attributes") throw new Error("Fixture role");
  data.rows = [10, 20, 40].map((value, i) => ({
    ...data.rows[0]!, id: `capacity:${i}`, subjectId: `location:${i}`, value,
    evidence: [selfRef(`branch:${i}`)], comparisonBasis: structuredClone(basis),
  }));
  fixture.versions.set("attributes-1", { reference: competitorReference("competitor.attributes"), content: JSON.stringify(data) });
  modify(fixture, "competitor.dimensions", (dataset) => {
    if (dataset.role === "competitor.dimensions") dataset.rows.push({ kind: "ATTRIBUTE", definition: data.rows[0]!.definition }, { kind: "UNIT", definition: data.rows[0]!.unit });
  });
  req.parameters = { attributes: [{ id: "capacity", subjectKind: "LOCATION", definition: data.rows[0]!.definition, unit: data.rows[0]!.unit, basis: structuredClone(basis) }] };
  return { fixture, req };
}
function historical(priorSize = 10, currentSize = 15) {
  const fixture = competitorPortFixture(currentSize); const req = request(["COUNTS", "HISTORICAL_CHANGE"]);
  const asOf = "2026-10-15T12:00:00.000Z";
  req.parameters = { historical: { asOf, roles: {} } };
  for (const role of ["competitor.entities", "competitor.locations", "competitor.matching-rules", "competitor.dimensions"] as const) {
    const versionId = `old-${competitorVersionIds[role]}`; const data = competitorDataset(role, priorSize);
    if (data.role === "competitor.locations") data.inventory.scope.asOf = asOf;
    fixture.versions.set(versionId, { reference: competitorReference(role, versionId), content: JSON.stringify(data) });
    req.parameters.historical!.roles[role] = [{ versionId }];
    req.data.roles[role] = [{ versionId: competitorVersionIds[role] }];
  }
  return { fixture, req };
}

describe("Competitor M3 real deterministic descriptive execution over synthetic exact sources", () => {
  it("executes M2 first and reports one business / fifteen locations plus explicit branch share", async () => {
    const result = await run();
    expect(total(result).value).toBe(1); expect(total(result, "COMPETITOR_LOCATIONS").value).toBe(15);
    const distribution = metrics(result).find((metric) => metric.operation === "ENTITY_LOCATION_DISTRIBUTION")!;
    expect(distribution.value).toBe(15); expect(distribution.distribution).toEqual({ denominator: 15, population: "SCOPED_COMPETITOR_LOCATIONS", share: 1 });
    expect(distribution.limitations.join(" ")).toContain("not market");
    expect(result.inputs).toHaveLength(4); expect(result.preparation.current.work.reads).toBe(4);
    expect(findEnvelopeViolations(result, { catalog: competitorGapCatalog })).toEqual([]);
  });
  it("preserves strict Shared result and independent confidence compatibility", async () => {
    const result = await run();
    expect(() => assertCompetitorAnalyticsResult(result)).not.toThrow();
    expect(result.engine.version).toBe("1.0.0-m3");
    expect(metrics(result).every((metric) => metric.value === null || metric.confidence?.policyId === "competitor-confidence-v1")).toBe(true);
    expect(result.rights.allowExport).toBe(false);
    expect(result.inventory).toHaveLength(15);
    expect(result.inventory.every((row) => row.includedLocation && row.uniqueEntityEstablished)).toBe(true);
  });
  it("does not count source-record duplicates as independent branches", async () => {
    const fixture = competitorPortFixture();
    modify(fixture, "competitor.locations", (dataset) => {
      if (dataset.role === "competitor.locations") dataset.rows.push(structuredClone(dataset.rows[0]!));
    });
    const result = await run(fixture); expect(total(result, "COMPETITOR_LOCATIONS").value).toBe(1);
  });
  it("keeps null unique-business total for ambiguous entity links, while resolved locations stay usable", async () => {
    const fixture = competitorPortFixture();
    modify(fixture, "competitor.locations", (dataset) => {
      if (dataset.role === "competitor.locations") Object.assign(dataset.rows[0]!, { competitorEntityId: null, entityLinkState: "AMBIGUOUS", entityLinkEvidence: [] });
    });
    const result = await run(fixture);
    expect(total(result)).toMatchObject({ value: null, status: "NOT_COMPUTABLE" });
    expect(total(result, "COMPETITOR_LOCATIONS").value).toBe(1);
    expect(metrics(result).find((metric) => metric.operation === "ENTITY_LOCATION_DISTRIBUTION")?.value).toBeNull();
  });
  it("keeps partial totals null and exposes positive observed subset with capped confidence", async () => {
    const fixture = competitorPortFixture(3);
    modify(fixture, "competitor.locations", (dataset) => {
      if (dataset.role === "competitor.locations") { dataset.coverage.completeness = "SAMPLE"; dataset.inventory.status = "PARTIAL"; }
    });
    const result = await run(fixture);
    expect(total(result, "COMPETITOR_LOCATIONS")).toMatchObject({ value: null, status: "NOT_AVAILABLE" });
    expect(metrics(result).find((metric) => metric.operation === "COUNT" && metric.countingUnit === "COMPETITOR_LOCATIONS" && metric.countBasis === "OBSERVED_SUBSET")).toMatchObject({ value: 3, status: "PARTIAL", confidence: { band: "LOW" } });
    expect(metrics(result).find((metric) => metric.distribution)?.distribution?.population).toBe("OBSERVED_COMPETITOR_LOCATIONS");
  });
  it.each(["NONE", "PARTIAL", "UNKNOWN"] as const)("does not infer zero from %s empty coverage", async (status) => {
    const fixture = competitorPortFixture(0);
    modify(fixture, "competitor.locations", (dataset) => { if (dataset.role === "competitor.locations") { dataset.inventory.status = status; dataset.coverage.completeness = "UNKNOWN"; } });
    expect(total(await run(fixture), "COMPETITOR_LOCATIONS").value).toBeNull();
  });
  it("allows zero only with a complete supported empty inventory, and blocks division by zero", async () => {
    const result = await run(competitorPortFixture(0));
    expect(total(result, "COMPETITOR_LOCATIONS").value).toBe(0);
    expect(metrics(result).find((metric) => metric.operation === "ENTITY_LOCATION_DISTRIBUTION")).toMatchObject({ value: null, status: "NOT_COMPUTABLE" });
  });
  it.each(["missing-source", "no-geography", "bad-checksum", "broad-activity", "unknown-operation", "expired-entity"] as const)("returns truthful null outcomes for %s", async (kind) => {
    const fixture = competitorPortFixture();
    if (kind === "missing-source") fixture.versions.delete("locations-1");
    if (kind === "bad-checksum") fixture.port.read = async () => ({ status: "INTEGRITY_ERROR" });
    if (kind === "no-geography") modify(fixture, "competitor.locations", (dataset) => { dataset.coverage.geographies[0]!.code = "elsewhere"; });
    if (kind === "expired-entity") modify(fixture, "competitor.entities", (dataset) => { if (dataset.role === "competitor.entities") dataset.rows[0]!.validity.end = competitorInstant; });
    if (kind === "broad-activity" || kind === "unknown-operation") modify(fixture, "competitor.locations", (dataset) => {
      if (dataset.role === "competitor.locations") {
        if (kind === "broad-activity") dataset.rows[0]!.activitySpecificity = "BROAD";
        else { dataset.rows[0]!.operationalState = "UNKNOWN"; dataset.rows[0]!.operationalEvidence = []; }
      }
    });
    expect(total(await run(fixture)).value).toBeNull();
  });
  it("separates direct and indirect counts without adding overlapping entity counts", async () => {
    const fixture = competitorPortFixture(2); const req = request(["COUNTS"]); req.relationships = ["DIRECT", "INDIRECT"];
    modify(fixture, "competitor.dimensions", (dataset) => { if (dataset.role === "competitor.dimensions") dataset.rows.push({ kind: "ACTIVITY", definition: { ...competitorScope.activity, id: "substitute" } }); });
    modify(fixture, "competitor.locations", (dataset) => { if (dataset.role === "competitor.locations") dataset.rows[1]!.activityCodes = ["substitute"]; });
    modify(fixture, "competitor.matching-rules", (dataset) => { if (dataset.role === "competitor.matching-rules") dataset.rows.push({ ...dataset.rows[0]!, rule: { id: "indirect", version: "1" }, relationship: "INDIRECT", criterion: "DOCUMENTED_SUBSTITUTION", requiredActivityCodes: ["substitute"] }); });
    const result = await run(fixture, req);
    expect(total(result).value).toBe(1);
    const parts = metrics(result).filter((metric) => metric.operation === "RELATIONSHIP_COUNT" && metric.countingUnit === "UNIQUE_COMPETITOR_ENTITIES");
    expect(parts.map((metric) => metric.value)).toEqual([1, 1]); // One entity can have both relationships; these are not disjoint business shares.
  });
  it("retains full exact source/version/hash, records, restricted rights and attribution", async () => {
    const result = await run(); const metric = total(result);
    expect(metric.trace.inputIds).toEqual(result.inputs.map((input) => input.id));
    expect(metric.trace.sourceRecords.length).toBeGreaterThan(15);
    expect(result.inputs.every((input) => input.checksum?.value.length === 64)).toBe(true);
    expect(result.attribution[0]?.required).toBe(true); expect(result.rights.allowExport).toBe(false);
  });
  it("maps complete, covered-empty and unavailable M3 results to unchanged Shared record contracts without persistence", async () => {
    const unavailable = competitorPortFixture(); unavailable.versions.delete("locations-1");
    for (const fixture of [competitorPortFixture(2), competitorPortFixture(0), unavailable]) {
      const result = await run(fixture);
      const record = buildRunRecord(result, { actor: { kind: "SYSTEM", id: null }, createdAt: competitorInstant });
      expect(runRecordSchema.parse(record)).toEqual(record);
      expect(record.result).toEqual(result); expect(record.outputHash).toBe(result.determinism.outputHash);
      expect(record.engineVersion).toBe("1.0.0-m3");
    }
  });
  it("is deterministic under request, source record and row permutations and different run ids", async () => {
    const fixture = competitorPortFixture(3); const req = request(); const first = await run(fixture, req);
    req.analyses.reverse(); req.countingUnits.reverse();
    for (const entry of fixture.versions.values()) { const data = JSON.parse(entry.content); data.rows.reverse(); data.sourceRecords.reverse(); entry.content = JSON.stringify(data); }
    const second = await runCompetitorAnalysis(fixture.port, req, { ...execution, runId: "competitor:other" });
    expect(second.determinism).toEqual(first.determinism);
  });
});
describe("Competitor M3 observed compatible dimension samples", () => {
  it("computes min/max/median and sample missingness without imputing the missing fourth subject", async () => {
    const { fixture, req } = dimensions(); const result = await run(fixture, req);
    const byOperation = Object.fromEntries(metrics(result).map((metric) => [metric.operation, metric]));
    expect(byOperation.MIN?.value).toBe(10); expect(byOperation.MAX?.value).toBe(40); expect(byOperation.MEDIAN?.value).toBe(20);
    expect(byOperation.MEDIAN?.sample).toEqual({ eligible: 4, observed: 3, missing: 1 });
    expect(byOperation.MEDIAN?.confidence?.band).toBe("LOW");
  });
  it("averages the middle pair for an even compatible sample", async () => {
    const { fixture, req } = dimensions();
    modify(fixture, "competitor.attributes", (dataset) => { if (dataset.role === "competitor.attributes") dataset.rows.pop(); });
    expect(metrics(await run(fixture, req)).find((metric) => metric.operation === "MEDIAN")?.value).toBe(15);
  });
  it("provides side-by-side documented subject values and an explicit missing fourth subject", async () => {
    const { fixture, req } = dimensions();
    const rows = metrics(await run(fixture, req)).filter((metric) => metric.operation === "OBSERVED_ATTRIBUTE");
    expect(rows).toHaveLength(4);
    expect(rows.filter((metric) => metric.value !== null).map((metric) => metric.value).sort((a, b) => Number(a) - Number(b))).toEqual([10, 20, 40]);
    expect(rows.find((metric) => metric.locationRefs.includes("location:3"))).toMatchObject({ value: null, status: "NOT_AVAILABLE" });
    expect(rows.every((metric) => metric.evidenceClass === "OBSERVED")).toBe(true);
  });
  it.each(["unit", "currency", "tax", "product", "window", "contextual", "duplicate", "undeclared", "missing-basis", "text", "null"] as const)("does not manufacture comparable samples for %s", async (kind) => {
    const { fixture, req } = dimensions();
    if (kind === "undeclared") modify(fixture, "competitor.dimensions", (dataset) => { if (dataset.role === "competitor.dimensions") dataset.rows = dataset.rows.filter((row) => row.kind !== "UNIT"); });
    else modify(fixture, "competitor.attributes", (dataset) => {
      if (dataset.role !== "competitor.attributes") return;
      const row = dataset.rows[0]!;
      if (kind === "unit") row.unit.version = "2";
      if (kind === "currency") row.comparisonBasis!.currency = "SAR";
      if (kind === "tax") row.comparisonBasis!.taxBasis.id = "tax-inclusive";
      if (kind === "product") row.comparisonBasis!.product.id = "different-product";
      if (kind === "window") row.comparisonBasis!.observationWindow.start = "2026-10-02T00:00:00.000Z";
      if (kind === "contextual") row.evidenceClass = "CONTEXTUAL";
      if (kind === "duplicate") dataset.rows.push({ ...row, id: "another-measurement-same-subject" });
      if (kind === "missing-basis") delete row.comparisonBasis;
      if (kind === "text") row.value = "not measured";
      if (kind === "null") dataset.rows.forEach((value) => { value.value = null; });
    });
    expect(metrics(await run(fixture, req)).every((metric) => metric.value === null)).toBe(true);
  });
});
describe("Competitor M3 historical comparability and conditional capabilities", () => {
  it("calculates absolute/percentage/index from compatible exact historical snapshots", async () => {
    const { fixture, req } = historical(); const result = await run(fixture, req);
    const changes = metrics(result).filter((metric) => metric.analysis === "HISTORICAL_CHANGE" && metric.countingUnit === "COMPETITOR_LOCATIONS");
    expect(Object.fromEntries(changes.map((metric) => [metric.operation, metric.value]))).toEqual({ ABSOLUTE_CHANGE: 5, PERCENT_CHANGE: 50, INDEX: 150 });
    expect(result.inputs).toHaveLength(8);
  });
  it("allows absolute change from zero but blocks percentage/index with zero base", async () => {
    const { fixture, req } = historical(0); const result = await run(fixture, req);
    const changes = metrics(result).filter((metric) => metric.analysis === "HISTORICAL_CHANGE" && metric.countingUnit === "COMPETITOR_LOCATIONS");
    expect(changes.find((metric) => metric.operation === "ABSOLUTE_CHANGE")?.value).toBe(15);
    expect(changes.filter((metric) => metric.operation !== "ABSOLUTE_CHANGE").every((metric) => metric.value === null)).toBe(true);
  });
  it("preserves negative absolute and percentage changes without turning a listing decrease into closures", async () => {
    const { fixture, req } = historical(20, 10);
    const changes = metrics(await run(fixture, req)).filter((metric) => metric.analysis === "HISTORICAL_CHANGE" && metric.countingUnit === "COMPETITOR_LOCATIONS");
    expect(Object.fromEntries(changes.map((metric) => [metric.operation, metric.value]))).toEqual({ ABSOLUTE_CHANGE: -10, PERCENT_CHANGE: -50, INDEX: 50 });
    expect(changes.every((metric) => metric.limitations.join().includes("not evidence of openings"))).toBe(true);
  });
  it.each(["universe", "method", "rule", "partial"] as const)("blocks incompatible historical %s", async (kind) => {
    const { fixture, req } = historical(); const entry = fixture.versions.get(`old-${kind === "rule" ? "rules-1" : "locations-1"}`)!;
    const data = JSON.parse(entry.content) as CompetitorDataset;
    if (data.role === "competitor.locations") {
      if (kind === "universe") data.inventory.inventoryDefinition.version = "2";
      if (kind === "method") data.sourceRecords.forEach((record) => { record.method = { id: "different-counting", version: "1" }; });
      if (kind === "partial") { data.inventory.status = "PARTIAL"; data.coverage.completeness = "SAMPLE"; }
    }
    if (data.role === "competitor.matching-rules") data.rows[0]!.rule.version = "2";
    entry.content = JSON.stringify(data);
    expect(metrics(await run(fixture, req)).filter((metric) => metric.analysis === "HISTORICAL_CHANGE").every((metric) => metric.value === null)).toBe(true);
  });
  it("keeps missing periods explicit and does not duplicate the current snapshot as a baseline", async () => {
    const result = await run(competitorPortFixture(), request(["HISTORICAL_CHANGE"]));
    expect(metrics(result).every((metric) => metric.status === "NOT_AVAILABLE" && metric.value === null)).toBe(true);
    expect(result.preparation.baseline).toBeNull();
  });
  it("returns explicit unsupported spatial/candidate facts without geometry guesses or a winner", async () => {
    const req = request(["PROXIMITY_DENSITY", "CANDIDATE_COMPARISON"]);
    req.parameters = { candidates: [{ id: "site:a", geography: competitorScope.geography }, { id: "site:b", geography: competitorScope.geography }] };
    const result = await run(competitorPortFixture(), req);
    expect(metrics(result)).toHaveLength(4);
    expect(metrics(result).every((metric) => metric.status === "NOT_COMPUTABLE" && metric.value === null)).toBe(true);
  });
  it("checks combined historical selection budget before I/O", async () => {
    const { fixture, req } = historical();
    req.parameters!.historical!.roles["competitor.locations"] = Array.from({ length: 30 }, (_, i) => ({ versionId: `old:${i}` }));
    await expect(prepareCompetitorAnalysis(fixture.port, req, competitorInstant)).rejects.toThrow();
    expect(fixture.discover).not.toHaveBeenCalled();
  });
  it("normalizes supported parameters and rejects future or unused parameter blocks", () => {
    const req = request(); req.parameters = { historical: { asOf: competitorInstant, roles: {} } };
    expect(() => normalizeCompetitorRequest(req, competitorInstant)).toThrow();
    const dim = dimensions().req; dim.analyses = ["COUNTS"];
    expect(() => normalizeCompetitorRequest(dim, competitorInstant)).toThrow();
    expect(normalizeCompetitorRequest(request([...competitorAnalyses]), competitorInstant).normalized.analyses).toHaveLength(7);
  });
  it("rejects duplicated historical pins before any current or historical source I/O", async () => {
    const { fixture, req } = historical();
    req.parameters!.historical!.roles["competitor.locations"] = [{ versionId: "duplicate" }, { versionId: "duplicate" }];
    await expect(prepareCompetitorAnalysis(fixture.port, req, competitorInstant)).rejects.toThrow();
    expect(fixture.discover).not.toHaveBeenCalled();
  });
  it("rejects observation windows after the requested snapshot even before the trusted evaluation instant", () => {
    const { req } = dimensions(); req.scope.asOf = "2026-10-20T12:00:00.000Z";
    expect(() => normalizeCompetitorRequest(req, competitorInstant)).toThrow();
  });
});
describe("Competitor M3 output revalidation, bounds and weakest evidence", () => {
  it.each(["value", "confidence", "share", "rights", "members", "records", "extra-metric", "method"] as const)("rejects rehashed %s tampering", async (kind) => {
    const result = await run(); const metric = total(result);
    if (kind === "value") metric.value = 87;
    if (kind === "confidence") metric.confidence!.score = 99;
    if (kind === "share") metrics(result).find((value) => value.distribution)!.distribution!.share = 0.87;
    if (kind === "rights") result.rights = { allowExport: true, denials: [] };
    if (kind === "members") metric.entityRefs = ["invented:entity"];
    if (kind === "records") metric.trace.sourceRecords = [];
    if (kind === "extra-metric") result.results[0]!.metrics.push({ ...metric, key: "competitor.invented" });
    if (kind === "method") metric.trace.formula = "hidden investment score";
    result.determinism = computeDeterminism(result);
    expect(() => assertCompetitorAnalyticsResult(result)).toThrow();
  });
  it("keeps derived confidence at the weakest required source quality", async () => {
    const fixture = competitorPortFixture();
    fixture.versions.get("entities-1")!.reference.quality = { status: "MEASURED", score: 0.2, measuredAt: competitorValidity.start, method: "synthetic", methodVersion: "1", explanation: "Synthetic low quality" };
    expect(total(await run(fixture)).confidence!.factors.find((factor) => factor.key === "sourceQuality")?.points).toBe(3);
  });
  it.each(["source-binding", "prepared-identity", "withdrawn-rights", "coverage", "inventory"] as const)("rejects a rehashed %s snapshot mutation", async (kind) => {
    const result = await run(); const current = result.preparation.current;
    if (kind === "source-binding") current.sources.find((source) => source.role === "competitor.entities")!.dataset!.sourceId = "wrong-source";
    if (kind === "prepared-identity") current.evidence!.entities[0]!.label = "Invented identity";
    if (kind === "withdrawn-rights") Object.assign(current.sources.find((source) => source.role === "competitor.entities")!.reference!.rights, { allowRetrieval: false });
    if (kind === "coverage") current.coverage!.inventoryDefinition.version = "wrong-universe";
    if (kind === "inventory") result.inventory[0]!.includedLocation = false;
    result.determinism = computeDeterminism(result);
    expect(() => assertCompetitorAnalyticsResult(result)).toThrow();
  });
  it("keeps independent interleaved executions deterministic without shared mutable evidence", async () => {
    const fixture = competitorPortFixture(2); const req = request();
    const results = await Promise.all(Array.from({ length: 4 }, (_, i) => runCompetitorAnalysis(fixture.port, req, { ...execution, runId: `competitor:parallel-${i}` })));
    expect(results.every((result) => JSON.stringify(result.determinism) === JSON.stringify(results[0]!.determinism))).toBe(true);
    expect(fixture.versions.get("locations-1")!.content).toBe(JSON.stringify(competitorDataset("competitor.locations", 2)));
  });
  it("rejects the metric/output budget instead of truncating entity distributions", async () => {
    const { current } = await prepareCompetitorAnalysis(competitorPortFixture().port, request(["DISTRIBUTION"]), competitorInstant);
    const evidence = competitorEvidence(501);
    evidence.entities = evidence.locations.map((location, i) => ({
      ...evidence.entities[0]!, competitorEntityId: `entity:${i}`, evidence: location.evidence,
    }));
    evidence.locations.forEach((location, i) => { location.competitorEntityId = `entity:${i}`; });
    current.evidence = evidence; current.inputs = evidence.inputs; current.coverage = competitorCoverage(501);
    expect(() => evaluateCompetitorAnalytics(current)).toThrowError(expect.objectContaining({ code: "REQUEST_TOO_LARGE" }));
  });
  it("enforces the exact 500-metric section contract", async () => {
    const result = await run();
    result.results[0]!.metrics = Array.from({ length: 501 }, (_, i) => ({ ...total(result), key: `competitor.limit.${i}` }));
    const parsed = competitorAnalyticsResultSchema.safeParse(result);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.some((issue) => issue.code === "too_big" && issue.path.join(".") === "results.0.metrics")).toBe(true);
  });
});
