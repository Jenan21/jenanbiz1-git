import { z } from "zod";
import { canonicalHash, canonicalize, compareText, roundTo } from "../shared/canonical";
import { engineMetricSchema } from "../shared/contracts";
import { confidenceBreakdownSchema } from "../shared/confidence";
import { EngineError } from "../shared/errors";
import { identifierSchema } from "../shared/primitives";
import { assessCompetitorCount } from "./counts";
import { calculateCompetitorConfidence } from "./confidence";
import type { prepareCompetitorData } from "./data-sources";
import {
  activeAt, countingUnits, definitionRefSchema, ensureSize, measurementMethodFor, recordReference,
  refKey, relationshipClasses, scopeSchema, sortedEvidence, sortedText,
} from "./model";
import { competitorAnalyses } from "./request";

export type CompetitorPrepared = Awaited<ReturnType<typeof prepareCompetitorData>>;
export const COMPETITOR_ANALYTICS_VERSION = "1.0.0-m3";
const same = (left: unknown, right: unknown) => canonicalize(left) === canonicalize(right);
export const competitorAnalyticMetricSchema = engineMetricSchema.safeExtend({
  analysis: z.enum(competitorAnalyses),
  operation: z.enum(["COUNT", "RELATIONSHIP_COUNT", "ENTITY_LOCATION_DISTRIBUTION", "OBSERVED_ATTRIBUTE", "MIN", "MAX", "MEDIAN", "ABSOLUTE_CHANGE", "PERCENT_CHANGE", "INDEX", "DENSITY", "PROXIMITY", "CANDIDATE_COUNT"]),
  evidenceClass: z.enum(["OBSERVED", "DERIVED", "CONTEXTUAL"]),
  scope: scopeSchema, countingUnit: z.enum(countingUnits).nullable(),
  candidateId: identifierSchema.nullable(), attributeId: identifierSchema.nullable(),
  countBasis: z.enum(["SCOPED_TOTAL", "OBSERVED_SUBSET"]).nullable(),
  coverageStatus: z.enum(["COMPLETE", "PARTIAL", "NONE", "UNKNOWN"]),
  relationship: z.enum(relationshipClasses).nullable(),
  entityRefs: z.array(identifierSchema).max(2_000), locationRefs: z.array(identifierSchema).max(2_000),
  distribution: z.object({
    denominator: z.number().int().positive().max(2_000),
    population: z.enum(["SCOPED_COMPETITOR_LOCATIONS", "OBSERVED_COMPETITOR_LOCATIONS"]),
    share: z.number().min(0).max(1),
  }).strict().nullable(),
  sample: z.object({ eligible: z.number().int().nonnegative(), observed: z.number().int().nonnegative(), missing: z.number().int().nonnegative() }).strict().nullable(),
  trace: z.object({
    method: definitionRefSchema, formula: z.string().min(1).max(500),
    inputIds: z.array(identifierSchema).max(32),
    sourceRecords: z.array(z.object({ inputId: identifierSchema, sourceNamespace: identifierSchema, sourceRecordId: identifierSchema }).strict()).max(2_000),
    attributeRefs: z.array(z.object({ inputId: identifierSchema, id: identifierSchema }).strict()).max(2_000),
    baselineAsOf: scopeSchema.shape.asOf.nullable(),
  }).strict(),
}).superRefine((metric, context) => {
  if (metric.value !== null && (!metric.confidence || !Number.isFinite(metric.value))) context.addIssue({ code: "custom", message: "A computed fact requires finite value and evidence confidence" });
  if (metric.distribution && (typeof metric.value !== "number" || Math.abs(metric.distribution.share - metric.value / metric.distribution.denominator) > 0.00000001)) context.addIssue({ code: "custom", message: "Location share must use its explicit positive denominator" });
  if (metric.sample && metric.sample.eligible !== metric.sample.observed + metric.sample.missing) context.addIssue({ code: "custom", message: "Sample missingness must reconcile" });
});
export type CompetitorAnalyticMetric = z.infer<typeof competitorAnalyticMetricSchema>;
type Analysis = CompetitorAnalyticMetric["analysis"];
type Operation = CompetitorAnalyticMetric["operation"];
type Confidence = z.infer<typeof confidenceBreakdownSchema> | null;
type Unit = typeof countingUnits[number];
type Count = ReturnType<typeof assessCompetitorCount>;
const subsetConfidence = (prepared: CompetitorPrepared, confidence: Confidence = null) => prepared.evidence?.inputs.length
  ? calculateCompetitorConfidence(prepared.evidence.inputs.map((input) => ({
    input, analysisUsage: prepared.evidence!.permissions.find((permission) => permission.inputId === input.id && activeAt(permission.validity, prepared.evaluatedAt))?.analysisUsage ?? "NOT_VERIFIED",
    identity: "RESOLVED", match: "SUPPORTED", coverage: "PARTIAL",
    method: measurementMethodFor(prepared.evidence!.sourceRecords.filter((record) => record.inputId === input.id)),
    provenance: "DOCUMENTED", upstreamConfidence: confidence,
  })), prepared.evaluatedAt).confidence : null;

/** Executes bounded descriptive arithmetic only. No geometry inference, source selection or persistence. */
export function evaluateCompetitorAnalytics(current: CompetitorPrepared, baseline: CompetitorPrepared | null = null) {
  const request = current.request;
  const metrics: CompetitorAnalyticMetric[] = [];
  let bytes = 0;
  const scopes = baseline ? [current, baseline] : [current];
  const allInputs = new Map(scopes.flatMap((prepared) => prepared.inputs).map((input) => [input.id, input]));
  const records = sortedEvidence(scopes.flatMap((prepared) => prepared.evidence?.sourceRecords.map(recordReference) ?? []));
  const traceInputIds = sortedText([...allInputs.keys()]);
  const baseTrace = {
    method: { id: "competitor-descriptive-analytics", version: "1" }, formula: "No compatible operands",
    inputIds: sortedText(current.inputs.map((input) => input.id)), sourceRecords: current.evidence?.sourceRecords.map(recordReference) ?? [],
    attributeRefs: [] as { inputId: string; id: string }[], baselineAsOf: null as string | null,
  };
  const count = (prepared: CompetitorPrepared, unit: Unit, relationships = request.relationships): Count => {
    if (prepared.status !== "AVAILABLE" || !prepared.evidence) return {
      countingUnit: unit, status: prepared.status === "AVAILABLE" ? "NOT_AVAILABLE" : prepared.status, value: null, observedSubset: null,
      coverageStatus: prepared.coverage?.status ?? "UNKNOWN", confidence: null, memberIds: [], reason: "No usable authorized evidence establishes this scope",
    };
    const scoped = prepared.evidence.locations.filter((location) => activeAt(location.validity, prepared.request.scope.asOf));
    const refs = sortedEvidence([
      ...prepared.coverage?.evidence ?? [],
      ...scoped.flatMap((location) => [...location.evidence, ...location.entityLinkEvidence, ...location.operationalEvidence]),
      ...unit === "UNIQUE_COMPETITOR_ENTITIES" ? prepared.evidence.entities.filter((entity) => scoped.some((location) => location.competitorEntityId === entity.competitorEntityId)).flatMap((entity) => entity.evidence) : [],
    ]);
    const expiredEntity = unit === "UNIQUE_COMPETITOR_ENTITIES" && scoped.some((location) => location.competitorEntityId
      && !prepared.evidence!.entities.some((entity) => entity.competitorEntityId === location.competitorEntityId && activeAt(entity.validity, prepared.request.scope.asOf)));
    const expiredRef = refs.some((ref) => !prepared.evidence!.sourceRecords.some((record) => refKey(record) === refKey(ref) && activeAt(record.validity, prepared.request.scope.asOf)));
    if (expiredEntity || expiredRef) return {
      countingUnit: unit, status: "NOT_COMPUTABLE", value: null, observedSubset: null,
      coverageStatus: prepared.coverage?.status ?? "UNKNOWN", confidence: null, memberIds: [], reason: "Required identity/activity/inventory evidence is not in force",
    };
    return assessCompetitorCount(prepared.evidence, { ...prepared.request, countingUnits: [...countingUnits], relationships }, prepared.coverage, unit, prepared.evaluatedAt);
  };
  const counts = new Map(countingUnits.map((unit) => [unit, count(current, unit)]));
  const confidence = (outcome: Count) => outcome.status === "PARTIAL" ? subsetConfidence(current) : outcome.confidence;
  const emit = (analysis: Analysis, operation: Operation, discriminator: unknown, changes: Partial<CompetitorAnalyticMetric> = {}) => {
    if (metrics.length >= 500) throw new EngineError("REQUEST_TOO_LARGE", { first: "Competitor analytics exceeds 500 metrics" });
    const key = `competitor.${canonicalHash([analysis, operation, discriminator]).slice(0, 32)}`;
    const unit = changes.countingUnit ?? "COMPETITOR_LOCATIONS";
    const method = changes.trace?.method ?? baseTrace.method;
    const snapshot = { kind: "SNAPSHOT" as const, id: request.scope.asOf, date: request.scope.asOf.slice(0, 10), calendar: "GREGORIAN" as const, timeZone: "UTC" };
    const metric: CompetitorAnalyticMetric = {
      key, label: { ar: "قياس موثق للمنافسين", en: `Documented competitor ${operation.toLowerCase()}` },
      status: "NOT_AVAILABLE", platformState: "UNAVAILABLE", valueKind: "QUANTITY", unit: "quantity", value: null,
      interpretation: "DERIVED_QUANTITY", inputRefs: changes.trace?.inputIds ?? baseTrace.inputIds, confidence: null, limitations: [],
      method: method.id,
      semantics: {
        measuredSubject: unit, unit: { id: unit, version: "1", dimension: "ENTITIES", entity: unit, per: null },
        measureKind: "STOCK", evidenceNature: "DERIVED", time: snapshot,
        dimensions: {
          geography: request.scope.geography,
          sector: { taxonomy: request.scope.activity.taxonomy, version: request.scope.activity.version, code: request.scope.activity.id },
          cohort: request.scope.segment ?? { id: "all-documented", version: "1" },
          metricDefinition: { id: operation, version: "1" }, methodology: method,
          universe: current.coverage?.inventoryDefinition ?? { id: "unverified-inventory", version: "1" }, adjustment: "UNADJUSTED",
        },
      },
      analysis, operation, evidenceClass: "DERIVED", scope: request.scope, countingUnit: null, countBasis: null,
      candidateId: null, attributeId: null,
      coverageStatus: current.coverage?.status ?? "UNKNOWN", relationship: null, entityRefs: [], locationRefs: [],
      distribution: null, sample: null, trace: { ...baseTrace }, ...changes,
    };
    bytes += Buffer.byteLength(canonicalize(metric), "utf8");
    if (bytes > 2 * 1024 * 1024) throw new EngineError("REQUEST_TOO_LARGE", { first: "Competitor metrics exceed the shared 2 MiB ceiling" });
    metrics.push(metric);
    return metric;
  };
  const countFields = (outcome: Count, unit: Unit, observed = false): Partial<CompetitorAnalyticMetric> => {
    const value = observed ? outcome.observedSubset : outcome.value;
    const status = observed && value !== null ? "PARTIAL" : outcome.status === "PARTIAL" ? "NOT_AVAILABLE" : outcome.status;
    return {
      countingUnit: unit, countBasis: observed ? "OBSERVED_SUBSET" : "SCOPED_TOTAL", status,
      value, confidence: value === null ? null : confidence(outcome),
      platformState: value !== null ? "COMPUTED" : "UNAVAILABLE",
      coverageStatus: outcome.coverageStatus, limitations: [outcome.reason],
      ...(unit === "UNIQUE_COMPETITOR_ENTITIES" ? { entityRefs: outcome.memberIds } : { locationRefs: outcome.memberIds }),
      trace: { ...baseTrace, formula: `distinct evidenced ${unit}; explicit relationship and operational filters` },
    };
  };
  if (request.analyses.includes("COUNTS")) for (const unit of request.countingUnits) {
    const outcome = counts.get(unit)!;
    emit("COUNTS", "COUNT", [unit, "total"], countFields(outcome, unit));
    if (outcome.status === "PARTIAL") emit("COUNTS", "COUNT", [unit, "subset"], countFields(outcome, unit, true));
    for (const relationship of request.relationships) {
      const part = count(current, unit, [relationship]);
      emit("COUNTS", "RELATIONSHIP_COUNT", [unit, relationship, "total"], { ...countFields(part, unit), relationship });
      if (part.status === "PARTIAL") emit("COUNTS", "RELATIONSHIP_COUNT", [unit, relationship, "subset"], { ...countFields(part, unit, true), relationship });
    }
  }
  if (request.analyses.includes("DISTRIBUTION")) {
    const outcome = counts.get("COMPETITOR_LOCATIONS")!;
    const total = outcome.value ?? outcome.observedSubset;
    const included = current.evidence?.locations.filter((location) => outcome.memberIds.includes(location.locationId)) ?? [];
    const entityIds = sortedText(included.flatMap((location) => location.competitorEntityId ? [location.competitorEntityId] : []));
    const unknownEntity = !["COMPUTED", "PARTIAL"].includes(counts.get("UNIQUE_COMPETITOR_ENTITIES")!.status) || included.some((location) => location.entityLinkState !== "RESOLVED"
    || !current.evidence?.entities.some((entity) => entity.competitorEntityId === location.competitorEntityId && entity.identityState === "RESOLVED" && activeAt(entity.validity, request.scope.asOf)));
    if (total === null || total === 0 || unknownEntity) emit("DISTRIBUTION", "ENTITY_LOCATION_DISTRIBUTION", "unavailable", {
      status: total === null ? outcome.status === "PARTIAL" ? "NOT_AVAILABLE" : outcome.status : "NOT_COMPUTABLE",
      platformState: "UNAVAILABLE",
      limitations: [unknownEntity ? "Entity identity is unresolved; no guessed entity share" : "Location shares require a positive comparable denominator"],
    });
    else for (const entityId of entityIds) {
      const locationIds = sortedText(included.filter((location) => location.competitorEntityId === entityId).map((location) => location.locationId));
      emit("DISTRIBUTION", "ENTITY_LOCATION_DISTRIBUTION", entityId, {
        ...countFields(outcome, "COMPETITOR_LOCATIONS", outcome.status === "PARTIAL"),
        value: locationIds.length, entityRefs: [entityId], locationRefs: locationIds,
        distribution: { denominator: total, population: outcome.status === "PARTIAL" ? "OBSERVED_COMPETITOR_LOCATIONS" : "SCOPED_COMPETITOR_LOCATIONS", share: roundTo(locationIds.length / total, 8) },
        limitations: ["Share of documented competitor locations, not market, sales, revenue, strength or saturation share"],
        trace: { ...baseTrace, formula: "entity-associated included locations / all included documented competitor locations" },
      });
    }
  }
  if (request.analyses.includes("DIMENSION_COMPARISON")) {
    const selectors = request.parameters?.attributes ?? [];
    if (!selectors.length) emit("DIMENSION_COMPARISON", "MEDIAN", "missing-selector", { limitations: ["Explicit attribute, unit, observation window and comparison basis are required"] });
    for (const selector of selectors) {
      const outcome = counts.get(selector.subjectKind === "ENTITY" ? "UNIQUE_COMPETITOR_ENTITIES" : "COMPETITOR_LOCATIONS")!;
      const memberIds = outcome.memberIds;
      const sources = current.sources.filter((source) => source.role === "competitor.attributes" && source.status === "AVAILABLE" && source.dataset?.role === "competitor.attributes");
      const rows = sources.flatMap((source) => source.dataset?.role === "competitor.attributes" ? source.dataset.rows.filter((row) =>
        row.subjectKind === selector.subjectKind && memberIds.includes(row.subjectId) && same(row.definition, selector.definition)).map((row) => ({ row, inputId: source.input!.id })) : []);
      const dictionary = current.sources.flatMap((source) => source.dataset?.role === "competitor.dimensions" ? source.dataset.rows : []);
      const declared = dictionary.some((row) => row.kind === "ATTRIBUTE" && same(row.definition, selector.definition))
        && dictionary.some((row) => row.kind === "UNIT" && same(row.definition, selector.unit));
      const grouped = new Map<string, typeof rows>();
      for (const row of rows) grouped.set(row.row.subjectId, [...(grouped.get(row.row.subjectId) ?? []), row]);
      const duplicate = [...grouped.values()].some((values) => values.length !== 1);
      const invalid = rows.some(({ row, inputId }) => !same(row.unit, selector.unit) || !row.comparisonBasis || !same(row.comparisonBasis, selector.basis)
        || row.evidenceClass !== "OBSERVED" || !same(row.scope, request.scope) || !activeAt(row.validity, request.scope.asOf)
        || typeof row.value !== "number" && row.value !== null || typeof row.value === "number" && row.value < 0
        || row.evidence.some((ref) => !current.evidence?.sourceRecords.some((record) => refKey(record) === refKey({ ...ref, inputId: ref.inputId === "SELF" ? inputId : ref.inputId }) && activeAt(record.validity, request.scope.asOf))))
        || duplicate;
      const values = rows.filter((entry): entry is typeof rows[number] & { row: typeof rows[number]["row"] & { value: number } } => typeof entry.row.value === "number").sort((a, b) => a.row.value - b.row.value || compareText(a.row.subjectId, b.row.subjectId));
      const usable = declared && !invalid && values.length > 0 && ["COMPUTED", "PARTIAL"].includes(outcome.status);
      const attributeConfidence = usable ? subsetConfidence(current, confidence(outcome)) : null;
      for (const subjectId of memberIds) {
        const row = grouped.get(subjectId)?.[0];
        const value = usable && attributeConfidence && row && typeof row.row.value === "number" ? row.row.value : null;
        const metric = emit("DIMENSION_COMPARISON", "OBSERVED_ATTRIBUTE", [selector.id, subjectId], {
          evidenceClass: "OBSERVED", interpretation: "SOURCE_OBSERVATION",
          attributeId: selector.id,
          value, status: value === null ? invalid ? "NOT_COMPUTABLE" : "NOT_AVAILABLE" : "PARTIAL",
          platformState: value === null ? "UNAVAILABLE" : "COMPUTED", confidence: value === null ? null : attributeConfidence,
          coverageStatus: "PARTIAL",
          entityRefs: selector.subjectKind === "ENTITY" ? [subjectId] : [], locationRefs: selector.subjectKind === "LOCATION" ? [subjectId] : [],
          limitations: ["One documented subject observation only; no inference to another branch or business"],
          trace: { ...baseTrace, formula: "exact observed subject value; no conversion or imputation", attributeRefs: row ? [{ inputId: row.inputId, id: row.row.id }] : [] },
        });
        metric.semantics = { ...metric.semantics!, measuredSubject: selector.definition.id, evidenceNature: "OBSERVATION",
          unit: { ...selector.unit, dimension: "ITEMS", entity: selector.definition.id, per: null } };
      }
      for (const operation of ["MIN", "MAX", "MEDIAN"] as const) {
        const n = values.length;
        const value = !usable || !attributeConfidence ? null : operation === "MIN" ? values[0]!.row.value : operation === "MAX" ? values[n - 1]!.row.value
          : n % 2 ? values[Math.floor(n / 2)]!.row.value : values[n / 2 - 1]!.row.value / 2 + values[n / 2]!.row.value / 2;
        const metric = emit("DIMENSION_COMPARISON", operation, selector.id, {
          status: value !== null ? "PARTIAL" : invalid ? "NOT_COMPUTABLE" : "NOT_AVAILABLE",
          attributeId: selector.id,
          platformState: value !== null ? "COMPUTED" : "UNAVAILABLE",
          value, confidence: value === null ? null : attributeConfidence,
          coverageStatus: "PARTIAL",
          sample: { eligible: memberIds.length, observed: duplicate ? 0 : values.length, missing: duplicate ? memberIds.length : Math.max(0, memberIds.length - values.length) },
          entityRefs: selector.subjectKind === "ENTITY" ? sortedText(values.map(({ row }) => row.subjectId)) : [],
          locationRefs: selector.subjectKind === "LOCATION" ? sortedText(values.map(({ row }) => row.subjectId)) : [],
          limitations: ["Observed attribute sample only; no missing-value imputation, currency/unit/tax conversion or branch-to-entity extrapolation"],
          trace: { ...baseTrace, formula: operation === "MEDIAN" ? "ordered middle observation; average two middle values for even sample" : `${operation.toLowerCase()} of compatible observed subjects`,
            attributeRefs: rows.map(({ row, inputId }) => ({ inputId, id: row.id })).sort((a, b) => compareText(canonicalize(a), canonicalize(b))) },
        });
        // Attributes retain their exact source unit; no monetary or capacity unit is converted.
        metric.semantics = { ...metric.semantics!, measuredSubject: selector.definition.id,
          unit: { ...selector.unit, dimension: "ITEMS", entity: selector.definition.id, per: null } };
      }
    }
  }
  if (request.analyses.includes("HISTORICAL_CHANGE")) for (const unit of request.countingUnits) {
    const now = counts.get(unit)!;
    const prior = baseline ? count(baseline, unit) : null;
    const signature = (prepared: CompetitorPrepared) => ({
      scope: { ...prepared.request.scope, asOf: null }, definition: prepared.request.competitorDefinition,
      coverage: prepared.coverage && { ...prepared.coverage, scope: { ...prepared.coverage.scope, asOf: null }, evidence: null, inventoryLocationIds: null },
      methods: sortedText(prepared.evidence?.sourceRecords.map((record) => canonicalize([record.sourceNamespace, record.measurementMethod, record.method])) ?? []),
      rules: prepared.evidence?.rules.map((rule) => ({ ...rule, evidence: null, validity: null })) ?? [],
      identityPolicy: { id: "competitor-explicit-identity", version: "1" },
    });
    const compatible = baseline && prior?.status === "COMPUTED" && now.status === "COMPUTED"
      && same(signature(current), signature(baseline)) && baseline.request.scope.asOf < request.scope.asOf;
    let combined: Confidence = null;
    if (compatible) {
      combined = calculateCompetitorConfidence([...allInputs.values()].map((input) => {
        const prepared = current.inputs.some((candidate) => candidate.id === input.id) ? current : baseline;
        return {
          input, analysisUsage: prepared.evidence!.permissions.find((permission) => permission.inputId === input.id && activeAt(permission.validity, current.evaluatedAt))?.analysisUsage ?? "NOT_VERIFIED",
          identity: "RESOLVED", match: "SUPPORTED", coverage: "COMPLETE",
          method: measurementMethodFor(prepared.evidence!.sourceRecords.filter((record) => record.inputId === input.id)), provenance: "DOCUMENTED",
          upstreamConfidence: prepared === current ? now.confidence : prior!.confidence,
        };
      }), current.evaluatedAt).confidence;
    }
    for (const operation of ["ABSOLUTE_CHANGE", "PERCENT_CHANGE", "INDEX"] as const) {
      const denominatorValid = prior?.value !== 0 || operation === "ABSOLUTE_CHANGE";
      const raw = compatible && combined && denominatorValid ? operation === "ABSOLUTE_CHANGE" ? now.value! - prior!.value!
        : operation === "PERCENT_CHANGE" ? (now.value! - prior!.value!) / prior!.value! * 100 : now.value! / prior!.value! * 100 : null;
      const value = raw === null || !Number.isFinite(raw) ? null : roundTo(raw, 8);
      const metric = emit("HISTORICAL_CHANGE", operation, unit, {
        countingUnit: unit, value, status: value === null ? baseline ? "NOT_COMPUTABLE" : "NOT_AVAILABLE" : "COMPUTED",
        platformState: value === null ? "UNAVAILABLE" : "COMPUTED",
        confidence: value === null ? null : combined, valueKind: operation === "INDEX" ? "INDEX" : "CHANGE",
        unit: operation === "INDEX" ? "index_points" : operation === "PERCENT_CHANGE" ? "percent" : "quantity",
        limitations: [value === null ? "Missing/incompatible complete snapshots, invalid base or unscorable evidence" : "Historical documented inventory difference; not evidence of openings, closures, sales or market share"],
        trace: { ...baseTrace, inputIds: traceInputIds, sourceRecords: records, baselineAsOf: baseline?.request.scope.asOf ?? null,
          formula: operation === "ABSOLUTE_CHANGE" ? "current - baseline" : operation === "PERCENT_CHANGE" ? "(current - baseline) / baseline * 100" : "current / baseline * 100" },
      });
      if (baseline) {
        const semantics = metric.semantics!;
        metric.semantics = { ...semantics,
          unit: operation === "ABSOLUTE_CHANGE" ? semantics.unit : { id: operation, version: "1", dimension: operation === "INDEX" ? "INDEX" : "PERCENT", entity: unit, per: null },
          measureKind: operation === "INDEX" ? "INDEX" : "STOCK",
          comparison: {
            operation, from: { ...semantics.time, id: baseline.request.scope.asOf, kind: "SNAPSHOT", date: baseline.request.scope.asOf.slice(0, 10), calendar: "GREGORIAN", timeZone: "UTC" },
            to: semantics.time, operandUnit: semantics.unit,
          },
        };
      } else {
        // Even unavailable comparison slots retain a declared baseline placeholder, never a fake value.
        metric.valueKind = "QUANTITY"; metric.unit = "quantity";
      }
    }
  }
  if (request.analyses.includes("PROXIMITY_DENSITY")) for (const operation of ["DENSITY", "PROXIMITY"] as const) emit("PROXIMITY_DENSITY", operation, operation, {
    status: "NOT_COMPUTABLE", platformState: "UNAVAILABLE",
    limitations: ["No approved compatible spatial-facts contract supplied; raw geography/coordinates do not establish area, distance or radius coverage"],
  });
  if (request.analyses.includes("CANDIDATE_COMPARISON")) for (const candidate of request.parameters?.candidates?.length ? request.parameters.candidates : [{ id: "unspecified" }]) emit("CANDIDATE_COMPARISON", "CANDIDATE_COUNT", candidate.id, {
    candidateId: candidate.id,
    status: "NOT_COMPUTABLE", platformState: "UNAVAILABLE",
    limitations: ["Candidate comparison needs approved compatible inventory/spatial facts; no inferred catchment, winner, ranking or recommendation"],
  });
  metrics.sort((a, b) => compareText(a.key, b.key));
  ensureSize(metrics);
  return metrics.map((metric) => competitorAnalyticMetricSchema.parse(metric));
}
