import { describe, expect, it } from "vitest";
import { bindFinancialDataset, financialDatasetSchema, prepareFinancialData, type FinancialDataset, type FinancialSourceReference } from "@/services/analysis-engines/financial-feasibility";
import { evaluatedAt } from "./support/analysis-engine-fixtures";
import { financialDataset, financialPortFixture, financialReference } from "./support/financial-data-fixtures";

describe("Financial M2 exact governed approved model preparation", () => {
  it("binds local evidence to exact bytes and preserves approvals/rights without calculating finance", async () => {
    const f = financialPortFixture(); const original = structuredClone(f.request);
    const result = await prepareFinancialData(f.port, f.request, evaluatedAt);
    expect(result.status).toBe("AVAILABLE"); expect(result.ready).toBe(true);
    expect(result.validated!.input.checksum).toEqual(f.reference.version.checksum);
    expect(result.validated!.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.validated!.model).toEqual(f.request);
    expect(result.rights.allowExport).toBe(false); expect(result.attribution[0]!.required).toBe(true);
    expect(result.realDataAcceptance).toBe("BLOCKED / NOT VERIFIED");
    expect(result).not.toHaveProperty("metrics");
    expect(result.work).toEqual({ discoveries: 1, reads: 1, parsedRows: 21 });
    expect(f.discover).toHaveBeenCalledWith({ versionIds: ["financial-v1"] });
    expect(f.read).toHaveBeenCalledWith({ versionId: "financial-v1", expectedChecksum: "a".repeat(64) });
    expect(f.request).toEqual(original);
    expect((await prepareFinancialData(f.port, f.request, evaluatedAt)).determinism).toEqual(result.determinism);
  });
  const invalidSources: [string, (reference: FinancialSourceReference) => void, string][] = [
    ["wrong type", (r) => { r.dataset.typeKey = "context"; }, "MODEL_TYPE_MISMATCH"],
    ["unverified source", (r) => { r.version.evidenceStatus = "UNVERIFIED"; }, "SOURCE_APPROVAL_REQUIRED"],
    ["estimated source", (r) => { r.version.evidenceStatus = "ESTIMATED"; }, "SOURCE_APPROVAL_REQUIRED"],
    ["conflicted source", (r) => { r.version.evidenceStatus = "CONFLICTED"; }, "SOURCE_APPROVAL_REQUIRED"],
    ["missing license class", (r) => { r.rights.licenseClass = null; }, "RIGHTS_INVALID"],
    ["blank license", (r) => { r.rights.license = " "; }, "RIGHTS_INVALID"],
    ["blank usage policy", (r) => { r.rights.usagePolicy = " "; }, "RIGHTS_INVALID"],
    ["future metadata", (r) => { r.version.createdAt = "2030-01-01T00:00:00.000Z"; }, "FUTURE_METADATA"],
    ["expired source", (r) => { r.freshness.status = "EXPIRED"; }, "SOURCE_NOT_IN_FORCE"],
    ["expired validity", (r) => { r.freshness.effectiveTo = evaluatedAt; }, "SOURCE_NOT_IN_FORCE"],
    ["not yet effective", (r) => { r.freshness.effectiveFrom = "2030-01-01T00:00:00.000Z"; }, "SOURCE_NOT_IN_FORCE"],
    ["wrong country coverage", (r) => { r.coverage!.countryCodes = ["AE"]; }, "SOURCE_GEOGRAPHY_NOT_COVERED"],
    ["no geographic coverage", (r) => { r.coverage = null; }, "SOURCE_GEOGRAPHY_NOT_COVERED"],
  ];
  it.each(invalidSources)("fails closed for %s", async (_label, mutate, reason) => {
    const f = financialPortFixture(); mutate(f.reference);
    const result = await prepareFinancialData(f.port, f.request, evaluatedAt);
    expect(result.ready).toBe(false); expect(result.reason).toBe(reason); expect(result.rights.allowExport).toBe(false);
  });
  const invalidModels: [string, (dataset: FinancialDataset) => void, string][] = [
    ["source ID", (d) => { d.sourceId = "other-source"; }, "SOURCE_ID_MISMATCH"],
    ["model approval", (d) => { d.approval.status = "UNREVIEWED"; }, "ASSUMPTION_APPROVAL_REQUIRED"],
    ["assumption review", (d) => { d.model.assumptions[0]!.approval = "UNREVIEWED"; }, "ASSUMPTION_APPROVAL_REQUIRED"],
    ["future approval", (d) => { d.approval.approvedAt = "2030-01-01T00:00:00.000Z"; }, "FUTURE_APPROVAL_OR_RECORD"],
    ["future source record", (d) => { d.sourceRecords[0]!.recordedAt = "2030-01-01T00:00:00.000Z"; }, "FUTURE_APPROVAL_OR_RECORD"],
    ["approval predates disclosure", (d) => { d.approval.approvedAt = "2026-09-01T00:00:00.000Z"; }, "APPROVAL_PREDATES_DECLARATIONS"],
    ["sector", (d) => { d.model.scope.sector.code = "other"; }, "GEOGRAPHY_OR_SECTOR_MISMATCH"],
    ["period", (d) => { d.model.basis.t0.date = "2026-11-01"; d.model.basis.periods[0]!.startDate = "2026-11-01"; d.model.basis.periods[0]!.endDate = "2026-12-01"; }, "PERIOD_CURRENCY_OR_TIMING_MISMATCH"],
    ["currency", (d) => { d.model.basis.currency = "USD"; }, "PERIOD_CURRENCY_OR_TIMING_MISMATCH"],
    ["accounting timing", (d) => { d.model.basis.cashMode = "ACCRUAL_BRIDGE"; }, "PERIOD_CURRENCY_OR_TIMING_MISMATCH"],
    ["client assumption override", (d) => { d.model.assumptions[0]!.value = "999"; }, "PUBLISHED_MODEL_REQUEST_MISMATCH"],
    ["unresolved evidence", (d) => { d.model.assumptions[0]!.evidence = ["absent"]; }, "DATASET_CONTRACT_INVALID"],
  ];
  it.each(invalidModels)("rejects %s without using caller substitutes", async (_label, mutate, reason) => {
    const f = financialPortFixture(); mutate(f.dataset);
    const result = await prepareFinancialData(f.port, f.request, evaluatedAt);
    expect(result.ready).toBe(false); expect(result.reason).toBe(reason); expect(result.validated).toBeNull();
  });
  it("retains truthful missing values, incomplete coverage and stale evidence as PARTIAL, never zero", async () => {
    for (const kind of ["missing", "partial", "stale"] as const) {
      const f = financialPortFixture();
      if (kind === "missing") {
        f.dataset.model.assumptions[0]!.value = null;
        f.request = bindFinancialDataset(f.dataset, f.reference, evaluatedAt);
      }
      if (kind === "partial") { f.dataset.coverage = { ...f.dataset.coverage, status: "PARTIAL", completeness: "SAMPLE" }; }
      if (kind === "stale") f.reference.freshness.status = "STALE";
      const result = await prepareFinancialData(f.port, f.request, evaluatedAt);
      expect(result.status).toBe("PARTIAL"); expect(result.ready).toBe(false);
      if (kind === "missing") expect(result.validated!.model.assumptions.find((a) => a.id === f.dataset.model.assumptions[0]!.id)!.value).toBeNull();
      expect(result.rights.allowExport).toBe(false);
    }
  });
  it("allows future projection periods, never claims them as observed production data", async () => {
    const f = financialPortFixture(); expect(f.request.basis.periods[0]!.endDate > evaluatedAt.slice(0, 10)).toBe(true);
    expect((await prepareFinancialData(f.port, f.request, evaluatedAt)).ready).toBe(true);
  });
  it("never falls back when an exact version is missing, hidden or replaced", async () => {
    const f = financialPortFixture();
    f.discover.mockResolvedValue({ mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false,
      status: "NOT_AVAILABLE", candidates: [], selected: null, unavailableVersionIds: ["financial-v1"], notInForce: [], truncated: false });
    const result = await prepareFinancialData(f.port, f.request, evaluatedAt);
    expect(result.status).toBe("NOT_AVAILABLE"); expect(result.reason).toBe("SOURCE_UNAVAILABLE"); expect(f.read).not.toHaveBeenCalled();
  });
  it("rejects a different selected version and mismatching checksums before content read", async () => {
    for (const kind of ["version", "hash"]) {
      const f = financialPortFixture();
      if (kind === "version") f.reference.version.versionId = "latest-version";
      else f.reference.version.checksum.value = "b".repeat(64);
      expect((await prepareFinancialData(f.port, f.request, evaluatedAt)).ready).toBe(false);
      expect(f.read).not.toHaveBeenCalled();
    }
  });
  it("detects changed current rights between discovery and read", async () => {
    const f = financialPortFixture();
    f.read.mockImplementation(async () => ({ status: "AVAILABLE", reference: { ...f.reference, rights: { ...f.reference.rights, allowExport: true } },
      content: JSON.stringify(f.dataset), contentKind: "OTHER", integrity: { algorithm: "SHA-256", checksum: "a".repeat(64), recomputed: true } }));
    expect((await prepareFinancialData(f.port, f.request, evaluatedAt)).reason).toBe("REFERENCE_OR_INTEGRITY_MISMATCH");
  });
  it("surfaces content integrity failure and malformed JSON explicitly", async () => {
    const f = financialPortFixture(); f.read.mockResolvedValue({ status: "INTEGRITY_ERROR" });
    expect((await prepareFinancialData(f.port, f.request, evaluatedAt)).reason).toBe("CHECKSUM_MISMATCH");
    f.read.mockResolvedValue({ status: "AVAILABLE", reference: f.reference, content: "{", contentKind: "OTHER",
      integrity: { algorithm: "SHA-256", checksum: "a".repeat(64), recomputed: true } });
    expect((await prepareFinancialData(f.port, f.request, evaluatedAt)).reason).toBe("DATASET_JSON_INVALID");
  });
  it("requires one complete-model pin, without aggregating multiple models", async () => {
    const f = financialPortFixture(); f.request.data.versions = [];
    f.request.assumptions = []; f.request.schedules = []; f.request.breakEven = null; f.request.valuation = null; f.request.cashRequirement = null;
    expect((await prepareFinancialData(f.port, f.request, evaluatedAt)).reason).toBe("EXACT_MODEL_PIN_REQUIRED");
    f.request.data.versions = [{ versionId: "v1", checksum: "a".repeat(64) }, { versionId: "v2", checksum: "b".repeat(64) }];
    expect((await prepareFinancialData(f.port, f.request, evaluatedAt)).reason).toBe("MULTIPLE_MODEL_VERSIONS_UNSUPPORTED");
    expect(f.discover).not.toHaveBeenCalled();
  });
  it("rejects combined source rows above the budget instead of truncating", async () => {
    const f = financialPortFixture(); f.dataset.sourceRecords = Array.from({ length: 10_000 }, (_, index) => ({
      ...f.dataset.sourceRecords[0]!, id: index ? `record-${index}` : "model-record", reference: "r", description: "s",
    }));
    // The governed reader has a tighter content bound; a smaller valid-content fixture proves the schema itself does not hide rows.
    expect(financialDatasetSchema.safeParse(f.dataset).success).toBe(true);
    expect((await prepareFinancialData(f.port, f.request, evaluatedAt)).reason).toBe("READ_CONTRACT_INVALID");
  });
  it("propagates backend failures, without unavailable-success fallback", async () => {
    const f = financialPortFixture(); f.discover.mockRejectedValue(new Error("database unavailable"));
    await expect(prepareFinancialData(f.port, f.request, evaluatedAt)).rejects.toThrow("database unavailable");
  });
  it("uses local source records, avoiding circular embedded version checksums", () => {
    const d = financialDataset(); const ref = financialReference();
    expect(JSON.stringify(d)).not.toContain(ref.version.checksum.value);
    const bound = bindFinancialDataset(d, ref, evaluatedAt);
    expect(bound.assumptions[0]!.evidence[0]!).toEqual({ inputId: "dc:financial-v1", versionId: "financial-v1", checksum: "a".repeat(64), sourceRecordId: "model-record" });
  });
});
