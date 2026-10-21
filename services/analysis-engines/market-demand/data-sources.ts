import { canonicalize, canonicalHash, compareText, omitKeys } from "../shared/canonical";
import { deriveAttribution, deriveInputGaps, deriveRights, engineInputSchema, type EngineInput } from "../shared/contracts";
import { EngineError } from "../shared/errors";
import { normalizeGaps, type Gap } from "../shared/gaps";
import type { TemporalReference } from "../shared/quantities";
import { comparableSeriesProblems } from "./calculations";
import { marketDiscoverySchema, marketReadSchema, type MarketDataPort, type MarketDiscovery, type MarketSourceReference } from "./data-port";
import { marketDatasetSchema, typeKeyByMarketRole, type MarketDataset, type MarketDatasetRole, type MarketAssumptionRow } from "./datasets";
import { marketGap, type MarketGapCode } from "./gaps";
import { marketRoles, normalizeMarketObservation, marketObservationSchema, type MarketObservation } from "./model";
import { normalizeMarketRequest, type MarketNormalizedRequest } from "./request";

export type MarketSourceStatus = "AVAILABLE" | "NO_COVERAGE" | "NOT_AVAILABLE" | "NOT_COMPUTABLE";
export interface MarketSourceMatch {
  seriesId: string; periodId: string; status: MarketSourceStatus; observationRefs: MarketObservation["ref"][];
}
export type PreparedMarketAssumption = Omit<MarketAssumptionRow, "sourceRefs" | "assumptions"> & {
  ref: MarketObservation["ref"]; sourceRefs: MarketObservation["sourceRefs"]; assumptions: MarketObservation["assumptions"];
};
export interface PreparedMarketSource {
  role: MarketDatasetRole; status: MarketSourceStatus;
  requestedVersionId: string | null;
  selection: MarketDiscovery | null;
  reference: MarketSourceReference | null;
  input: EngineInput | null;
  dataset: MarketDataset | null;
  observations: MarketObservation[];
  assumptionInputs: PreparedMarketAssumption[];
  matches: MarketSourceMatch[];
  gaps: Gap[];
}
const same = (a: unknown, b: unknown) => canonicalize(a) === canonicalize(b);
export function marketInputFromReference(reference: MarketSourceReference, role: MarketDatasetRole, dataset: MarketDataset): EngineInput | null {
  const { version, source, rights, freshness } = reference;
  const parsed = engineInputSchema.safeParse({
    id: `dc:${version.versionId}`, roles: [role], kind: "DATA_CENTER_VERSION", governance: "DC_PUBLISHED",
    ref: { system: "DATA_CENTER", id: version.versionId, version: version.number, label: reference.dataset.title },
    checksum: version.checksum,
    source: { name: source.name, organization: source.organization, url: source.url },
    ownership: reference.ownership.ownership, license: rights.license, licenseClass: rights.licenseClass,
    usagePolicy: rights.usagePolicy, attribution: { text: rights.attribution.text, required: rights.attribution.required },
    allowExport: rights.allowExport, completeness: dataset.coverage.completeness, evidenceStatus: version.evidenceStatus,
    quality: reference.quality, freshness: { status: freshness.status, sourcePublishedAt: freshness.sourcePublishedAt, freshnessDays: freshness.freshnessDays, expiresAt: freshness.expiresAt },
    coverage: reference.coverage, limitations: [],
  });
  return parsed.success ? parsed.data : null;
}
export function bindMarketAssumptions(dataset: MarketDataset, versionId: string): PreparedMarketAssumption[] {
  if (dataset.role !== "demand.assumptions") return [];
  const bind = (ref: { versionId?: string; observationId: string }) => ({ inputId: `dc:${ref.versionId ?? versionId}`, observationId: ref.observationId });
  return dataset.rows.map((row) => ({
    ...row, ref: { inputId: `dc:${versionId}`, observationId: row.id }, sourceRefs: row.sourceRefs.map(bind),
    assumptions: row.assumptions.map((assumption) => ({ ...assumption, sourceRefs: assumption.sourceRefs.map(bind) })),
  })).sort((a, b) => compareText(a.id, b.id));
}
export function bindMarketObservations(dataset: MarketDataset, versionId: string): MarketObservation[] | null {
  if (dataset.role !== "demand.observations" && dataset.role !== "context.indicators") return [];
  const bind = (ref: { versionId?: string; observationId: string }) => ({ inputId: `dc:${ref.versionId ?? versionId}`, observationId: ref.observationId });
  const parsed = marketObservationSchema.array().safeParse(dataset.rows.map((row) => ({
    ref: { inputId: `dc:${versionId}`, observationId: row.id },
    subject: row.subject, semantics: row.semantics, status: row.status, value: row.value,
    geographicCoverage: row.geographicCoverage, temporalCoverage: row.temporalCoverage,
    measurementMethod: row.measurementMethod, method: row.method, limitations: row.limitations,
    ...(row.partition ? { partition: row.partition } : {}),
    sourceRefs: row.sourceRefs.map(bind),
    assumptions: row.assumptions.map((assumption) => ({ ...assumption, sourceRefs: assumption.sourceRefs.map(bind) })),
  })));
  return parsed.success ? parsed.data.map(normalizeMarketObservation).sort((a, b) => compareText(a.ref.observationId, b.ref.observationId)) : null;
}
export function marketCoverageStatus(dataset: MarketDataset, request: MarketNormalizedRequest, period?: TemporalReference): MarketSourceStatus {
  const { coverage } = dataset;
  let unknown = false;
  let incompatible = false;
  for (const [declared, expected] of [[coverage.geographies, request.scope.geography], [coverage.sectors, request.scope.sector], [coverage.cohorts, request.scope.cohort]] as const) {
    if (!declared) { unknown = true; continue; }
    if (!declared.some((candidate) => same(candidate, expected))) {
      if (declared.some((candidate) => same(omitKeys(candidate, ["version"]), omitKeys(expected, ["version"])))) incompatible = true;
      else return "NO_COVERAGE";
    }
  }
  if (period !== undefined) {
    if (!coverage.periods) unknown = true;
    else if (!coverage.periods.some((candidate) => same(candidate, period))) {
      const bounds = (time: TemporalReference) => time.kind === "INTERVAL" ? [time.startDate, time.endDate] as const : [time.date, time.date] as const;
      const [start, end] = bounds(period);
      const overlap = coverage.periods.some((candidate) => {
        const [from, to] = bounds(candidate);
        return candidate.kind === "SNAPSHOT" || period.kind === "SNAPSHOT" ? from === start : from < end && to > start;
      });
      if (!overlap) return "NO_COVERAGE";
      incompatible = true;
    }
  }
  return unknown || incompatible ? "NOT_COMPUTABLE" : "AVAILABLE";
}
const statusGap = (status: MarketSourceStatus): MarketGapCode => status === "NO_COVERAGE" ? "MARKET_NO_COVERAGE" : status === "NOT_AVAILABLE" ? "MARKET_NOT_AVAILABLE" : "MARKET_INSUFFICIENT_EVIDENCE";
function failedSource(role: MarketDatasetRole, requestedVersionId: string | null, code: MarketGapCode, status: MarketSourceStatus = "NOT_COMPUTABLE", selection: MarketDiscovery | null = null): PreparedMarketSource {
  return { role, status, requestedVersionId, selection, reference: null, input: null, dataset: null, observations: [], assumptionInputs: [], matches: [], gaps: [marketGap(code, role)] };
}
export function requiredMarketRoles(request: MarketNormalizedRequest): MarketDatasetRole[] {
  const roles = new Set<MarketDatasetRole>(Object.keys(request.data.roles) as MarketDatasetRole[]);
  roles.add("dimensions.dictionary");
  if (request.analyses.some((analysis) => analysis === "OBSERVED_DEMAND" || analysis === "DEMAND_TREND")) roles.add("demand.observations");
  if (request.analyses.some((analysis) => ["MARKET_CONTEXT", "AUDIENCE_CONTEXT", "ASSUMPTION_BASED_DEMAND"].includes(analysis))) roles.add("context.indicators");
  if (request.analyses.includes("ASSUMPTION_BASED_DEMAND")) roles.add("demand.assumptions");
  return marketRoles.filter((role) => roles.has(role));
}
function referenceIdentity(reference: MarketSourceReference) {
  return omitKeys(reference, ["resolvedAt"]);
}
function invalidLineage(sources: PreparedMarketSource[]): Set<string> {
  type Node = { available: boolean; dependencies: Set<string>; remaining: number; dependents: string[] };
  const key = (ref: MarketObservation["ref"]) => canonicalize(ref);
  const nodes = new Map(sources.flatMap((source) => [...source.observations, ...source.assumptionInputs].map((row): [string, Node] => {
    const declared = [...row.sourceRefs, ...row.assumptions.flatMap((assumption) => assumption.sourceRefs)];
    const dependencies = new Set(declared.filter((ref) => !same(ref, row.ref)).map(key));
    const external = declared.filter((ref) => ref.inputId !== row.ref.inputId);
    const available = source.status === "AVAILABLE" && (!("status" in row) || row.status === "AVAILABLE")
      && external.every((ref) => source.reference?.version.upstreamVersionIds.some((versionId) => ref.inputId === `dc:${versionId}`));
    return [key(row.ref), { available, dependencies, remaining: dependencies.size, dependents: [] }];
  })));
  for (const [id, node] of nodes) for (const dependency of node.dependencies) {
    const upstream = nodes.get(dependency);
    if (upstream) upstream.dependents.push(id);
    else { node.available = false; node.remaining--; }
  }
  const queue = [...nodes].filter(([, node]) => node.remaining === 0).map(([id]) => id);
  const processed = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!;
    const node = nodes.get(id)!;
    processed.add(id);
    for (const dependent of node.dependents) {
      const next = nodes.get(dependent)!;
      next.available &&= node.available;
      if (--next.remaining === 0) queue.push(dependent);
    }
  }
  return new Set([...nodes].filter(([id, node]) => !node.available || !processed.has(id)).map(([id]) => id));
}
function matchesFor(source: PreparedMarketSource, request: MarketNormalizedRequest, dictionaries: MarketDataset[]): MarketSourceMatch[] {
  const dataset = source.dataset;
  if (!dataset || !["demand.observations", "context.indicators"].includes(source.role)) return [];
  if (source.role === "context.indicators" && !request.analyses.some((analysis) => analysis === "MARKET_CONTEXT" || analysis === "AUDIENCE_CONTEXT")) return [];
  const matches: MarketSourceMatch[] = [];
  for (const series of request.series) for (const period of series.periods) {
    let status = marketCoverageStatus(dataset, request, period);
    let rows: MarketObservation[] = [];
    if (status === "AVAILABLE") {
      rows = source.observations.filter((row) => same(row.semantics.dimensions.metricDefinition, series.metricDefinition)
        && row.semantics.time.id === period.id && same(row.semantics.dimensions.geography, request.scope.geography)
        && same(row.semantics.dimensions.sector, request.scope.sector) && same(row.semantics.dimensions.cohort, request.scope.cohort));
      if (!rows.length || rows.every((row) => row.status !== "AVAILABLE")) status = "NOT_AVAILABLE";
      else if ((rows.length !== 1 && series.aggregation === "IDENTITY") || rows.some((row) => !same(row.semantics.unit, series.unit) || !same(row.semantics.time, period)
        || row.geographicCoverage === "UNKNOWN" || row.temporalCoverage === "UNKNOWN" || row.measurementMethod === "UNSUPPORTED")) status = "NOT_COMPUTABLE";
      else if (rows.some((row) => row.geographicCoverage === "OUTSIDE")) status = "NO_COVERAGE";
      if (status === "AVAILABLE") {
        const definitions = dictionaries.flatMap((dictionary) => dictionary.role === "dimensions.dictionary" ? dictionary.definitions : [])
          .filter((definition) => same(definition.metricDefinition, series.metricDefinition));
        if (!definitions.length) status = "NOT_AVAILABLE";
        else if (new Set(definitions.map((definition) => canonicalize(definition))).size !== 1
          || rows.some((row) => !definitions.some((definition) => definition.subject === row.subject && same(definition.unit, row.semantics.unit)
            && definition.measureKind === row.semantics.measureKind && same(definition.methodology, row.semantics.dimensions.methodology)))) status = "NOT_COMPUTABLE";
      }
    }
    matches.push({ seriesId: series.id, periodId: period.id, status, observationRefs: status === "AVAILABLE" ? rows.map((row) => row.ref) : [] });
  }
  return matches;
}

/** Read, verify and prepare only. No arithmetic, aggregate, run persistence or historical replay occurs here. */
export async function prepareMarketData(port: MarketDataPort, rawRequest: MarketNormalizedRequest, evaluationInstant: string) {
  const { normalized: request, evaluatedAt } = normalizeMarketRequest(rawRequest, { evaluatedAt: evaluationInstant });
  const sources: PreparedMarketSource[] = [];
  const work = { discoveries: 0, reads: 0, parsedRows: 0 };
  const roles = requiredMarketRoles(request);
  const selections = roles.map((role) => ({ role, selector: request.data.roles[role] ?? { source: "DATA_CENTER" as const, typeKey: typeKeyByMarketRole[role], asOf: evaluatedAt } }));
  const versionSlots = selections.reduce((count, { selector }) => count + (Array.isArray(selector) ? selector.length : 1), 0);
  if (versionSlots > 32) throw new EngineError("REQUEST_TOO_LARGE", { first: "Resolved source roles exceed 32 version selections" });
  for (const { role, selector } of selections) {
    if (!Array.isArray(selector) && selector.typeKey !== typeKeyByMarketRole[role]) {
      sources.push(failedSource(role, null, "MARKET_SOURCE_TYPE_INVALID"));
      continue;
    }
    if (!Array.isArray(selector) && Date.parse(selector.asOf ?? evaluatedAt) > Date.parse(evaluatedAt)) throw new EngineError("INVALID_INPUT", { first: "Source selection asOf is in the future" });
    work.discoveries++;
    const discovery = marketDiscoverySchema.parse(await port.discover(Array.isArray(selector)
      ? { versionIds: selector.map((pin) => pin.versionId) }
      : { typeKeys: [selector.typeKey], asOf: selector.asOf ?? evaluatedAt, limit: 100 }));
    const pins = Array.isArray(selector) ? selector : [{ versionId: discovery.selected?.reference.version.versionId ?? "", expectedChecksum: undefined }];
    if (discovery.status === "TOO_MANY_CANDIDATES") {
      for (const pin of Array.isArray(selector) ? selector : [{ versionId: null }]) sources.push(failedSource(role, pin.versionId, "MARKET_SOURCE_LIMIT", "NOT_COMPUTABLE", discovery));
      continue;
    }
    if (!Array.isArray(selector) && (discovery.mode !== "BY_TYPE" || discovery.policy !== "dc-version-selection-v1" || discovery.asOf !== new Date(selector.asOf ?? evaluatedAt).toISOString())) throw new EngineError("CONTRACT_VIOLATION", { first: "Provider selection policy/instant mismatch" });
    if (Array.isArray(selector) && discovery.mode !== "EXACT") throw new EngineError("CONTRACT_VIOLATION", { first: "Provider exact selection mismatch" });
    for (const pin of pins) {
      const candidate = discovery.candidates.find((entry) => entry.reference.version.versionId === pin.versionId);
      if (!candidate || (!Array.isArray(selector) && discovery.status !== "FOUND")) {
        const status = discovery.status === "NO_COVERAGE" ? "NO_COVERAGE" : "NOT_AVAILABLE";
        sources.push(failedSource(role, pin.versionId || null, statusGap(status), status, discovery)); continue;
      }
      const reference = candidate.reference;
      if (reference.dataset.typeKey !== typeKeyByMarketRole[role] || reference.dataset.layer !== "DATA") { sources.push(failedSource(role, pin.versionId, "MARKET_SOURCE_TYPE_INVALID", "NOT_COMPUTABLE", discovery)); continue; }
      if (pin.expectedChecksum && pin.expectedChecksum !== reference.version.checksum.value) { sources.push(failedSource(role, pin.versionId, "MARKET_SOURCE_INTEGRITY", "NOT_COMPUTABLE", discovery)); continue; }
      work.reads++;
      const read = marketReadSchema.parse(await port.read({ versionId: pin.versionId, expectedChecksum: pin.expectedChecksum ?? reference.version.checksum.value }));
      if (read.status !== "AVAILABLE") { sources.push(failedSource(role, pin.versionId, read.status === "NOT_AVAILABLE" ? "MARKET_NOT_AVAILABLE" : "MARKET_SOURCE_INTEGRITY", read.status === "NOT_AVAILABLE" ? "NOT_AVAILABLE" : "NOT_COMPUTABLE", discovery)); continue; }
      if (read.integrity.checksum !== reference.version.checksum.value || !same(referenceIdentity(reference), referenceIdentity(read.reference))) {
        sources.push(failedSource(role, pin.versionId, "MARKET_SOURCE_INTEGRITY", "NOT_COMPUTABLE", discovery)); continue;
      }
      let json: unknown;
      try { json = JSON.parse(read.content); } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        sources.push(failedSource(role, pin.versionId, "MARKET_DATASET_INVALID", "NOT_COMPUTABLE", discovery)); continue;
      }
      const parsed = marketDatasetSchema.safeParse(json);
      if (!parsed.success || parsed.data.role !== role || read.contentKind !== "OTHER") {
        sources.push(failedSource(role, pin.versionId, "MARKET_DATASET_INVALID", "NOT_COMPUTABLE", discovery)); continue;
      }
      const dataset = parsed.data;
      const rowCount = dataset.role === "dimensions.dictionary" ? dataset.definitions.length : dataset.rows.length;
      work.parsedRows += rowCount;
      if (work.parsedRows > 10_000) throw new EngineError("REQUEST_TOO_LARGE", { first: "Market source read exceeds 10000 total rows" });
      sources.push(buildMarketSourceEvidence(role, read.reference, dataset, discovery, request, evaluatedAt));
    }
  }
  return finalizeMarketSources(sources, request, evaluatedAt, work);
}

export function buildMarketSourceEvidence(
  role: MarketDatasetRole, reference: MarketSourceReference, dataset: MarketDataset, selection: MarketDiscovery,
  request: MarketNormalizedRequest, evaluatedAt: string,
): PreparedMarketSource {
  const versionId = reference.version.versionId;
  const input = marketInputFromReference(reference, role, dataset);
  const observations = bindMarketObservations(dataset, versionId);
  const assumptionInputs = bindMarketAssumptions(dataset, versionId);
  if (!input || !observations || assumptionInputs.some((row) => [row.sourceRefs, ...row.assumptions.map((assumption) => assumption.sourceRefs)]
    .some((refs) => new Set(refs.map((ref) => canonicalize(ref))).size !== refs.length))) return failedSource(role, versionId, "MARKET_DATASET_INVALID", "NOT_COMPUTABLE", selection);
  const status = marketCoverageStatus(dataset, request);
  const source: PreparedMarketSource = { role, status, requestedVersionId: versionId, selection, reference, input, dataset, observations, assumptionInputs, matches: [], gaps: deriveInputGaps(input) };
  if (status !== "AVAILABLE") source.gaps.push(marketGap(statusGap(status), role));
  const natures = [...observations.map((row) => row.semantics.evidenceNature), ...assumptionInputs.map((row) => row.evidenceNature)];
  const futureMeasurements = [...observations.map((row) => row.semantics.time), ...assumptionInputs.map((row) => row.time)]
    .some((time) => (time.kind === "INTERVAL" ? time.endDate : time.date) > evaluatedAt.slice(0, 10));
  const futureSource = [reference.freshness.sourcePublishedAt, reference.publication.publishedAt, reference.freshness.effectiveFrom]
    .some((date) => date !== null && Date.parse(date) > Date.parse(evaluatedAt));
  const expiredSource = reference.freshness.status === "EXPIRED"
    || [reference.freshness.expiresAt, reference.freshness.effectiveTo].some((date) => date !== null && Date.parse(date) <= Date.parse(evaluatedAt));
  const contradictsGeography = reference.coverage?.countryCodes.length && dataset.coverage.geographies?.some((geography) => !reference.coverage!.countryCodes.includes(geography.countryCode));
  if ((reference.version.evidenceStatus === "ESTIMATED" && natures.some((nature) => nature !== "ESTIMATE"))
    || (reference.version.evidenceStatus === "DERIVED" && natures.some((nature) => nature === "OBSERVATION"))
    || futureMeasurements || futureSource || expiredSource || contradictsGeography) {
    source.status = "NOT_COMPUTABLE"; source.observations = []; source.assumptionInputs = []; source.gaps.push(marketGap("MARKET_DATASET_INVALID", role));
  }
  return source;
}

export function finalizeMarketSources(
  evidence: readonly PreparedMarketSource[], request: MarketNormalizedRequest, evaluatedAt: string,
  work: { discoveries: number; reads: number; parsedRows: number },
) {
  const sourceEvidence = structuredClone([...evidence]);
  const sources = structuredClone([...evidence]);
  const invalidRefs = invalidLineage(sources);
  const dictionaries = sources.filter((source) => source.status === "AVAILABLE" && source.role === "dimensions.dictionary" && source.dataset).map((source) => source.dataset!);
  for (const source of sources) {
    if (source.status !== "AVAILABLE") continue;
    source.matches = matchesFor(source, request, dictionaries);
    for (const row of [...source.observations, ...source.assumptionInputs]) {
      if (invalidRefs.has(canonicalize(row.ref))) {
        source.matches = source.matches.map((match) => match.observationRefs.some((ref) => same(ref, row.ref)) ? { ...match, status: "NOT_COMPUTABLE", observationRefs: [] } : match);
        if (source.role === "demand.assumptions") {
          source.status = "NOT_COMPUTABLE";
          source.gaps.push(marketGap("MARKET_INSUFFICIENT_EVIDENCE", `${source.role}/${row.ref.observationId}`));
        }
      }
    }
    for (const match of source.matches.filter((match) => match.status !== "AVAILABLE")) source.gaps.push(marketGap(statusGap(match.status), `${source.role}/${match.seriesId}/${match.periodId}`));
    if (source.matches.length && source.matches.every((match) => match.status !== "AVAILABLE")) source.status = source.matches.some((match) => match.status === "NOT_COMPUTABLE") ? "NOT_COMPUTABLE" : source.matches.some((match) => match.status === "NO_COVERAGE") ? "NO_COVERAGE" : "NOT_AVAILABLE";
  }
  const comparisonAvailability = request.parameters.comparisons.map((pair) => {
    const available = (periodId: string) => sources.flatMap((source) => source.matches
      .filter((match) => match.seriesId === pair.seriesId && match.periodId === periodId && match.status === "AVAILABLE")
      .flatMap((match) => source.observations.filter((row) => match.observationRefs.some((ref) => same(ref, row.ref)))));
    const first = available(pair.fromPeriodId);
    const last = available(pair.toPeriodId);
    const selectedMatches = sources.flatMap((source) => source.matches.filter((match) => match.seriesId === pair.seriesId && [pair.fromPeriodId, pair.toPeriodId].includes(match.periodId)));
    const multiple = request.series.find((series) => series.id === pair.seriesId)?.aggregation !== "SUM_DISJOINT" && (first.length > 1 || last.length > 1);
    const status: MarketSourceStatus = multiple ? "NOT_COMPUTABLE"
      : !first.length || !last.length ? selectedMatches.some((match) => match.status === "NOT_COMPUTABLE") ? "NOT_COMPUTABLE"
        : selectedMatches.some((match) => match.status === "NO_COVERAGE") ? "NO_COVERAGE" : "NOT_AVAILABLE"
        : comparableSeriesProblems(first[0]!, last[0]!).length ? "NOT_COMPUTABLE" : "AVAILABLE";
    return { ...pair, status };
  });
  const operandAvailability = request.parameters.estimates.flatMap((estimate) => [
    { estimateId: estimate.id, ref: estimate.cohortObservationRef, role: "context.indicators", kind: "COHORT" },
    { estimateId: estimate.id, ref: estimate.adoptionObservationRef, role: "demand.assumptions", kind: "ADOPTION_FRACTION" },
    { estimateId: estimate.id, ref: estimate.frequencyObservationRef, role: "demand.assumptions", kind: "CONSUMPTION_FREQUENCY" },
  ]).map((operand) => {
    const source = sources.find((candidate) => candidate.role === operand.role && candidate.input?.id === operand.ref.inputId);
    const row = source && [...source.observations, ...source.assumptionInputs].find((candidate) => same(candidate.ref, operand.ref));
    let status: MarketSourceStatus = !source || !row ? "NOT_AVAILABLE" : source.status;
    if (status === "AVAILABLE" && row && source?.dataset) {
      const time = "semantics" in row ? row.semantics.time : row.time;
      status = marketCoverageStatus(source.dataset, request, time);
      if (invalidRefs.has(canonicalize(operand.ref))
        || ("kind" in row ? row.kind !== operand.kind : operand.kind !== "COHORT" || !["population_count", "household_count"].includes(row.subject))) status = "NOT_COMPUTABLE";
    }
    return { ...operand, status };
  });
  const inputsById = new Map<string, EngineInput>();
  for (const source of sources) if (source.input) {
    const previous = inputsById.get(source.input.id);
    if (previous && !same({ ...previous, roles: [] }, { ...source.input, roles: [] })) throw new EngineError("INVALID_INPUT", { first: "Conflicting source snapshots in one preparation" });
    inputsById.set(source.input.id, { ...source.input, roles: [...new Set([...(previous?.roles ?? []), ...source.input.roles])].sort(compareText) });
  }
  const inputs = [...inputsById.values()].sort((a, b) => compareText(a.id, b.id));
  const gaps = normalizeGaps([
    ...sources.flatMap((source) => source.gaps),
    ...comparisonAvailability.filter((comparison) => comparison.status !== "AVAILABLE").map((comparison) => marketGap(comparison.status === "NOT_COMPUTABLE" ? "MARKET_NOT_COMPARABLE" : statusGap(comparison.status), `${comparison.seriesId}/${comparison.fromPeriodId}/${comparison.toPeriodId}`)),
    ...operandAvailability.filter((operand) => operand.status !== "AVAILABLE").map((operand) => marketGap(statusGap(operand.status), `${operand.estimateId}/${operand.kind}`)),
  ]);
  return { evaluatedAt, sourceEvidence, sources, inputs, inputsHash: canonicalHash(inputs), rights: deriveRights(inputs), attribution: deriveAttribution(inputs), comparisonAvailability, operandAvailability, gaps, work };
}
