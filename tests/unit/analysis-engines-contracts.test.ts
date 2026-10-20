import { describe, expect, it } from "vitest";
import {
  assertEnvelope, computeDeterminism, computeInputsHash, computeOutputHash, computeRequestHash, createGap, deriveAttribution, deriveRights, deriveRunStatus, engineInputSchema,
  engineMetricSchema, envelopeViolationCodes, EngineError, findEnvelopeViolations, findInputViolations, findMetricViolations, normalizeGaps, rightsSchema, sharedGapCatalog,
  type EngineInput, type EngineMetric, type EnvelopeViolationCode, type GapCatalog, type MetricStatus, type Rights,
} from "@/services/analysis-engines/shared";
import { digest, makeBreakdown, makeEngineRunInput, makeEnvelope, makeInput, makeMetric, makeUnregisteredSampleInput, reseal, type TestEnvelope } from "./support/analysis-engine-fixtures";

describe("engine input descriptor", () => {
  it("accepts a published Data Center version, an unregistered Map layer and an engine output", () => {
    for (const input of [makeInput(), makeUnregisteredSampleInput(), makeEngineRunInput()]) expect(engineInputSchema.parse(input)).toEqual(input);
  });

  it.each<[string, Partial<EngineInput>, string]>([
    ["governance that belongs to another kind", { governance: "MAP_REGISTERED" }, "belongs to kind"],
    ["a reference in the wrong system", { ref: { system: "JENAN_MAP", id: "version-1", version: 3, label: "x" } }, "is referenced in"],
    ["unsorted roles", { roles: ["poi:school", "poi:hospital"] }, "roles must be unique and sorted"],
    ["duplicate roles", { roles: ["poi:hospital", "poi:hospital"] }, "roles must be unique and sorted"],
    ["unsorted limitations", { limitations: ["b", "a"] }, "limitations must be unique and sorted"],
    ["mandatory attribution without its text", { attribution: { text: null, required: true } }, "Mandatory attribution"],
    ["JENAN_OWNED data that the platform does not own", { licenseClass: "JENAN_OWNED", ownership: "THIRD_PARTY" }, "JENAN_OWNED requires platform ownership"],
    ["restricted data that allows export", { licenseClass: "RESTRICTED", allowExport: true }, "RESTRICTED data cannot allow export"],
    ["a published version without checksum", { checksum: null }, "needs its checksum and version number"],
    ["a published version without its number", { ref: { system: "DATA_CENTER", id: "version-1", version: null, label: "x" } }, "needs its checksum and version number"],
    ["FRESH without the source date", { freshness: { status: "FRESH", sourcePublishedAt: null, freshnessDays: 90, expiresAt: null } }, "FRESH and STALE need"],
    ["STALE without the freshness period", { freshness: { status: "STALE", sourcePublishedAt: "2026-01-01T00:00:00.000Z", freshnessDays: null, expiresAt: null } }, "FRESH and STALE need"],
    ["UNKNOWN freshness with a source date", { freshness: { status: "UNKNOWN", sourcePublishedAt: "2026-01-01T00:00:00.000Z", freshnessDays: 90, expiresAt: null } }, "UNKNOWN freshness"],
    ["duplicate coverage codes", { coverage: { crs: "WGS84", countryCodes: ["SA", "SA"], regionCodes: [], boundingBox: null } }, "Coverage codes must be unique"],
    ["a region without its country", { coverage: { crs: "WGS84", countryCodes: ["AE"], regionCodes: ["SA-01"], boundingBox: null } }, "needs its country"],
  ])("rejects %s", (_name, change, fragment) => {
    const result = engineInputSchema.safeParse(makeInput(change));
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(fragment);
  });

  it("rejects an unknown member, a malformed checksum and a bounding box that is not ordered", () => {
    expect(engineInputSchema.safeParse({ ...makeInput(), extra: 1 }).success).toBe(false);
    expect(engineInputSchema.safeParse(makeInput({ checksum: { algorithm: "SHA-256", value: "ABC" } })).success).toBe(false);
    expect(engineInputSchema.safeParse(makeInput({ coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: [], boundingBox: { west: 50, south: 10, east: 40, north: 20 } } })).success).toBe(false);
  });

  it("reports a clean descriptor as having no violations", () => {
    expect(findInputViolations(makeInput())).toEqual([]);
  });
});

describe("metric invariants", () => {
  const valueless = (status: MetricStatus, over: Partial<EngineMetric> = {}) => makeMetric({ status, platformState: "UNAVAILABLE", value: null, confidence: null, ...over });
  const fails = (metric: EngineMetric, fragment: string) => {
    expect(findMetricViolations(metric).join("|")).toContain(fragment);
    expect(engineMetricSchema.safeParse(metric).success).toBe(false);
  };

  it.each<[string, EngineMetric]>([
    ["a computed distance", makeMetric()],
    ["a verified platform state for a computed value", makeMetric({ platformState: "VERIFIED" })],
    ["a zero distance", makeMetric({ value: 0 })],
    ["a partial value", makeMetric({ status: "PARTIAL" })],
    ["an estimated population", makeMetric({ key: "catchment.r1000.population", status: "ESTIMATED", platformState: "ESTIMATED", valueKind: "POPULATION", unit: "people", value: 1200, interpretation: "ESTIMATE", confidence: makeBreakdown([30, 20, 10], ["MAP_LAYER_UNREGISTERED"]) })],
    ["a count of mapped features", makeMetric({ key: "catchment.r500.count.poi:hospital", valueKind: "COUNT", unit: "count", value: 4 })],
    ["a density of mapped features", makeMetric({ key: "density.poi:hospital", valueKind: "DENSITY", unit: "per_km2", value: 1.25 })],
    ["a categorical value", makeMetric({ key: "context.region", valueKind: "CATEGORICAL", unit: "none", value: "Riyadh Region" })],
    ["a boolean value", makeMetric({ key: "constraint.protected_area.intersects", valueKind: "BOOLEAN", unit: "none", value: false })],
    ["an area measured from the request alone (no inputs, no confidence)", makeMetric({ key: "request.target.area", valueKind: "AREA", unit: "km2", value: 12.5, interpretation: "MEASURED_GEOMETRY", inputRefs: [], confidence: null })],
    ["nothing found within the searched radius", valueless("NOT_FOUND_WITHIN_RADIUS")],
    ["a location outside the coverage", valueless("NO_COVERAGE")],
    ["a role with no dataset", valueless("NOT_AVAILABLE", { inputRefs: [] })],
    ["a capability that is missing", valueless("NOT_COMPUTABLE", { inputRefs: [] })],
  ])("accepts %s", (_name, metric) => {
    expect(findMetricViolations(metric)).toEqual([]);
    expect(engineMetricSchema.parse(metric)).toEqual(metric);
  });

  it.each(["NO_COVERAGE", "NOT_AVAILABLE", "NOT_COMPUTABLE", "NOT_FOUND_WITHIN_RADIUS"] as const)("never gives %s a value or a confidence", (status) => {
    fails(valueless(status, { value: 0 }), "carries no value");
    fails(valueless(status, { confidence: makeBreakdown() }), "carries no confidence");
  });

  it("rejects the violations of the value rules", () => {
    fails(makeMetric({ value: null }), "needs a value");
    fails(makeMetric({ status: "ESTIMATED", platformState: "ESTIMATED" }), "ESTIMATED status and ESTIMATE interpretation go together");
    fails(makeMetric({ interpretation: "ESTIMATE" }), "ESTIMATED status and ESTIMATE interpretation go together");
    fails(makeMetric({ unit: "km2" }), "does not fit DISTANCE");
    fails(makeMetric({ platformState: "UNAVAILABLE" }), "platformState");
    fails(makeMetric({ value: -1 }), "not negative");
    fails(makeMetric({ value: "far" }), "needs a number");
    fails(makeMetric({ valueKind: "COUNT", unit: "count", value: 2.5 }), "whole number");
    fails(makeMetric({ valueKind: "BOOLEAN", unit: "none", value: "yes" }), "wrong value type");
    fails(makeMetric({ valueKind: "TEXT", unit: "none", value: true }), "wrong value type");
    fails(makeMetric({ valueKind: "COUNT", unit: "count", value: 3, interpretation: "MEASURED_GEOMETRY" }), "COUNT describes mapped features only");
    fails(makeMetric({ valueKind: "DENSITY", unit: "per_km2", value: 3, interpretation: "ESTIMATE", status: "ESTIMATED", platformState: "ESTIMATED" }), "DENSITY describes mapped features only");
    fails(makeMetric({ valueKind: "POPULATION", unit: "people", value: 10, interpretation: "MEASURED_GEOMETRY" }), "POPULATION");
  });

  it("requires a confidence breakdown for every value that depends on data", () => {
    fails(makeMetric({ confidence: null }), "needs its confidence breakdown");
    fails(makeMetric({ inputRefs: [], interpretation: "MEASURED_GEOMETRY" }), "derived from the request alone carries no confidence");
    fails(makeMetric({ inputRefs: [], interpretation: "MAPPED_FEATURES_ONLY", confidence: null }), "needs its confidence breakdown");
  });

  it("keeps references and limitations sorted and unique", () => {
    fails(makeMetric({ inputRefs: ["b", "a"] }), "inputRefs must be unique and sorted");
    fails(makeMetric({ inputRefs: ["a", "a"] }), "inputRefs must be unique and sorted");
    fails(makeMetric({ limitations: ["b", "a"] }), "limitations must be unique and sorted");
  });

  it("rejects non-finite numbers and unknown members", () => {
    expect(engineMetricSchema.safeParse(makeMetric({ value: Number.NaN })).success).toBe(false);
    expect(engineMetricSchema.safeParse(makeMetric({ value: Number.POSITIVE_INFINITY })).success).toBe(false);
    expect(engineMetricSchema.safeParse({ ...makeMetric(), successProbability: 0.87 }).success).toBe(false);
    expect(engineMetricSchema.safeParse(makeMetric({ key: "Bad Key" })).success).toBe(false);
  });
});

describe("derivations", () => {
  const describeDenial = (denial: Rights["denials"][number]) => ("inputId" in denial ? `${denial.inputId}:${denial.reason}` : denial.reason);
  const denials = (inputs: EngineInput[]) => deriveRights(inputs).denials.map(describeDenial);

  it("allows export only when every input allows it, declares a license class and is not restricted", () => {
    expect(deriveRights([makeInput()])).toEqual({ allowExport: true, denials: [] });
    expect(denials([makeInput({ allowExport: false })])).toEqual(["dc:version-1:EXPORT_NOT_ALLOWED"]);
    expect(denials([makeInput({ licenseClass: null })])).toEqual(["dc:version-1:LICENSE_CLASS_UNDECLARED"]);
    expect(denials([makeInput({ licenseClass: "RESTRICTED", allowExport: false })])).toEqual(["dc:version-1:EXPORT_NOT_ALLOWED", "dc:version-1:LICENSE_CLASS_RESTRICTED"]);
  });

  it("denies export when there is no input at all: the absence of inputs is never a permission", () => {
    const rights = deriveRights([]);
    expect(rights).toEqual({ allowExport: false, denials: [{ reason: "NO_INPUTS" }] });
    expect(rightsSchema.parse(rights)).toEqual(rights);
    expect(deriveRights([])).toEqual(rights);
    // One exportable input restores the permission, so the denial comes from the missing input and from nothing else.
    expect(deriveRights([makeInput()]).allowExport).toBe(true);
  });

  it("keeps the denial of an empty result alone, and never beside a permission", () => {
    const accepted = (value: unknown) => rightsSchema.safeParse(value).success;
    expect(accepted({ allowExport: false, denials: [{ reason: "NO_INPUTS" }] })).toBe(true);
    expect(accepted({ allowExport: false, denials: [{ inputId: "dc:a", reason: "EXPORT_NOT_ALLOWED" }] })).toBe(true);
    expect(accepted({ allowExport: true, denials: [{ reason: "NO_INPUTS" }] })).toBe(false);
    expect(accepted({ allowExport: false, denials: [{ reason: "NO_INPUTS" }, { inputId: "dc:a", reason: "EXPORT_NOT_ALLOWED" }] })).toBe(false);
    expect(accepted({ allowExport: false, denials: [{ reason: "NO_INPUTS" }, { reason: "NO_INPUTS" }] })).toBe(false);
    expect(accepted({ allowExport: false, denials: [{ reason: "NO_INPUTS", inputId: "dc:a" }] })).toBe(false);
    expect(accepted({ allowExport: false, denials: [{ inputId: "dc:a" }] })).toBe(false);
    expect(accepted({ allowExport: false, denials: [{ reason: "EXPORT_NOT_ALLOWED" }] })).toBe(false);
  });

  it("denies the whole result when any one input denies it, and names every denial in a stable order", () => {
    const rights = deriveRights([makeInput({ id: "dc:b" }), makeUnregisteredSampleInput({ id: "dc:a" })]);
    expect(rights.allowExport).toBe(false);
    expect(rights.denials.map((denial) => ("inputId" in denial ? denial.inputId : null))).toEqual(["dc:a", "dc:a"]);
  });

  it("does not ask an engine output for a license class of its own", () => {
    expect(deriveRights([makeEngineRunInput()])).toEqual({ allowExport: true, denials: [] });
    expect(deriveRights([makeEngineRunInput({ allowExport: false })]).allowExport).toBe(false);
  });

  it("groups attribution by text, marks it required when any input requires it, and sorts it", () => {
    const entries = deriveAttribution([
      makeInput({ id: "dc:b", attribution: { text: "© B", required: false } }), makeInput({ id: "dc:a", attribution: { text: "© A", required: true } }),
      makeInput({ id: "dc:c", attribution: { text: "© B", required: true } }), makeInput({ id: "dc:d", attribution: { text: null, required: false } }),
    ]);
    expect(entries).toEqual([{ text: "© A", required: true, inputIds: ["dc:a"] }, { text: "© B", required: true, inputIds: ["dc:b", "dc:c"] }]);
  });

  it.each<[string, MetricStatus[], Array<"BLOCKING" | "WARNING" | "INFO">, string]>([
    ["nothing at all", [], [], "COMPLETED_WITH_GAPS"],
    ["nothing computed and something blocking", [], ["BLOCKING"], "FAILED"],
    ["nothing computed and only a warning", [], ["WARNING"], "COMPLETED_WITH_GAPS"],
    ["everything computed", ["COMPUTED", "COMPUTED"], [], "COMPLETED"],
    ["everything computed with information only", ["COMPUTED"], ["INFO", "INFO"], "COMPLETED"],
    ["everything computed with a warning", ["COMPUTED"], ["WARNING"], "COMPLETED_WITH_GAPS"],
    ["everything computed with a blocking gap on a dataset", ["COMPUTED"], ["BLOCKING"], "COMPLETED_WITH_GAPS"],
    ["a partial value", ["COMPUTED", "PARTIAL"], [], "COMPLETED_WITH_GAPS"],
    ["an estimate", ["ESTIMATED"], [], "COMPLETED_WITH_GAPS"],
    ["nothing found within the radius", ["COMPUTED", "NOT_FOUND_WITHIN_RADIUS"], [], "COMPLETED_WITH_GAPS"],
    ["a location outside the coverage", ["NO_COVERAGE"], ["BLOCKING"], "COMPLETED_WITH_GAPS"],
  ])("derives the run status for %s", (_name, statuses, severities, expected) => {
    expect(deriveRunStatus(statuses.map((status) => ({ status })), severities.map((severity) => ({ severity })))).toBe(expected);
  });
});

describe("hashes", () => {
  it("hashes the request without the list of defaults it filled in", () => {
    const request = { normalized: { radiiMeters: [500, 1000] }, defaultsApplied: ["parameters.radiiMeters"], mapLayerPolicy: "REGISTERED_ONLY" };
    expect(computeRequestHash(request)).toBe(computeRequestHash({ ...request, defaultsApplied: [] }));
    expect(computeRequestHash(request)).not.toBe(computeRequestHash({ ...request, normalized: { radiiMeters: [500, 3000] } }));
    expect(computeRequestHash(request)).not.toBe(computeRequestHash({ ...request, mapLayerPolicy: "ALLOW_UNREGISTERED" }));
  });

  it("hashes the inputs in order, so a changed or reordered input changes the hash", () => {
    const first = makeInput({ id: "a" });
    const second = makeInput({ id: "b" });
    expect(computeInputsHash([first, second])).not.toBe(computeInputsHash([second, first]));
    expect(computeInputsHash([first])).not.toBe(computeInputsHash([makeInput({ id: "a", checksum: { algorithm: "SHA-256", value: "b".repeat(64) } })]));
  });

  it("leaves out only the run id, the timing and the hashes themselves from the output hash", () => {
    const envelope = makeEnvelope();
    const base = computeOutputHash(envelope);
    expect(computeOutputHash({ ...envelope, runId: "another", timing: { startedAt: "2027-01-01T00:00:00.000Z", finishedAt: "2027-01-01T00:00:01.000Z", durationMs: 1000 }, determinism: { requestHash: digest, inputsHash: digest, outputHash: digest } })).toBe(base);
    expect(computeOutputHash({ ...envelope, evaluatedAt: "2026-10-21T00:00:00.000Z" })).not.toBe(base);
    expect(computeOutputHash({ ...envelope, limits: { ...envelope.limits, costUnits: 11 } })).not.toBe(base);
    expect(computeOutputHash({ ...envelope, engine: { ...envelope.engine, version: "1.0.1" } })).not.toBe(base);
    expect(computeOutputHash({ ...envelope, status: "FAILED" })).not.toBe(base);
  });

  it("computes the three hashes of an envelope from its content", () => {
    const envelope = makeEnvelope();
    expect(computeDeterminism(envelope)).toEqual({ requestHash: computeRequestHash(envelope.request), inputsHash: computeInputsHash(envelope.inputs), outputHash: computeOutputHash(envelope) });
    expect(envelope.determinism).toEqual(computeDeterminism(envelope));
  });
});

describe("envelope validator", () => {
  const rehash = (envelope: TestEnvelope) => { envelope.determinism = computeDeterminism(envelope); return envelope; };
  const sample = makeUnregisteredSampleInput();
  const sampleCount = (over: Partial<EngineMetric> = {}) => makeMetric({
    key: "catchment.r500.count.poi:hospital", valueKind: "COUNT", unit: "count", value: 3, inputRefs: [sample.id],
    confidence: makeBreakdown([40, 30, 30], ["COUNT_IS_NOT_AN_INVENTORY", "MAP_LAYER_UNREGISTERED"], sample.id), ...over,
  });
  const notInventory = createGap(sharedGapCatalog, "COUNT_IS_NOT_AN_INVENTORY", {}, { inputId: sample.id });
  const sampleEnvelope = (metric: EngineMetric, withGuard: boolean, environment: "test" | "production" = "test") =>
    makeEnvelope({ environment, inputs: [sample], metrics: [metric], extraGaps: withGuard ? [notInventory] : [] });
  const codes = (envelope: TestEnvelope, options?: { catalog?: GapCatalog }) => findEnvelopeViolations(envelope, options).map((violation) => violation.code);

  it("accepts a consistent envelope", () => {
    expect(findEnvelopeViolations(makeEnvelope())).toEqual([]);
    expect(() => assertEnvelope(makeEnvelope())).not.toThrow();
    expect(makeEnvelope().status).toBe("COMPLETED");
  });

  it("accepts sample data outside production when every limitation is reported and the confidence is capped", () => {
    const envelope = sampleEnvelope(sampleCount(), true);
    expect(findEnvelopeViolations(envelope)).toEqual([]);
    expect(envelope.status).toBe("COMPLETED_WITH_GAPS");
    expect(envelope.rights.allowExport).toBe(false);
  });

  it("accepts a zero-result search over sample data when it is reported as not found, never as zero", () => {
    const notFound = makeMetric({ key: "catchment.r500.count.poi:hospital", valueKind: "COUNT", unit: "count", status: "NOT_FOUND_WITHIN_RADIUS", platformState: "UNAVAILABLE", value: null, confidence: null, inputRefs: [sample.id] });
    expect(findEnvelopeViolations(sampleEnvelope(notFound, true))).toEqual([]);
    expect(codes(sampleEnvelope(notFound, false))).toEqual(["COUNT_NOT_INVENTORY_UNGUARDED"]);
  });

  describe("a result with no input", () => {
    const unavailable = makeMetric({ status: "NOT_AVAILABLE", platformState: "UNAVAILABLE", value: null, confidence: null, inputRefs: [] });
    const withoutInputs = (rights?: Rights) => {
      const envelope = makeEnvelope({ inputs: [], metrics: [unavailable] });
      if (rights !== undefined) envelope.rights = rights;
      return reseal(envelope);
    };

    it("is denied export, and is a valid result", () => {
      const envelope = withoutInputs();
      expect(envelope.inputs).toEqual([]);
      expect(envelope.rights).toEqual({ allowExport: false, denials: [{ reason: "NO_INPUTS" }] });
      expect(findEnvelopeViolations(envelope)).toEqual([]);
    });

    it("cannot claim the right to export, whichever way the claim is written", () => {
      expect(codes(withoutInputs({ allowExport: true, denials: [] }))).toEqual(["RIGHTS_MISMATCH"]);
      expect(codes(withoutInputs({ allowExport: false, denials: [] }))).toEqual(["RIGHTS_MISMATCH"]);
      expect(codes(withoutInputs({ allowExport: false, denials: [{ inputId: "dc:version-1", reason: "EXPORT_NOT_ALLOWED" }] }))).toEqual(["RIGHTS_MISMATCH"]);
    });

    it("cannot carry the denial of an empty result once it has an input", () => {
      const envelope = makeEnvelope();
      envelope.rights = { allowExport: false, denials: [{ reason: "NO_INPUTS" }] };
      expect(codes(reseal(envelope))).toEqual(["RIGHTS_MISMATCH"]);
    });
  });

  const cases: Array<[EnvelopeViolationCode, () => TestEnvelope, { catalog?: GapCatalog }?]> = [
    ["EMPTY_ENVELOPE", () => { const e = makeEnvelope(); e.inputs = []; e.dataAvailability = []; e.results = [{ metrics: [] }]; e.gaps = []; e.attribution = []; e.rights = deriveRights([]); return reseal(e); }],
    ["INPUT_ID_DUPLICATE", () => { const e = makeEnvelope(); e.inputs = [e.inputs[0]!, e.inputs[0]!]; return reseal(e); }],
    ["INPUTS_UNSORTED", () => { const e = makeEnvelope({ inputs: [makeInput({ id: "dc:version-1" }), makeInput({ id: "dc:version-2" })] }); e.inputs = [...e.inputs].reverse(); return reseal(e); }],
    ["AVAILABILITY_INPUT_UNRESOLVED", () => { const e = makeEnvelope(); e.dataAvailability[0]!.inputIds = ["missing"]; return reseal(e); }],
    ["METRIC_KEY_DUPLICATE", () => { const e = makeEnvelope(); e.results[0]!.metrics = [makeMetric(), makeMetric()]; return reseal(e); }],
    ["METRICS_UNSORTED", () => { const e = makeEnvelope({ metrics: [makeMetric({ key: "a.one" }), makeMetric({ key: "b.two" })] }); e.results[0]!.metrics = [...e.results[0]!.metrics].reverse(); return reseal(e); }],
    ["METRIC_INPUT_UNRESOLVED", () => { const e = makeEnvelope(); e.results[0]!.metrics[0]!.inputRefs = ["missing"]; return reseal(e); }],
    ["GAP_INPUT_UNRESOLVED", () => { const e = makeEnvelope(); e.gaps = normalizeGaps([...e.gaps, createGap(sharedGapCatalog, "DATA_STALE", { dataset: "x" }, { inputId: "missing" })]); return reseal(e); }],
    ["GAPS_NOT_NORMALIZED", () => { const e = makeEnvelope(); e.gaps = [...e.gaps, e.gaps[0]!]; return reseal(e); }],
    ["GAP_CODE_UNKNOWN", () => makeEnvelope(), { catalog: Object.fromEntries(Object.entries(sharedGapCatalog).filter(([code]) => code !== "ATTRIBUTION_REQUIRED")) as GapCatalog }],
    ["GAP_SEVERITY_MISMATCH", () => makeEnvelope(), { catalog: { ...sharedGapCatalog, ATTRIBUTION_REQUIRED: { ...sharedGapCatalog.ATTRIBUTION_REQUIRED, severity: "WARNING" } } as GapCatalog }],
    ["INPUT_GAP_MISSING", () => { const e = makeEnvelope(); e.gaps = e.gaps.filter((gap) => gap.code !== "ATTRIBUTION_REQUIRED"); return reseal(e); }],
    ["ATTRIBUTION_MISMATCH", () => { const e = makeEnvelope(); e.attribution = []; return reseal(e); }],
    ["RIGHTS_MISMATCH", () => { const e = makeEnvelope(); e.rights = { allowExport: false, denials: [{ inputId: "dc:version-1", reason: "EXPORT_NOT_ALLOWED" }] }; return reseal(e); }],
    ["REQUEST_HASH_MISMATCH", () => { const e = makeEnvelope(); e.determinism.requestHash = "b".repeat(64); return e; }],
    ["INPUTS_HASH_MISMATCH", () => { const e = makeEnvelope(); e.determinism.inputsHash = "b".repeat(64); return e; }],
    ["OUTPUT_HASH_MISMATCH", () => { const e = makeEnvelope(); e.determinism.outputHash = "b".repeat(64); return e; }],
    ["STATUS_MISMATCH", () => { const e = makeEnvelope(); e.status = "COMPLETED_WITH_GAPS"; return rehash(e); }],
    ["POLICY_UNKNOWN", () => { const e = makeEnvelope(); e.results[0]!.metrics[0]!.confidence!.policyId = "other-confidence-v1"; return reseal(e); }],
    ["BREAKDOWN_POLICY_MISMATCH", () => { const e = makeEnvelope(); e.engine.policies[0]!.thresholds.high = 80; return reseal(e); }],
    ["UNREGISTERED_INPUT_IN_PRODUCTION", () => sampleEnvelope(makeMetric({ inputRefs: [sample.id], confidence: makeBreakdown([40, 30, 30], ["MAP_LAYER_UNREGISTERED"], sample.id) }), true, "production")],
    ["CONFIDENCE_ABOVE_CAP", () => sampleEnvelope(makeMetric({ inputRefs: [sample.id], confidence: makeBreakdown([40, 30, 30], [], sample.id) }), true)],
    ["COUNT_NOT_INVENTORY_UNGUARDED", () => sampleEnvelope(sampleCount(), false)],
    ["COUNT_ZERO_FROM_SAMPLE", () => sampleEnvelope(sampleCount({ value: 0 }), true)],
    ["EXPIRED_INPUT_VALUED", () => makeEnvelope({ inputs: [makeInput({ freshness: { status: "EXPIRED", sourcePublishedAt: "2026-01-01T00:00:00.000Z", freshnessDays: 90, expiresAt: "2026-10-01T00:00:00.000Z" } })] })],
    ["COST_OVER_BUDGET", () => { const e = makeEnvelope(); e.limits.costUnits = 2000; return reseal(e); }],
    ["TIMING_INVERTED", () => { const e = makeEnvelope(); e.timing.finishedAt = "2026-10-20T12:00:00.000Z"; return reseal(e); }],
  ];

  it.each(cases.map(([code, build, options]) => [code, build, options] as const))("detects %s and nothing else", (code, build, options) => {
    expect(codes(build(), options)).toEqual([code]);
  });

  it("covers every violation code", () => {
    expect(cases.map(([code]) => code).sort()).toEqual([...envelopeViolationCodes].sort());
  });

  it("reports a count over sample data above LOW even when the layer is registered", () => {
    const registeredSample = makeInput({ id: "dc:sample", completeness: "SAMPLE" });
    const metric = makeMetric({ key: "catchment.r500.count.poi:hospital", valueKind: "COUNT", unit: "count", value: 3, inputRefs: [registeredSample.id], confidence: makeBreakdown([40, 30, 30], [], registeredSample.id) });
    const envelope = makeEnvelope({ inputs: [registeredSample], metrics: [metric], extraGaps: [createGap(sharedGapCatalog, "COUNT_IS_NOT_AN_INVENTORY", {}, { inputId: registeredSample.id })] });
    expect(codes(envelope)).toEqual(["CONFIDENCE_ABOVE_CAP"]);
  });

  it("allows a zero count when the data is a declared inventory", () => {
    const envelope = makeEnvelope({ metrics: [makeMetric({ key: "catchment.r500.count.poi:hospital", valueKind: "COUNT", unit: "count", value: 0 })] });
    expect(findEnvelopeViolations(envelope)).toEqual([]);
  });

  it("fails closed with a CONTRACT_VIOLATION that names the codes", () => {
    const envelope = makeEnvelope();
    envelope.limits.costUnits = 2000;
    try { assertEnvelope(envelope); expect.unreachable(); }
    catch (error) {
      expect(error).toBeInstanceOf(EngineError);
      expect(error).toMatchObject({ code: "CONTRACT_VIOLATION", status: 500 });
      expect((error as EngineError).details).toMatchObject({ count: 2, codes: "OUTPUT_HASH_MISMATCH,COST_OVER_BUDGET" });
    }
  });
});
