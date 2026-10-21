import { z } from "zod";
import { canonicalHash, canonicalize, compareText } from "../shared/canonical";
import {
  attributionEntrySchema, computeDeterminism, dataAvailabilitySchema, deriveAttribution, deriveRights, deriveRunStatus,
  determinismSchema, engineIdentityShape, engineInputSchema, findEnvelopeViolations, limitsShape, rightsSchema, timingSchema,
} from "../shared/contracts";
import { EngineError } from "../shared/errors";
import { createGap, gapSchema, normalizeGaps } from "../shared/gaps";
import { identifierSchema, sha256Schema } from "../shared/primitives";
import { COMPETITOR_ANALYTICS_VERSION, competitorAnalyticMetricSchema, evaluateCompetitorAnalytics, type CompetitorPrepared } from "./analytics";
import { competitorConfidencePolicy } from "./confidence";
import { competitorGapCatalog } from "./contracts";
import { competitorCoverageSchema } from "./counts";
import { competitorDiscoverySchema, competitorSourceReferenceSchema, type CompetitorDataPort } from "./data-port";
import { bindCompetitorDataset, competitorInputFromReference, isCompetitorReferenceEligible, prepareCompetitorData } from "./data-sources";
import { competitorDatasetCoverage, competitorDatasetSchema, typeKeyByCompetitorRole } from "./datasets";
import { classifyCompetitorLocations, competitorMatchSchema } from "./matching";
import {
  activeAt, COMPETITOR_REQUEST_CONTRACT, COMPETITOR_RESULT_CONTRACT, competitorEvidenceSchema, competitorRoles, competitorTimestampSchema, ensureSize, normalizeCompetitorEvidence, relationshipClasses,
} from "./model";
import { competitorRequestSchema, normalizeCompetitorRequest, type CompetitorRequest } from "./request";

const preparedSourceSchema = z.object({
  role: z.enum(competitorRoles), status: z.enum(["AVAILABLE", "NOT_AVAILABLE", "NO_COVERAGE", "NOT_COMPUTABLE"]),
  reason: z.string().min(1).max(1000), requestedVersionId: identifierSchema.nullable(),
  selection: competitorDiscoverySchema.nullable(), reference: competitorSourceReferenceSchema.nullable(),
  dataset: competitorDatasetSchema.nullable(), input: engineInputSchema.nullable(),
}).strict();
export const competitorPreparationSchema = z.object({
  contract: z.literal("jenan.competitor-analysis.prepared-inputs/v1"), evaluatedAt: competitorTimestampSchema,
  request: competitorRequestSchema, requestHash: sha256Schema,
  status: z.enum(["AVAILABLE", "NOT_AVAILABLE", "NO_COVERAGE", "NOT_COMPUTABLE"]), validationReason: z.string().min(1).max(2000).nullable(),
  sources: z.array(preparedSourceSchema).max(32), inputs: z.array(engineInputSchema).max(32), inputsHash: sha256Schema,
  evidence: competitorEvidenceSchema.nullable(), coverage: competitorCoverageSchema.nullable(),
  matches: z.array(competitorMatchSchema).max(2_000), rights: rightsSchema,
  attribution: z.array(attributionEntrySchema).max(32), gaps: z.array(gapSchema).max(2_000),
  work: z.object({ discoveries: z.number().int().nonnegative(), reads: z.number().int().nonnegative(), parsedRows: z.number().int().min(0).max(10_000) }).strict(),
}).strict();
export const competitorExecutionSchema = z.object({
  runId: identifierSchema, evaluatedAt: competitorTimestampSchema, environment: engineIdentityShape.environment, timing: timingSchema,
}).strict();
export type CompetitorExecution = z.infer<typeof competitorExecutionSchema>;
export const competitorAnalyticsResultSchema = z.object({
  contract: z.literal(COMPETITOR_RESULT_CONTRACT), runId: identifierSchema, evaluatedAt: competitorTimestampSchema,
  engine: z.object({ ...engineIdentityShape, key: z.literal("competitor-analysis"), version: z.literal(COMPETITOR_ANALYTICS_VERSION) }).strict(),
  request: z.object({ normalized: competitorRequestSchema, evaluatedAt: competitorTimestampSchema }).strict(),
  inputs: z.array(engineInputSchema).max(32),
  preparation: z.object({ current: competitorPreparationSchema, baseline: competitorPreparationSchema.nullable() }).strict(),
  inventory: z.array(z.object({
    locationId: identifierSchema, branchId: identifierSchema.nullable(), competitorEntityId: identifierSchema.nullable(),
    relationship: z.enum(relationshipClasses), includedLocation: z.boolean().nullable(), uniqueEntityEstablished: z.boolean(),
    reason: z.enum(["NOT_IN_FORCE", "OUTSIDE_SCOPE", "INACTIVE", "ACTIVITY_UNKNOWN", "RELATIONSHIP_UNKNOWN", "RELATIONSHIP_EXCLUDED", "LOCATION_IDENTITY_UNRESOLVED", "INCLUDED_LOCATION_ENTITY_UNRESOLVED", "INCLUDED"]),
  }).strict()).max(2_000),
  results: z.array(z.object({ key: identifierSchema, metrics: z.array(competitorAnalyticMetricSchema).max(500) }).strict()).max(7),
  dataAvailability: z.array(dataAvailabilitySchema).max(6), status: z.enum(["COMPLETED", "COMPLETED_WITH_GAPS", "FAILED"]),
  gaps: z.array(gapSchema).max(2_000), attribution: z.array(attributionEntrySchema).max(32), rights: rightsSchema,
  determinism: determinismSchema, limits: z.object(limitsShape).strict(), timing: timingSchema,
}).strict();
export type CompetitorAnalyticsResult = z.infer<typeof competitorAnalyticsResultSchema>;
const same = (left: unknown, right: unknown) => canonicalize(left) === canonicalize(right);

function baselineRequest(request: CompetitorRequest): CompetitorRequest | null {
  const historical = request.parameters?.historical;
  if (!request.analyses.includes("HISTORICAL_CHANGE") || !historical) return null;
  return {
    ...request, scope: { ...request.scope, asOf: historical.asOf },
    analyses: ["COUNTS", "IDENTITY_MATCHING"], data: { roles: historical.roles }, parameters: undefined,
  };
}
function selections(request: CompetitorRequest) {
  const roles = new Set<string>(["competitor.entities", "competitor.locations", "competitor.matching-rules", "competitor.dimensions", ...Object.keys(request.data.roles)]);
  if (request.analyses.includes("DIMENSION_COMPARISON")) roles.add("competitor.attributes");
  return [...roles].reduce((total, role) => {
    const selector = request.data.roles[role as typeof competitorRoles[number]];
    return total + (Array.isArray(selector) ? selector.length : 1);
  }, 0);
}
/** Trusted read capability is injected. Two dated snapshots are measurements, not M4 historical replay. */
export async function prepareCompetitorAnalysis(port: CompetitorDataPort, rawRequest: unknown, evaluatedAt: string) {
  const request = normalizeCompetitorRequest(rawRequest, evaluatedAt).normalized;
  const historicalRequest = baselineRequest(request);
  const historical = historicalRequest ? normalizeCompetitorRequest(historicalRequest, evaluatedAt).normalized : null;
  if (selections(request) + (historical ? selections(historical) : 0) > 32) throw new EngineError("REQUEST_TOO_LARGE", { first: "Current plus historical required roles exceed 32 versions" });
  const current = canonicalPreparation(await prepareCompetitorData(port, request, evaluatedAt));
  const baseline = historical ? canonicalPreparation(await prepareCompetitorData(port, historical, evaluatedAt)) : null;
  if (current.work.parsedRows + (baseline?.work.parsedRows ?? 0) > 10_000) throw new EngineError("REQUEST_TOO_LARGE", { first: "Current plus historical inputs exceed 10000 parsed rows" });
  return { current, baseline };
}
function canonicalPreparation(prepared: CompetitorPrepared): CompetitorPrepared {
  const copy = structuredClone(prepared);
  const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered).sort((a, b) => compareText(canonicalize(a), canonicalize(b)))
    : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, ordered(entry)])) : value;
  for (const source of copy.sources) if (source.dataset) source.dataset = competitorDatasetSchema.parse(ordered(source.dataset));
  if (copy.coverage) copy.coverage = competitorCoverageSchema.parse(ordered(copy.coverage));
  return copy;
}
function verifyPreparation(prepared: CompetitorPrepared) {
  const fail = (first: string): never => { throw new EngineError("CONTRACT_VIOLATION", { first }); };
  if (!same(prepared, canonicalPreparation(prepared))) fail("Prepared rows are not canonical");
  const sourceInputs = prepared.sources.flatMap((source) => source.input ? [source.input] : []).sort((a, b) => compareText(a.id, b.id));
  if (!same(sourceInputs, prepared.inputs) || !same(deriveRights(prepared.inputs), prepared.rights)
    || !same(deriveAttribution(prepared.inputs), prepared.attribution)) fail("Prepared inputs, rights or attribution do not match the selected sources");
  const bound = prepared.sources.flatMap((source) => {
    if (source.dataset === null || source.reference === null || source.input === null) {
      if (source.status === "AVAILABLE") fail("Available source lacks exact typed evidence");
      return [];
    }
    if (!same(competitorInputFromReference(source.reference, source.dataset), source.input)
      || source.dataset.sourceId !== source.reference.source.sourceId || source.dataset.role !== source.role
      || source.reference.dataset.typeKey !== typeKeyByCompetitorRole[source.role]
      || !isCompetitorReferenceEligible(source.reference, prepared.evaluatedAt, prepared.request.scope.asOf)
      || source.status === "AVAILABLE" && competitorDatasetCoverage(source.dataset, prepared.request.scope, prepared.request.competitorDefinition) !== "AVAILABLE") fail("Typed source and exact descriptor disagree");
    const selected = source.selection?.mode === "EXACT" ? source.selection.candidates.find((candidate) => candidate.reference.version.versionId === source.reference!.version.versionId) : source.selection?.selected;
    if (!selected || !same({ ...selected.reference, resolvedAt: null }, { ...source.reference, resolvedAt: null })) fail("Selected exact reference differs from captured source");
    return [bindCompetitorDataset(source.dataset, source.reference.version.versionId)];
  });
  if (prepared.status === "AVAILABLE") {
    if (prepared.validationReason || prepared.sources.some((source) => source.status !== "AVAILABLE") || !prepared.evidence || !prepared.coverage) fail("Usable preparation must contain complete validated evidence");
    const expectedEvidence = normalizeCompetitorEvidence({
      contract: "jenan.competitor-analysis.evidence/v1", inputs: prepared.inputs,
      permissions: prepared.inputs.map((input) => ({
        inputId: input.id, analysisUsage: "ALLOWED", policy: { id: "data-center-retrieval-policy", version: "1" }, validity: { start: prepared.evaluatedAt, end: null },
      })),
      sourceRecords: bound.flatMap((dataset) => dataset.sourceRecords),
      entities: bound.flatMap((dataset) => dataset.role === "competitor.entities" ? dataset.rows : []),
      locations: bound.flatMap((dataset) => dataset.role === "competitor.locations" ? dataset.rows : []),
      rules: bound.flatMap((dataset) => dataset.role === "competitor.matching-rules" ? dataset.rows : []),
    });
    const inventory = bound.flatMap((dataset) => dataset.role === "competitor.locations" ? [dataset.inventory] : []);
    if (inventory.length !== 1 || !same(expectedEvidence, prepared.evidence) || !same(inventory[0], prepared.coverage)
      || !same(classifyCompetitorLocations(expectedEvidence, prepared.request.scope, prepared.evaluatedAt), prepared.matches)) fail("Prepared identities, coverage or matching differ from captured typed datasets");
  } else if (prepared.evidence !== null || prepared.coverage !== null || prepared.matches.length) fail("Unavailable preparation cannot carry usable evidence");
}
function calculate(current: CompetitorPrepared, baseline: CompetitorPrepared | null, execution: CompetitorExecution) {
  const inputsById = new Map<string, z.infer<typeof engineInputSchema>>();
  for (const input of [...current.inputs, ...baseline?.inputs ?? []]) {
    const previous = inputsById.get(input.id);
    if (previous && !same(previous, input)) throw new EngineError("INVALID_INPUT", { first: "One exact version has contradictory input metadata across snapshots" });
    inputsById.set(input.id, input);
  }
  const inputs = [...inputsById.values()].sort((a, b) => compareText(a.id, b.id));
  if (inputs.length > 32) throw new EngineError("REQUEST_TOO_LARGE", { first: "Competitor input limit exceeded" });
  const metrics = evaluateCompetitorAnalytics(current, baseline);
  const inventory = current.evidence?.locations.map((location) => {
    const match = current.matches.find((candidate) => candidate.locationId === location.locationId)!;
    const currentRefs = (refs: typeof location.evidence) => refs.every((ref) => current.evidence!.sourceRecords.some((record) =>
      same({ inputId: record.inputId, sourceNamespace: record.sourceNamespace, sourceRecordId: record.sourceRecordId }, ref) && activeAt(record.validity, current.request.scope.asOf)));
    const uniqueEntityEstablished = location.entityLinkState === "RESOLVED" && currentRefs(location.entityLinkEvidence)
      && current.evidence!.entities.some((entity) => entity.competitorEntityId === location.competitorEntityId && entity.identityState === "RESOLVED"
        && activeAt(entity.validity, current.request.scope.asOf) && currentRefs(entity.evidence));
    const reason = !activeAt(location.validity, current.request.scope.asOf) ? "NOT_IN_FORCE" as const
      : !same(location.geography, current.request.scope.geography) ? "OUTSIDE_SCOPE" as const
        : current.request.activityFilter === "ACTIVE_ONLY" && location.operationalState === "INACTIVE" ? "INACTIVE" as const
          : current.request.activityFilter === "ACTIVE_ONLY" && ["UNKNOWN", "CONFLICTED"].includes(location.operationalState) ? "ACTIVITY_UNKNOWN" as const
            : match.relationship === "UNKNOWN" ? "RELATIONSHIP_UNKNOWN" as const
              : !current.request.relationships.includes(match.relationship) ? "RELATIONSHIP_EXCLUDED" as const
                : location.identityState !== "RESOLVED" ? "LOCATION_IDENTITY_UNRESOLVED" as const
                  : !uniqueEntityEstablished ? "INCLUDED_LOCATION_ENTITY_UNRESOLVED" as const : "INCLUDED" as const;
    return {
      locationId: location.locationId, branchId: location.branchId, competitorEntityId: location.competitorEntityId,
      relationship: match.relationship, uniqueEntityEstablished, reason,
      includedLocation: ["INCLUDED", "INCLUDED_LOCATION_ENTITY_UNRESOLVED"].includes(reason) ? true
        : ["ACTIVITY_UNKNOWN", "RELATIONSHIP_UNKNOWN", "LOCATION_IDENTITY_UNRESOLVED"].includes(reason) ? null : false,
    };
  }) ?? [];
  const results = [...new Set(metrics.map((metric) => metric.analysis))].sort(compareText).map((key) => ({
    key, metrics: metrics.filter((metric) => metric.analysis === key),
  }));
  const gaps = normalizeGaps([
    ...current.gaps, ...baseline?.gaps ?? [],
    ...metrics.filter((metric) => metric.value === null || metric.status === "PARTIAL").map((metric) =>
      createGap(competitorGapCatalog, metric.value === null ? "COMPETITOR_ANALYTICS_UNAVAILABLE" : "COMPETITOR_COVERAGE_INCOMPLETE", {}, { subject: metric.key })),
    ...(metrics.length ? [] : [createGap(competitorGapCatalog, "COMPETITOR_IDENTITY_INVENTORY", {}, { subject: "competitor.matches" })]),
  ]);
  const dataAvailability = competitorRoles.filter((role) => current.sources.some((source) => source.role === role) || baseline?.sources.some((source) => source.role === role)).map((role) => {
    const sources = [...current.sources, ...baseline?.sources ?? []].filter((source) => source.role === role);
    const status = sources.some((source) => source.status === "NOT_COMPUTABLE") ? "NOT_AVAILABLE" as const
      : sources.some((source) => source.status === "NO_COVERAGE") ? "NO_COVERAGE" as const
        : sources.some((source) => source.status === "NOT_AVAILABLE") ? "NOT_AVAILABLE" as const : "AVAILABLE" as const;
    return { role, status, inputIds: [...new Set(sources.flatMap((source) => source.input ? [source.input.id] : []))].sort(compareText) };
  });
  const envelope = {
    contract: COMPETITOR_RESULT_CONTRACT, runId: execution.runId, evaluatedAt: execution.evaluatedAt,
    engine: {
      key: "competitor-analysis", version: COMPETITOR_ANALYTICS_VERSION,
      contracts: { request: COMPETITOR_REQUEST_CONTRACT, result: COMPETITOR_RESULT_CONTRACT },
      environment: execution.environment, policies: [competitorConfidencePolicy],
    },
    request: { normalized: current.request, evaluatedAt: execution.evaluatedAt }, inputs, preparation: { current, baseline }, inventory,
    results, dataAvailability, gaps, status: deriveRunStatus(metrics, gaps),
    attribution: deriveAttribution(inputs), rights: deriveRights(inputs),
    limits: { costUnits: current.work.parsedRows + (baseline?.work.parsedRows ?? 0) + metrics.length, budgetUnits: 20_000 },
    timing: execution.timing,
  };
  const result = { ...envelope, determinism: computeDeterminism(envelope) };
  ensureSize(result);
  return competitorAnalyticsResultSchema.parse(result);
}

/** Recomputes arithmetic, membership, confidence, gaps, rights and all hashes, not just output shape. */
export function assertCompetitorAnalyticsResult(raw: unknown): asserts raw is CompetitorAnalyticsResult {
  ensureSize(raw);
  const parsed = competitorAnalyticsResultSchema.safeParse(raw);
  if (!parsed.success) throw new EngineError("CONTRACT_VIOLATION", { first: parsed.error.issues[0]?.message ?? "Invalid Competitor M3 result" });
  const result = parsed.data;
  const execution = competitorExecutionSchema.parse({ runId: result.runId, evaluatedAt: result.evaluatedAt, environment: result.engine.environment, timing: result.timing });
  const { current, baseline } = result.preparation;
  verifyPreparation(current);
  if (baseline) verifyPreparation(baseline);
  const normalized = normalizeCompetitorRequest(result.request.normalized, execution.evaluatedAt).normalized;
  if (!same(normalized, current.request) || !same(normalized, result.request.normalized)
    || !same(baselineRequest(normalized), baseline?.request ?? null)
    || [current, ...baseline ? [baseline] : []].some((prepared) => prepared.evaluatedAt !== execution.evaluatedAt || prepared.inputsHash !== canonicalHash(prepared.inputs)
      || prepared.requestHash !== normalizeCompetitorRequest(prepared.request, execution.evaluatedAt).requestHash)) throw new EngineError("CONTRACT_VIOLATION", { first: "Unnormalized/incompatible preparation request, source hashes or evaluation time" });
  const expected = calculate(current, baseline, execution);
  if (!same(expected, result)) throw new EngineError("CONTRACT_VIOLATION", { first: "Competitor M3 result differs from deterministic calculation" });
  const problems = findEnvelopeViolations(result, { catalog: competitorGapCatalog });
  if (problems.length) throw new EngineError("CONTRACT_VIOLATION", { first: `${problems[0]!.code}: ${problems[0]!.detail}` });
}
export function runPreparedCompetitorAnalysis(current: CompetitorPrepared, baseline: CompetitorPrepared | null, rawExecution: CompetitorExecution): CompetitorAnalyticsResult {
  const execution = competitorExecutionSchema.parse(rawExecution);
  const prepared = canonicalPreparation(competitorPreparationSchema.parse(current));
  const previous = baseline ? canonicalPreparation(competitorPreparationSchema.parse(baseline)) : null;
  const result = calculate(prepared, previous, execution);
  assertCompetitorAnalyticsResult(result);
  return result;
}
export async function runCompetitorAnalysis(port: CompetitorDataPort, rawRequest: unknown, rawExecution: CompetitorExecution) {
  const execution = competitorExecutionSchema.parse(rawExecution);
  const prepared = await prepareCompetitorAnalysis(port, rawRequest, execution.evaluatedAt);
  return runPreparedCompetitorAnalysis(prepared.current, prepared.baseline, execution);
}
