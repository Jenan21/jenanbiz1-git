import { describe, expect, it } from "vitest";
import {
  bindOperationalDataset, operationalSourceDatasetSchema, prepareOperationalData, type OperationalSourceDataset,
} from "@/services/analysis-engines/operational-feasibility";
import { canonicalHash, omitKeys } from "@/services/analysis-engines/shared/canonical";
import { operationalContext } from "./support/operational-feasibility-fixtures";
import { operationalPortFixture } from "./support/operational-data-fixtures";

const now = operationalContext.evaluatedAt;
describe("Operational M2 exact governed dataset validation, no calculations", () => {
  it("binds exact record provenance without circular checksums and preserves deterministic rights/hashes", async () => {
    const f = operationalPortFixture(); const original = structuredClone(f.request);
    const result = await prepareOperationalData(f.port, f.request, now);
    expect(result.status).toBe("AVAILABLE"); expect(result.ready).toBe(true);
    expect(result.work).toEqual({ discoveries: 1, reads: 1, parsedRows: 7 });
    expect(f.discover).toHaveBeenCalledWith({ versionIds: [f.request.source.versionId] });
    expect(f.read).toHaveBeenCalledWith({ versionId: f.request.source.versionId, expectedChecksum: f.request.source.checksum });
    expect(result.validated!.model).toEqual(f.request.model);
    expect(result.validated!.model.values[0]!.evidence[0]).toMatchObject({ versionId: f.request.source.versionId, checksum: f.request.source.checksum, sourceRecordId: "model-record" });
    expect(result.rights.allowExport).toBe(false); expect(result.attribution[0]!.required).toBe(true);
    expect(result).not.toHaveProperty("metrics"); expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
    expect(result.determinism.outputHash).toBe(canonicalHash(omitKeys(result, ["determinism"])));
    expect(await prepareOperationalData(f.port, f.request, now)).toEqual(result); expect(f.request).toEqual(original);
  });
  it.each(["source", "checksum", "selection"] as const)("rejects exact %s mismatch before content I/O", async (kind) => {
    const f = operationalPortFixture();
    if (kind === "source") f.request.source.sourceId = "other-source";
    if (kind === "checksum") f.request.source.checksum = "b".repeat(64);
    if (kind === "selection") f.reference.version.versionId = "unrequested-version";
    const result = await prepareOperationalData(f.port, f.request, now);
    expect(result.ready).toBe(false); expect(f.read).not.toHaveBeenCalled();
    expect(result.reason).toBe(kind === "source" ? "SOURCE_ID_MISMATCH" : kind === "checksum" ? "CHECKSUM_MISMATCH" : "EXACT_SELECTION_INVALID");
  });
  it.each(["NOT_AVAILABLE", "NO_COVERAGE", "NOT_IN_FORCE"] as const)("does not discover another version after %s", async (status) => {
    const f = operationalPortFixture();
    f.discover.mockResolvedValue({ mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false,
      status, candidates: [], selected: null, unavailableVersionIds: [f.request.source.versionId], notInForce: [], truncated: false });
    const result = await prepareOperationalData(f.port, f.request, now);
    expect(result.status).toBe("NOT_AVAILABLE"); expect(result.validated).toBeNull(); expect(f.read).not.toHaveBeenCalled(); expect(f.discover).toHaveBeenCalledTimes(1);
  });
  it.each(["NOT_AVAILABLE", "INTEGRITY_ERROR"] as const)("does not substitute old/latest content after read %s", async (status) => {
    const f = operationalPortFixture(); f.read.mockResolvedValue({ status });
    const result = await prepareOperationalData(f.port, f.request, now);
    expect(result.reason).toBe(status === "NOT_AVAILABLE" ? "SOURCE_UNAVAILABLE" : "CHECKSUM_MISMATCH"); expect(f.read).toHaveBeenCalledTimes(1);
  });
  it("rejects discovery/read metadata races and incomplete integrity assertions", async () => {
    const f = operationalPortFixture(); const read = await f.read({ versionId: "ignored", expectedChecksum: "ignored" });
    if (read.status !== "AVAILABLE") throw new Error("Invalid fixture");
    read.reference.rights.usagePolicy = "Changed after discovery"; f.read.mockResolvedValue(read);
    expect((await prepareOperationalData(f.port, f.request, now)).reason).toBe("REFERENCE_OR_INTEGRITY_MISMATCH");
    read.integrity.checksum = "b".repeat(64);
    expect((await prepareOperationalData(f.port, f.request, now)).ready).toBe(false);
  });
  const changes: [string, (dataset: OperationalSourceDataset) => void, string][] = [
    ["model unreviewed", (d) => { d.approval.status = "UNREVIEWED"; }, "ASSUMPTION_APPROVAL_REQUIRED"],
    ["operand unreviewed", (d) => { d.model.values[0]!.approval = "UNREVIEWED"; d.model.values[0]!.approvedAt = null; d.model.values[0]!.approvedBy = null; }, "ASSUMPTION_APPROVAL_REQUIRED"],
    ["source ID", (d) => { d.sourceId = "another-source"; }, "SOURCE_ID_MISMATCH"],
    ["future record", (d) => { d.sourceRecords[0]!.recordedAt = "2099-01-01T00:00:00.000Z"; }, "FUTURE_APPROVAL_OR_RECORD"],
    ["future approval", (d) => { d.approval.approvedAt = "2099-01-01T00:00:00.000Z"; }, "FUTURE_APPROVAL_OR_RECORD"],
    ["early model approval", (d) => { d.approval.approvedAt = "2026-10-01T00:00:00.000Z"; }, "APPROVAL_PREDATES_DECLARATIONS"],
    ["missing local evidence", (d) => { d.model.values[0]!.evidence = ["absent"]; }, "DATASET_CONTRACT_INVALID"],
    ["duplicate provenance", (d) => { d.sourceRecords.push(structuredClone(d.sourceRecords[0]!)); }, "DATASET_CONTRACT_INVALID"],
    ["coverage site", (d) => { d.coverage.siteIds = ["other-site"]; }, "SITE_NOT_COVERED"],
  ];
  it.each(changes)("does not trust publication alone: %s", async (_, change, reason) => {
    const f = operationalPortFixture(); change(f.dataset);
    expect((await prepareOperationalData(f.port, f.request, now)).reason).toBe(reason);
  });
  it.each(["site", "geography", "sector", "period", "unit", "methodology", "value"] as const)("rejects caller %s incompatible with approved published model", async (kind) => {
    const f = operationalPortFixture();
    if (kind === "site") { f.request.model.siteId = "other"; f.request.model.values.forEach((v) => { v.siteId = "other"; }); f.request.model.schedules.forEach((s) => s.rows.forEach((r) => { r.siteId = "other"; })); }
    if (kind === "geography") f.request.model.scope.geography.authority = "other";
    if (kind === "sector") f.request.model.scope.sector.code = "other";
    if (kind === "period") { f.request.model.periods[0]!.startDate = "2026-11-01"; f.request.model.periods[0]!.endDate = "2026-12-01"; }
    if (kind === "unit") { const v = f.request.model.values.find((v) => v.id === "time")!; v.unit = { kind: "RESOURCE_TIME", basis: "HOUR", poolId: "pool-1" }; }
    if (kind === "methodology") f.request.model.values[0]!.method.version = "unapproved-method";
    if (kind === "value") f.request.model.values[0]!.value = "999";
    const result = await prepareOperationalData(f.port, f.request, now);
    expect(result.ready).toBe(false); expect(result.validated).toBeNull();
  });
  it.each(["PARTIAL", "UNKNOWN", "NONE"] as const)("keeps %s coverage non-ready, never zero", async (status) => {
    const f = operationalPortFixture(); f.dataset.coverage.status = status;
    const result = await prepareOperationalData(f.port, f.request, now);
    expect(result.status).toBe(status === "NONE" ? "NO_COVERAGE" : "PARTIAL"); expect(result.ready).toBe(false);
  });
  it.each(["missing", "schedule", "period-coverage", "quote", "timing", "applicability"] as const)("requires complete %s inputs", async (kind) => {
    const f = operationalPortFixture();
    if (kind === "missing") f.dataset.model.values[0]!.value = null;
    if (kind === "schedule") f.dataset.model.schedules[0]!.completeness = "PARTIAL";
    if (kind === "period-coverage") f.dataset.coverage.periodIds = ["not-p1"];
    if (kind === "quote" || kind === "timing") {
      f.dataset.model.analyses = ["SUPPLY"]; f.dataset.model.schedules[0]!.kind = "SUPPLIER";
      f.dataset.model.schedules[0]!.rows[0]!.supplierStatus = kind === "quote" ? "QUOTATION" : "COMMITTED";
    }
    if (kind === "applicability") f.dataset.model.analyses = ["PREREQUISITES"];
    f.request = bindOperationalDataset(f.dataset, f.reference, now);
    const result = await prepareOperationalData(f.port, f.request, now);
    expect(result.status).toBe("PARTIAL"); expect(result.ready).toBe(false);
  });
  it("preserves NOT_SUPPORTED for a published branched process without calculating", async () => {
    const f = operationalPortFixture(); f.dataset.model.network.kind = "BRANCHED"; f.request = bindOperationalDataset(f.dataset, f.reference, now);
    expect((await prepareOperationalData(f.port, f.request, now)).status).toBe("NOT_SUPPORTED");
  });
  it("rejects a zero cycle denominator rather than treating it as incomplete capacity", async () => {
    const f = operationalPortFixture(); f.dataset.model.values.find((v) => v.id === "cycle")!.value = "0";
    f.request = bindOperationalDataset(f.dataset, f.reference, now);
    const result = await prepareOperationalData(f.port, f.request, now);
    expect(result.status).toBe("NOT_COMPUTABLE"); expect(result.reason).toBe("OPERATIONAL_COMPATIBILITY_INVALID");
  });
  it("rejects region-level input when the source only declares national coverage", async () => {
    const f = operationalPortFixture();
    f.dataset.model.scope.geography = { ...f.dataset.model.scope.geography, level: "REGION", code: "SA-01" };
    f.request = bindOperationalDataset(f.dataset, f.reference, now);
    expect((await prepareOperationalData(f.port, f.request, now)).reason).toBe("SOURCE_GEOGRAPHY_NOT_COVERED");
  });
  it("does not label old dated evidence fresh merely because the provider asserts FRESH", async () => {
    const f = operationalPortFixture(); f.reference.freshness.sourcePublishedAt = "2020-01-01T00:00:00.000Z";
    expect((await prepareOperationalData(f.port, f.request, now)).status).toBe("PARTIAL");
  });
  it.each(["provenance-date", "ownership", "blank-license", "blank-attribution"] as const)("rejects inconsistent %s", async (kind) => {
    const f = operationalPortFixture();
    if (kind === "provenance-date") f.dataset.sourceRecords[0]!.recordedAt = "2026-10-04T00:00:00.000Z";
    if (kind === "ownership") f.reference.ownership.owner = " ";
    if (kind === "blank-license") f.reference.rights.license = " ";
    if (kind === "blank-attribution") f.reference.rights.attribution.text = " ";
    expect((await prepareOperationalData(f.port, f.request, now)).ready).toBe(false);
  });
  it.each(["STALE", "UNKNOWN", "EXPIRED"] as const)("does not silently accept %s source freshness", async (status) => {
    const f = operationalPortFixture(); f.reference.freshness.status = status;
    if (status === "UNKNOWN") f.reference.freshness.sourcePublishedAt = null;
    const result = await prepareOperationalData(f.port, f.request, now);
    expect(result.ready).toBe(false); expect(result.status).toBe(status === "EXPIRED" ? "NOT_COMPUTABLE" : "PARTIAL");
  });
  it.each(["rights", "type", "approval", "country", "future", "effective"] as const)("rejects incompatible source metadata: %s", async (kind) => {
    const f = operationalPortFixture();
    if (kind === "rights") f.reference.rights.usagePolicy = " ";
    if (kind === "type") f.reference.dataset.typeKey = "other-type";
    if (kind === "approval") f.reference.version.evidenceStatus = "ESTIMATED";
    if (kind === "country") f.reference.coverage!.countryCodes = ["AE"];
    if (kind === "future") f.reference.version.createdAt = "2099-01-01T00:00:00.000Z";
    if (kind === "effective") f.reference.freshness.effectiveFrom = "2099-01-01T00:00:00.000Z";
    expect((await prepareOperationalData(f.port, f.request, now)).ready).toBe(false);
  });
  it("validates content JSON rather than trusting an AVAILABLE assertion", async () => {
    const f = operationalPortFixture(); const read = await f.read({ versionId: "x", expectedChecksum: "x" });
    if (read.status !== "AVAILABLE") throw new Error("Invalid fixture");
    read.content = "{"; f.read.mockResolvedValue(read);
    expect((await prepareOperationalData(f.port, f.request, now)).reason).toBe("DATASET_JSON_INVALID");
  });
  it("rejects oversized input before I/O and propagates backend errors rather than fabricating success", async () => {
    const f = operationalPortFixture();
    await expect(prepareOperationalData(f.port, { x: "x".repeat(2 * 1024 * 1024) }, now)).rejects.toThrow(/2 MiB/);
    expect(f.discover).not.toHaveBeenCalled();
    f.discover.mockRejectedValue(new Error("Database offline"));
    await expect(prepareOperationalData(f.port, f.request, now)).rejects.toThrow("Database offline");
  });
  it("validates the local source dataset schema independently of binding", () => {
    const f = operationalPortFixture(); expect(operationalSourceDatasetSchema.safeParse(f.dataset).success).toBe(true);
    f.dataset.coverage.completeness = "SAMPLE";
    expect(operationalSourceDatasetSchema.safeParse(f.dataset).success).toBe(false);
  });
});
