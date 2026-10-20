import { z } from "zod";
import { boundingBoxSchema, countryCodeSchema, evidenceStates, licenseClasses, ownerships, regionCodeSchema } from "@/services/data-center/contracts";
import { canonicalHash, canonicalize, compareText, omitKeys } from "./canonical";
import { confidenceBreakdownSchema, confidencePolicyDescriptorSchema, findBreakdownPolicyViolations, type ConfidencePolicyDescriptor } from "./confidence";
import { EngineError } from "./errors";
import { createGap, hasGap, isNormalizedGapList, normalizeGaps, sharedGapCatalog, type Gap, type GapCatalog, type SharedGapCode } from "./gaps";
import { bilingualSchema, identifierSchema, longTextSchema, metricKeySchema, sha256Schema, shortTextSchema, timestampSchema } from "./primitives";
import { allowedPlatformStates, bandRank, engineEnvironments, isValuelessStatus, metricStatuses, platformMetricStates, type EngineEnvironment, type MetricStatus, type RunStatus } from "./states";

/**
 * Contract building blocks shared by every analysis engine: what an input looks like once it has been resolved, what a
 * measurement looks like, and the members every result envelope carries (rights, attribution, determinism, limits, timing).
 * Everything here is pure; the Data Center and the Map are described by value, never imported or queried.
 *
 * The invariants are written once, as plain functions, and used both by the schemas and by `findEnvelopeViolations`, so a result
 * that breaks the rules (a count presented as an inventory, a value for expired data, a confidence above its cap) cannot be
 * produced by accident and fails closed.
 */

// ---------------------------------------------------------------------------------------------------------------- vocabulary
export const inputKinds = ["DATA_CENTER_VERSION", "MAP_LAYER", "ENGINE_RUN"] as const;
export type InputKind = typeof inputKinds[number];
export const inputGovernances = ["DC_PUBLISHED", "MAP_REGISTERED", "MAP_UNREGISTERED", "ENGINE_OUTPUT"] as const;
export type InputGovernance = typeof inputGovernances[number];
export const referenceSystems = ["DATA_CENTER", "JENAN_MAP", "ANALYSIS_ENGINE"] as const;
export type ReferenceSystem = typeof referenceSystems[number];
/** INVENTORY: the data claims to list every feature of its kind in its coverage. SAMPLE: it does not. UNKNOWN: nobody declared it. */
export const completenessLevels = ["INVENTORY", "SAMPLE", "UNKNOWN"] as const;
export type Completeness = typeof completenessLevels[number];
export const freshnessStatuses = ["FRESH", "STALE", "EXPIRED", "UNKNOWN"] as const;
export type FreshnessStatus = typeof freshnessStatuses[number];

const kindOfGovernance: Record<InputGovernance, InputKind> = { DC_PUBLISHED: "DATA_CENTER_VERSION", MAP_REGISTERED: "MAP_LAYER", MAP_UNREGISTERED: "MAP_LAYER", ENGINE_OUTPUT: "ENGINE_RUN" };
const systemOfKind: Record<InputKind, ReferenceSystem> = { DATA_CENTER_VERSION: "DATA_CENTER", MAP_LAYER: "JENAN_MAP", ENGINE_RUN: "ANALYSIS_ENGINE" };

const isSortedUnique = (values: readonly string[]) => values.every((value, index) => index === 0 || compareText(values[index - 1] as string, value) < 0);

// ------------------------------------------------------------------------------------------------------------ input descriptor
const assessmentShape = { method: shortTextSchema, methodVersion: shortTextSchema, measuredAt: timestampSchema, explanation: longTextSchema };
export const inputQualitySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("UNAVAILABLE") }).strict(),
  z.object({ status: z.literal("INSUFFICIENT_DATA"), ...assessmentShape }).strict(),
  z.object({ status: z.literal("MEASURED"), score: z.number().min(0).max(1), ...assessmentShape }).strict(),
]);
export const inputFreshnessSchema = z.object({
  status: z.enum(freshnessStatuses),
  sourcePublishedAt: timestampSchema.nullable(),
  freshnessDays: z.number().int().min(1).max(3650).nullable(),
  expiresAt: timestampSchema.nullable(),
}).strict();
export const inputCoverageSchema = z.object({
  crs: z.literal("WGS84"),
  countryCodes: z.array(countryCodeSchema).max(250),
  regionCodes: z.array(regionCodeSchema).max(500),
  boundingBox: boundingBoxSchema.nullable(),
}).strict();

const engineInputObject = z.object({
  id: identifierSchema,
  roles: z.array(z.string().min(1).max(80)).min(1).max(32),
  kind: z.enum(inputKinds),
  governance: z.enum(inputGovernances),
  ref: z.object({ system: z.enum(referenceSystems), id: identifierSchema, version: z.number().int().min(1).nullable(), label: shortTextSchema }).strict(),
  checksum: z.object({ algorithm: z.literal("SHA-256"), value: sha256Schema }).strict().nullable(),
  source: z.object({ name: shortTextSchema, organization: shortTextSchema.nullable(), url: z.string().max(2000).nullable() }).strict(),
  ownership: z.enum(ownerships),
  license: shortTextSchema,
  licenseClass: z.enum(licenseClasses).nullable(),
  usagePolicy: longTextSchema.nullable(),
  attribution: z.object({ text: longTextSchema.nullable(), required: z.boolean() }).strict(),
  allowExport: z.boolean(),
  completeness: z.enum(completenessLevels),
  evidenceStatus: z.enum(evidenceStates).nullable(),
  quality: inputQualitySchema,
  freshness: inputFreshnessSchema,
  coverage: inputCoverageSchema.nullable(),
  limitations: z.array(shortTextSchema).max(20),
}).strict();
export type EngineInput = z.infer<typeof engineInputObject>;

export function findInputViolations(input: EngineInput): string[] {
  const problems: string[] = [];
  if (kindOfGovernance[input.governance] !== input.kind) problems.push(`Governance ${input.governance} belongs to kind ${kindOfGovernance[input.governance]}`);
  if (systemOfKind[input.kind] !== input.ref.system) problems.push(`Kind ${input.kind} is referenced in ${systemOfKind[input.kind]}`);
  if (!isSortedUnique(input.roles)) problems.push("roles must be unique and sorted");
  if (!isSortedUnique(input.limitations)) problems.push("limitations must be unique and sorted");
  if (input.attribution.required && input.attribution.text === null) problems.push("Mandatory attribution needs its text");
  if (input.licenseClass === "JENAN_OWNED" && input.ownership !== "PLATFORM_OWNED") problems.push("JENAN_OWNED requires platform ownership");
  if (input.licenseClass === "RESTRICTED" && input.allowExport) problems.push("RESTRICTED data cannot allow export");
  if (input.governance === "DC_PUBLISHED" && (input.checksum === null || input.ref.version === null)) problems.push("A published Data Center version needs its checksum and version number");
  const { freshness } = input;
  if ((freshness.status === "FRESH" || freshness.status === "STALE") && (freshness.sourcePublishedAt === null || freshness.freshnessDays === null)) problems.push("FRESH and STALE need the source date and the freshness period");
  if (freshness.status === "UNKNOWN" && freshness.sourcePublishedAt !== null) problems.push("UNKNOWN freshness means the source date is not known");
  if (input.coverage) {
    if (new Set(input.coverage.countryCodes).size !== input.coverage.countryCodes.length || new Set(input.coverage.regionCodes).size !== input.coverage.regionCodes.length) problems.push("Coverage codes must be unique");
    if (!input.coverage.regionCodes.every((region) => input.coverage?.countryCodes.includes(region.slice(0, 2)))) problems.push("Every region code needs its country in countryCodes");
  }
  return problems;
}
export const engineInputSchema = engineInputObject.superRefine((input, context) => {
  for (const message of findInputViolations(input)) context.addIssue({ code: "custom", message });
});

/**
 * The gaps that follow from an input's own description (freshness, quality, completeness, rights, registration). Engines add
 * these to every run, and the envelope validator requires them, so a limitation of the data can never be left out of a result.
 */
export function deriveInputGaps(input: EngineInput): Gap[] {
  const parameters = { dataset: input.ref.label };
  const gaps: Gap[] = [];
  const add = (code: SharedGapCode) => gaps.push(createGap(sharedGapCatalog, code, parameters, { inputId: input.id }));
  const external = input.kind !== "ENGINE_RUN";
  if (input.freshness.status === "EXPIRED") add("DATA_EXPIRED");
  else if (input.freshness.status === "STALE") add("DATA_STALE");
  else if (input.freshness.status === "UNKNOWN") add("FRESHNESS_UNKNOWN");
  if (input.quality.status === "UNAVAILABLE") add("QUALITY_UNAVAILABLE");
  else if (input.quality.status === "INSUFFICIENT_DATA") add("QUALITY_INSUFFICIENT_DATA");
  if (input.completeness === "SAMPLE") add("COMPLETENESS_SAMPLE");
  else if (input.completeness === "UNKNOWN") add("COMPLETENESS_UNKNOWN");
  if (input.governance === "MAP_UNREGISTERED") add("MAP_LAYER_UNREGISTERED");
  if (external && input.licenseClass === null) add("LICENSE_CLASS_UNDECLARED");
  if (input.licenseClass === "RESTRICTED") add("LICENSE_CLASS_RESTRICTED");
  else if (!input.allowExport) add("EXPORT_NOT_PERMITTED");
  if (input.attribution.required) add("ATTRIBUTION_REQUIRED");
  if (external && input.coverage === null) add("COVERAGE_UNDECLARED");
  return normalizeGaps(gaps);
}

// -------------------------------------------------------------------------------------------------------------------- metrics
/**
 * Later engines extend these vocabularies in their own commit, with tests (for example currency amounts or ratios for the
 * financial engine); an existing member never changes meaning.
 */
export const valueKinds = ["DISTANCE", "AREA", "COUNT", "DENSITY", "POPULATION", "CATEGORICAL", "BOOLEAN", "TEXT"] as const;
export type ValueKind = typeof valueKinds[number];
export const metricUnits = ["m", "km", "km2", "count", "per_km2", "people", "none"] as const;
export type MetricUnit = typeof metricUnits[number];
/**
 * What a value means. MAPPED_FEATURES_ONLY: it describes the features present in the data used, not the real world.
 * MEASURED_GEOMETRY: it is a measurement of geometry (the request's own, or a derived shape). ESTIMATE: it relies on an assumption.
 */
export const interpretations = ["MAPPED_FEATURES_ONLY", "MEASURED_GEOMETRY", "ESTIMATE"] as const;
export type Interpretation = typeof interpretations[number];
const unitsByKind: Record<ValueKind, readonly MetricUnit[]> = {
  DISTANCE: ["m", "km"], AREA: ["km2"], COUNT: ["count"], DENSITY: ["per_km2"], POPULATION: ["people"], CATEGORICAL: ["none"], BOOLEAN: ["none"], TEXT: ["none"],
};
const numericKinds: readonly ValueKind[] = ["DISTANCE", "AREA", "COUNT", "DENSITY", "POPULATION"];
const integerKinds: readonly ValueKind[] = ["COUNT", "POPULATION"];

const engineMetricObject = z.object({
  key: metricKeySchema,
  label: bilingualSchema,
  status: z.enum(metricStatuses),
  platformState: z.enum(platformMetricStates),
  valueKind: z.enum(valueKinds),
  unit: z.enum(metricUnits),
  value: z.union([z.number(), z.string().min(1).max(1000), z.boolean()]).nullable(),
  interpretation: z.enum(interpretations),
  inputRefs: z.array(identifierSchema).max(32),
  confidence: confidenceBreakdownSchema.nullable(),
  limitations: z.array(shortTextSchema).max(10),
}).strict();
export type EngineMetric = z.infer<typeof engineMetricObject>;

export function findMetricViolations(metric: EngineMetric): string[] {
  const problems: string[] = [];
  const { status, value, valueKind } = metric;
  if (isValuelessStatus(status)) {
    if (value !== null) problems.push(`${status} carries no value: a missing measurement is never replaced by a number`);
    if (metric.confidence !== null) problems.push(`${status} carries no confidence`);
  } else if (value === null) problems.push(`${status} needs a value`);
  if ((status === "ESTIMATED") !== (metric.interpretation === "ESTIMATE")) problems.push("ESTIMATED status and ESTIMATE interpretation go together");
  if (!unitsByKind[valueKind].includes(metric.unit)) problems.push(`Unit ${metric.unit} does not fit ${valueKind}`);
  if (!allowedPlatformStates(status).includes(metric.platformState)) problems.push(`platformState ${metric.platformState} does not fit ${status}`);
  if (value !== null) {
    if (numericKinds.includes(valueKind)) {
      if (typeof value !== "number" || value < 0) problems.push(`${valueKind} needs a number that is not negative`);
      else if (integerKinds.includes(valueKind) && !Number.isInteger(value)) problems.push(`${valueKind} needs a whole number`);
    } else if (valueKind === "BOOLEAN" ? typeof value !== "boolean" : typeof value !== "string") problems.push(`${valueKind} has the wrong value type`);
  }
  if ((valueKind === "COUNT" || valueKind === "DENSITY") && metric.interpretation !== "MAPPED_FEATURES_ONLY") problems.push(`${valueKind} describes mapped features only`);
  if (valueKind === "POPULATION" && metric.interpretation === "MEASURED_GEOMETRY") problems.push("POPULATION is mapped values or an estimate, never a geometry measurement");
  if (value !== null) {
    const derivedFromRequest = metric.inputRefs.length === 0 && metric.interpretation === "MEASURED_GEOMETRY";
    if (derivedFromRequest && metric.confidence !== null) problems.push("A measurement derived from the request alone carries no confidence");
    if (!derivedFromRequest && metric.confidence === null) problems.push("A valued metric needs its confidence breakdown");
  }
  if (!isSortedUnique(metric.inputRefs)) problems.push("inputRefs must be unique and sorted");
  if (!isSortedUnique(metric.limitations)) problems.push("limitations must be unique and sorted");
  return problems;
}
export const engineMetricSchema = engineMetricObject.superRefine((metric, context) => {
  for (const message of findMetricViolations(metric)) context.addIssue({ code: "custom", message });
});

// -------------------------------------------------------------------------------------------------------- envelope building blocks
export const availabilityStatuses = ["AVAILABLE", "NOT_AVAILABLE", "NO_COVERAGE", "EXPIRED"] as const;
export const dataAvailabilitySchema = z.object({
  role: z.string().min(1).max(80),
  status: z.enum(availabilityStatuses),
  inputIds: z.array(identifierSchema).max(32),
}).strict().superRefine((availability, context) => {
  if ((availability.status === "NOT_AVAILABLE") !== (availability.inputIds.length === 0)) context.addIssue({ code: "custom", message: "NOT_AVAILABLE means no dataset was found; every other state names the datasets considered" });
  if (!isSortedUnique(availability.inputIds)) context.addIssue({ code: "custom", message: "inputIds must be unique and sorted" });
});
export type DataAvailability = z.infer<typeof dataAvailabilitySchema>;

export const attributionEntrySchema = z.object({ text: longTextSchema, required: z.boolean(), inputIds: z.array(identifierSchema).min(1).max(200) }).strict();
export type AttributionEntry = z.infer<typeof attributionEntrySchema>;

export const exportDenialReasons = ["EXPORT_NOT_ALLOWED", "LICENSE_CLASS_UNDECLARED", "LICENSE_CLASS_RESTRICTED"] as const;
export const rightsSchema = z.object({
  allowExport: z.boolean(),
  denials: z.array(z.object({ inputId: identifierSchema, reason: z.enum(exportDenialReasons) }).strict()).max(600),
}).strict().refine((rights) => rights.allowExport === (rights.denials.length === 0), "allowExport is false exactly when there are denials");
export type Rights = z.infer<typeof rightsSchema>;

export const determinismSchema = z.object({ requestHash: sha256Schema, inputsHash: sha256Schema, outputHash: sha256Schema }).strict();
export type Determinism = z.infer<typeof determinismSchema>;

export const limitsShape = { costUnits: z.number().min(0).max(10_000_000), budgetUnits: z.number().positive().max(1_000_000) };
export const timingSchema = z.object({ startedAt: timestampSchema, finishedAt: timestampSchema, durationMs: z.number().int().min(0).max(86_400_000) }).strict();

export const engineIdentityShape = {
  key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+(-[a-z0-9.]+)?$/),
  contracts: z.object({ request: z.string().min(1).max(120), result: z.string().min(1).max(120) }).strict(),
  environment: z.enum(engineEnvironments),
  policies: z.array(confidencePolicyDescriptorSchema).min(1).max(8),
};

// --------------------------------------------------------------------------------------------------------------- derivations
/** Export is allowed only when every input allows it, has a declared license class, and is not restricted (undeclared fails closed). */
export function deriveRights(inputs: readonly EngineInput[]): Rights {
  const denials: Rights["denials"] = [];
  for (const input of inputs) {
    if (!input.allowExport) denials.push({ inputId: input.id, reason: "EXPORT_NOT_ALLOWED" });
    if (input.licenseClass === "RESTRICTED") denials.push({ inputId: input.id, reason: "LICENSE_CLASS_RESTRICTED" });
    if (input.licenseClass === null && input.kind !== "ENGINE_RUN") denials.push({ inputId: input.id, reason: "LICENSE_CLASS_UNDECLARED" });
  }
  denials.sort((first, second) => compareText(first.inputId, second.inputId) || compareText(first.reason, second.reason));
  return { allowExport: denials.length === 0, denials };
}

/** Attribution texts of every input, grouped by text (required when any of its inputs requires it) and sorted. */
export function deriveAttribution(inputs: readonly EngineInput[]): AttributionEntry[] {
  const grouped = new Map<string, { required: boolean; inputIds: Set<string> }>();
  for (const input of inputs) {
    if (input.attribution.text === null) continue;
    const entry = grouped.get(input.attribution.text) ?? { required: false, inputIds: new Set<string>() };
    entry.required ||= input.attribution.required;
    entry.inputIds.add(input.id);
    grouped.set(input.attribution.text, entry);
  }
  return [...grouped.entries()]
    .map(([text, entry]) => ({ text, required: entry.required, inputIds: [...entry.inputIds].sort(compareText) }))
    .sort((first, second) => compareText(first.text, second.text));
}

/**
 * COMPLETED only when every measurement was computed and nothing worse than information was reported. FAILED when nothing at all
 * could be produced and something blocked it. Everything else is a useful but limited result.
 */
export function deriveRunStatus(metrics: ReadonlyArray<{ status: MetricStatus }>, gaps: ReadonlyArray<Pick<Gap, "severity">>): RunStatus {
  if (metrics.length === 0 && gaps.some((gap) => gap.severity === "BLOCKING")) return "FAILED";
  if (metrics.length > 0 && metrics.every((metric) => metric.status === "COMPUTED") && !gaps.some((gap) => gap.severity !== "INFO")) return "COMPLETED";
  return "COMPLETED_WITH_GAPS";
}

/** Members that change on every execution and are therefore left out of the output hash (the hashes themselves cannot hash themselves). */
export const VOLATILE_ENVELOPE_KEYS = ["runId", "timing", "determinism"] as const;
/** The request as the engine understood it, without the list of defaults it filled in (whether a default was typed or omitted does not change the analysis). */
export const computeRequestHash = (request: Record<string, unknown>) => canonicalHash(omitKeys(request, ["defaultsApplied"]));
export const computeInputsHash = (inputs: readonly unknown[]) => canonicalHash(inputs);
export const computeOutputHash = (envelope: object) => canonicalHash(omitKeys(envelope as Record<string, unknown>, VOLATILE_ENVELOPE_KEYS));
/** Hashes for an envelope that has everything except `determinism` yet. */
export function computeDeterminism(envelope: { request: Record<string, unknown>; inputs: readonly unknown[] }): Determinism {
  return { requestHash: computeRequestHash(envelope.request), inputsHash: computeInputsHash(envelope.inputs), outputHash: computeOutputHash(envelope) };
}

// ----------------------------------------------------------------------------------------------------------- envelope validator
export interface EnvelopeView {
  evaluatedAt: string;
  engine: { environment: EngineEnvironment; policies: readonly ConfidencePolicyDescriptor[] };
  status: RunStatus;
  request: Record<string, unknown>;
  inputs: readonly EngineInput[];
  dataAvailability: readonly DataAvailability[];
  results: ReadonlyArray<{ metrics: readonly EngineMetric[] }>;
  gaps: readonly Gap[];
  attribution: readonly AttributionEntry[];
  rights: Rights;
  determinism: Determinism;
  limits: { costUnits: number; budgetUnits: number };
  timing: { startedAt: string; finishedAt: string; durationMs: number };
}

export const envelopeViolationCodes = [
  "EMPTY_ENVELOPE", "INPUT_ID_DUPLICATE", "INPUTS_UNSORTED", "AVAILABILITY_INPUT_UNRESOLVED", "METRIC_KEY_DUPLICATE", "METRICS_UNSORTED",
  "METRIC_INPUT_UNRESOLVED", "GAP_INPUT_UNRESOLVED", "GAPS_NOT_NORMALIZED", "GAP_CODE_UNKNOWN", "GAP_SEVERITY_MISMATCH", "INPUT_GAP_MISSING",
  "ATTRIBUTION_MISMATCH", "RIGHTS_MISMATCH", "REQUEST_HASH_MISMATCH", "INPUTS_HASH_MISMATCH", "OUTPUT_HASH_MISMATCH", "STATUS_MISMATCH",
  "POLICY_UNKNOWN", "BREAKDOWN_POLICY_MISMATCH", "UNREGISTERED_INPUT_IN_PRODUCTION", "CONFIDENCE_ABOVE_CAP", "COUNT_NOT_INVENTORY_UNGUARDED",
  "COUNT_ZERO_FROM_SAMPLE", "EXPIRED_INPUT_VALUED", "COST_OVER_BUDGET", "TIMING_INVERTED",
] as const;
export type EnvelopeViolationCode = typeof envelopeViolationCodes[number];
export interface EnvelopeViolation { code: EnvelopeViolationCode; path: string; detail: string }

/**
 * Cross-checks a whole result against the rules that no single schema can see: references resolve, hashes match, the status is the
 * derived one, rights and attribution follow from the inputs, and no measurement overstates what its data supports.
 */
export function findEnvelopeViolations(envelope: EnvelopeView, options: { catalog?: GapCatalog } = {}): EnvelopeViolation[] {
  const violations: EnvelopeViolation[] = [];
  const add = (code: EnvelopeViolationCode, path: string, detail: string) => { violations.push({ code, path, detail }); };
  const metrics = envelope.results.flatMap((result, resultIndex) => result.metrics.map((metric, metricIndex) => ({ metric, path: `results[${resultIndex}].metrics[${metricIndex}]` })));

  if (metrics.length === 0 && envelope.gaps.length === 0) add("EMPTY_ENVELOPE", "$", "A result needs at least one measurement or one gap");

  const inputIds = envelope.inputs.map((input) => input.id);
  if (new Set(inputIds).size !== inputIds.length) add("INPUT_ID_DUPLICATE", "inputs", "Input ids must be unique");
  if (inputIds.join("|") !== [...inputIds].sort(compareText).join("|")) add("INPUTS_UNSORTED", "inputs", "Inputs must be sorted by id");
  const byId = new Map(envelope.inputs.map((input) => [input.id, input]));

  envelope.dataAvailability.forEach((availability, index) => {
    for (const id of availability.inputIds) if (!byId.has(id)) add("AVAILABILITY_INPUT_UNRESOLVED", `dataAvailability[${index}]`, `Unknown input ${id}`);
  });

  envelope.results.forEach((result, resultIndex) => {
    const keys = result.metrics.map((metric) => metric.key);
    if (new Set(keys).size !== keys.length) add("METRIC_KEY_DUPLICATE", `results[${resultIndex}]`, "Metric keys must be unique within a result");
    if (keys.join("|") !== [...keys].sort(compareText).join("|")) add("METRICS_UNSORTED", `results[${resultIndex}]`, "Metrics must be sorted by key");
  });

  envelope.gaps.forEach((gap, index) => {
    if (gap.inputId !== undefined && !byId.has(gap.inputId)) add("GAP_INPUT_UNRESOLVED", `gaps[${index}]`, `Unknown input ${gap.inputId}`);
    const definition = options.catalog && Object.prototype.hasOwnProperty.call(options.catalog, gap.code) ? options.catalog[gap.code] : undefined;
    if (options.catalog && !definition) add("GAP_CODE_UNKNOWN", `gaps[${index}]`, `Gap code ${gap.code} is not in the engine catalog`);
    else if (definition && definition.severity !== gap.severity) add("GAP_SEVERITY_MISMATCH", `gaps[${index}]`, `Gap ${gap.code} is ${definition.severity} in the catalog`);
  });
  if (!isNormalizedGapList(envelope.gaps)) add("GAPS_NOT_NORMALIZED", "gaps", "Gaps must be unique and sorted by severity, code, input and subject");

  for (const input of envelope.inputs) {
    for (const gap of deriveInputGaps(input)) {
      if (!hasGap(envelope.gaps, gap.code, input.id)) add("INPUT_GAP_MISSING", `inputs[${input.id}]`, `Input ${input.id} requires the gap ${gap.code}`);
    }
  }

  if (canonicalize(deriveAttribution(envelope.inputs)) !== canonicalize(envelope.attribution)) add("ATTRIBUTION_MISMATCH", "attribution", "Attribution must be exactly what the inputs require");
  if (canonicalize(deriveRights(envelope.inputs)) !== canonicalize(envelope.rights)) add("RIGHTS_MISMATCH", "rights", "Rights must be exactly what the inputs allow");
  if (envelope.engine.environment === "production" && envelope.inputs.some((input) => input.governance === "MAP_UNREGISTERED")) add("UNREGISTERED_INPUT_IN_PRODUCTION", "inputs", "Production results cannot use unregistered Map layers");

  for (const { metric, path } of metrics) {
    const used = metric.inputRefs.map((id) => byId.get(id));
    metric.inputRefs.forEach((id) => { if (!byId.has(id)) add("METRIC_INPUT_UNRESOLVED", path, `Unknown input ${id}`); });
    const resolved = used.filter((input): input is EngineInput => input !== undefined);
    const breakdown = metric.confidence;
    if (breakdown) {
      const policy = envelope.engine.policies.find((candidate) => candidate.id === breakdown.policyId && candidate.version === breakdown.policyVersion);
      if (!policy) add("POLICY_UNKNOWN", path, `Policy ${breakdown.policyId}@${breakdown.policyVersion} is not declared by the engine`);
      else for (const detail of findBreakdownPolicyViolations(breakdown, policy)) add("BREAKDOWN_POLICY_MISMATCH", path, detail);
      if (resolved.some((input) => input.governance === "MAP_UNREGISTERED") && bandRank(breakdown.band) > bandRank("MEDIUM")) add("CONFIDENCE_ABOVE_CAP", path, "Unregistered layers cap confidence at MEDIUM");
    }
    if (metric.valueKind === "COUNT" || metric.valueKind === "DENSITY") {
      for (const input of resolved.filter((candidate) => candidate.completeness !== "INVENTORY")) {
        if (!hasGap(envelope.gaps, "COUNT_IS_NOT_AN_INVENTORY", input.id)) add("COUNT_NOT_INVENTORY_UNGUARDED", path, `${metric.valueKind} from ${input.id} needs the COUNT_IS_NOT_AN_INVENTORY gap`);
        if (breakdown && bandRank(breakdown.band) > bandRank("LOW")) add("CONFIDENCE_ABOVE_CAP", path, "Counts from data that is not an inventory cap confidence at LOW");
        if (metric.value === 0) add("COUNT_ZERO_FROM_SAMPLE", path, "Nothing found in data that is not an inventory is reported as NOT_FOUND_WITHIN_RADIUS, not as zero");
      }
    }
    if (metric.value !== null && resolved.some((input) => input.freshness.status === "EXPIRED")) add("EXPIRED_INPUT_VALUED", path, "Expired data cannot support a value");
  }

  const expectedStatus = deriveRunStatus(metrics.map((entry) => entry.metric), envelope.gaps);
  if (envelope.status !== expectedStatus) add("STATUS_MISMATCH", "status", `Status must be ${expectedStatus}`);
  if (envelope.determinism.requestHash !== computeRequestHash(envelope.request)) add("REQUEST_HASH_MISMATCH", "determinism.requestHash", "The request hash does not match the request");
  if (envelope.determinism.inputsHash !== computeInputsHash(envelope.inputs)) add("INPUTS_HASH_MISMATCH", "determinism.inputsHash", "The inputs hash does not match the inputs");
  if (envelope.determinism.outputHash !== computeOutputHash(envelope)) add("OUTPUT_HASH_MISMATCH", "determinism.outputHash", "The output hash does not match the result");
  if (envelope.limits.costUnits > envelope.limits.budgetUnits) add("COST_OVER_BUDGET", "limits", "The cost of a completed run cannot exceed its budget");
  if (Date.parse(envelope.timing.finishedAt) < Date.parse(envelope.timing.startedAt)) add("TIMING_INVERTED", "timing", "finishedAt precedes startedAt");
  return violations;
}

/** Fails closed: a result that breaks its own contract is a defect and is never returned. */
export function assertEnvelope(envelope: EnvelopeView, options: { catalog?: GapCatalog } = {}): void {
  const violations = findEnvelopeViolations(envelope, options);
  if (violations.length === 0) return;
  throw new EngineError("CONTRACT_VIOLATION", { count: violations.length, codes: [...new Set(violations.map((violation) => violation.code))].join(","), first: `${violations[0]?.path}: ${violations[0]?.detail}` });
}
