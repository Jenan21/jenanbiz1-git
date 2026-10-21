import {
  buildConfidenceBreakdown, computeDeterminism, deriveAttribution, deriveInputGaps, deriveRights, deriveRunStatus, normalizeGaps,
  type ConfidenceBreakdown, type ConfidencePolicyDescriptor, type EngineInput, type EngineMetric, type EngineEnvironment, type Gap, type RunEnvelope,
} from "@/services/analysis-engines/shared";

/** Test-only builders for valid contract objects. A test mutates exactly one thing and expects exactly the matching violation. */
export const digest = "a".repeat(64);
export const evaluatedAt = "2026-10-20T12:00:00.000Z";
const text = (en: string) => ({ ar: `نص عربي: ${en}`, en });

// Wording about data states facts. It must never judge a location, recommend an action or state a probability (policy disclaimers may negate these words).
export const verdictEnglish = /\b(excellent|ideal|perfect|best|worst|recommend\w*|viable|feasible|profitable|promising|attractive|success\w*|chance|probab\w*|likel\w*|guarantee\w*|good|bad|great)\b|open the project/i;
export const verdictArabic = /(ممتاز|مثالي|الأفضل|أفضل|يوصى|نوصي|توصية|مربح|ناجح|نجاح|احتمال|فرصة|جيد|سيئ|جدوى|افتح المشروع)/;

export const testPolicy: ConfidencePolicyDescriptor = {
  id: "test-confidence-v1", version: "1.0.0", kind: "EXPLAINABLE_HEURISTIC", scale: "POINTS_100", isProbability: false,
  thresholds: { high: 75, medium: 50, low: 25 },
  factors: [
    { key: "coverage", maxPoints: 40, description: text("coverage") },
    { key: "freshness", maxPoints: 30, description: text("freshness") },
    { key: "quality", maxPoints: 30, description: text("quality") },
  ],
  caps: [
    { code: "COUNT_IS_NOT_AN_INVENTORY", maxBand: "LOW", appliesWhen: text("count from a sample") },
    { code: "MAP_LAYER_UNREGISTERED", maxBand: "MEDIUM", appliesWhen: text("unregistered layer") },
  ],
  methodology: text("points are granted by documented rules"), disclaimer: text("this is not a probability"),
};

export function makeBreakdown(points: readonly [number, number, number] = [40, 30, 30], caps: ReadonlyArray<"COUNT_IS_NOT_AN_INVENTORY" | "MAP_LAYER_UNREGISTERED"> = [], inputId: string | null = "dc:version-1"): ConfidenceBreakdown {
  const keys = ["coverage", "freshness", "quality"] as const;
  const maxima = [40, 30, 30] as const;
  return buildConfidenceBreakdown(
    testPolicy,
    keys.map((key, index) => ({ key, maxPoints: maxima[index] as number, points: points[index] as number, inputId, explanation: text(key) })),
    caps.map((code) => ({ code, maxBand: testPolicy.caps.find((cap) => cap.code === code)?.maxBand ?? "LOW", reason: text(code) })),
  );
}

export function makeInput(over: Partial<EngineInput> = {}): EngineInput {
  return {
    id: "dc:version-1", roles: ["poi:hospital"], kind: "DATA_CENTER_VERSION", governance: "DC_PUBLISHED",
    ref: { system: "DATA_CENTER", id: "version-1", version: 3, label: "Hospitals atlas" },
    checksum: { algorithm: "SHA-256", value: digest },
    source: { name: "Atlas", organization: "Atlas Authority", url: "https://atlas.example.test" },
    ownership: "THIRD_PARTY", license: "ODbL-1.0", licenseClass: "OPEN_LICENSE", usagePolicy: "Share-alike; credit required",
    attribution: { text: "© Atlas contributors", required: true }, allowExport: true,
    completeness: "INVENTORY", evidenceStatus: "VERIFIED",
    quality: { status: "MEASURED", score: 0.9, method: "register-check", methodVersion: "1", measuredAt: "2026-10-01T00:00:00.000Z", explanation: "Compared with an official register" },
    freshness: { status: "FRESH", sourcePublishedAt: "2026-09-01T00:00:00.000Z", freshnessDays: 90, expiresAt: null },
    coverage: { crs: "WGS84", countryCodes: ["SA"], regionCodes: [], boundingBox: { west: 34.5, south: 16, east: 55.7, north: 32.2 } },
    limitations: [],
    ...over,
  };
}

/** A Map layer that is not registered: the shape the engines accept only outside production. */
export function makeUnregisteredSampleInput(over: Partial<EngineInput> = {}): EngineInput {
  return makeInput({
    id: "map:sample:pois", roles: ["poi:hospital"], kind: "MAP_LAYER", governance: "MAP_UNREGISTERED",
    ref: { system: "JENAN_MAP", id: "release-1/pois", version: null, label: "Sample POIs" }, checksum: null,
    ownership: "THIRD_PARTY", license: "ODbL-1.0", licenseClass: null, usagePolicy: null,
    attribution: { text: "© OpenStreetMap contributors", required: true }, allowExport: false, completeness: "SAMPLE", evidenceStatus: null,
    quality: { status: "UNAVAILABLE" }, freshness: { status: "UNKNOWN", sourcePublishedAt: null, freshnessDays: null, expiresAt: null }, coverage: null,
    ...over,
  });
}

export function makeEngineRunInput(over: Partial<EngineInput> = {}): EngineInput {
  return makeInput({
    id: "run:spatial-1", roles: ["context:spatial"], kind: "ENGINE_RUN", governance: "ENGINE_OUTPUT",
    ref: { system: "ANALYSIS_ENGINE", id: "spatial-1", version: null, label: "Spatial run spatial-1" }, checksum: { algorithm: "SHA-256", value: digest },
    ownership: "PLATFORM_OWNED", license: "Derived result", licenseClass: null, usagePolicy: null, attribution: { text: null, required: false }, completeness: "INVENTORY",
    evidenceStatus: "DERIVED", coverage: null, ...over,
  });
}

export function makeMetric(over: Partial<EngineMetric> = {}): EngineMetric {
  return {
    key: "proximity.poi:hospital.n1.distance", label: { ar: "أقرب مستشفى", en: "Nearest hospital" }, status: "COMPUTED", platformState: "COMPUTED",
    valueKind: "DISTANCE", unit: "m", value: 1250, interpretation: "MAPPED_FEATURES_ONLY", inputRefs: ["dc:version-1"], confidence: makeBreakdown(), limitations: [], ...over,
  };
}

export type TestEnvelope = RunEnvelope & Record<string, unknown>;
export interface EnvelopeOptions { environment?: EngineEnvironment; inputs?: EngineInput[]; metrics?: EngineMetric[]; extraGaps?: Gap[] }
const byId = (first: { id: string }, second: { id: string }) => (first.id < second.id ? -1 : first.id > second.id ? 1 : 0);
const byKey = (first: { key: string }, second: { key: string }) => (first.key < second.key ? -1 : first.key > second.key ? 1 : 0);

/** Recomputes everything derived from the content (status and hashes) after a test changed the content on purpose. */
export function reseal<T extends TestEnvelope>(envelope: T): T {
  envelope.status = deriveRunStatus(envelope.results.flatMap((result) => result.metrics), envelope.gaps);
  envelope.determinism = computeDeterminism(envelope);
  return envelope;
}

export function makeEnvelope(options: EnvelopeOptions = {}): TestEnvelope {
  const inputs = [...(options.inputs ?? [makeInput()])].sort(byId);
  const metrics = [...(options.metrics ?? [makeMetric()])].sort(byKey);
  const gaps = normalizeGaps([...inputs.flatMap((input) => deriveInputGaps(input)), ...(options.extraGaps ?? [])]);
  const envelope = {
    contract: "test.engine.result/v1", runId: "run-1", evaluatedAt,
    engine: { key: "test", version: "1.0.0", contracts: { request: "test.engine.request/v1", result: "test.engine.result/v1" }, environment: options.environment ?? "test", policies: [testPolicy] },
    status: "COMPLETED" as const,
    request: { normalized: { analyses: ["PROXIMITY"], radiiMeters: [500, 1000, 3000, 5000] }, defaultsApplied: ["parameters.radiiMeters"], mapLayerPolicy: "ALLOW_UNREGISTERED" },
    inputs,
    dataAvailability: inputs.map((input) => ({ role: input.roles[0] as string, status: "AVAILABLE" as const, inputIds: [input.id] })),
    results: [{ analysis: "PROXIMITY", target: "primary", metrics }],
    gaps,
    attribution: deriveAttribution(inputs),
    rights: deriveRights(inputs),
    determinism: { requestHash: digest, inputsHash: digest, outputHash: digest },
    limits: { costUnits: 10, budgetUnits: 1000 },
    timing: { startedAt: "2026-10-20T12:00:00.100Z", finishedAt: "2026-10-20T12:00:00.250Z", durationMs: 150 },
  };
  return reseal(structuredClone(envelope) as unknown as TestEnvelope);
}
