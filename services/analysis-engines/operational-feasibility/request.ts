import { canonicalHash, canonicalize, compareText } from "../shared/canonical";
import { MAX_RUN_JSON_BYTES } from "../shared/run-record";
import { normalizeOperationalDecimal } from "./decimal";
import { operationalInputSchema, operationalRequestSchema, operationalTimestamp, type OperationalRequest } from "./model";

export const operationalBounds = {
  versions: 32, periods: 120, stages: 100, pools: 200, items: 1000, scenariosIncludingBase: 10,
  sensitivity: 20, expandedRows: 10_000, metrics: 500, bytes: MAX_RUN_JSON_BYTES, budgetUnits: 20_000,
} as const;
export function ensureOperationalSize(raw: unknown) {
  if (Buffer.byteLength(canonicalize(raw), "utf8") > operationalBounds.bytes) throw new RangeError("Operational payload exceeds 2 MiB");
}
const byId = <T extends { id: string }>(entries: T[]) => entries.sort((a, b) => compareText(a.id, b.id));
function sortEvidence<T extends { inputId: string; versionId: string; sourceRecordId: string; checksum: string }>(entries: T[]) {
  const unique = new Map(entries.map((entry) => [canonicalize(entry), entry]));
  return [...unique.values()].sort((a, b) => compareText(canonicalize(a), canonicalize(b)));
}
export function operationalWork(request: OperationalRequest) {
  const baseRows = request.values.length + request.schedules.reduce((n, s) => n + s.rows.length, 0) + request.requirements.entries.length;
  const multiplier = 1 + request.scenarios.length + 3 * request.sensitivity.length;
  const expandedRows = (baseRows + request.network.stages.length * request.periods.length) * multiplier;
  const metrics = request.analyses.length * request.periods.length * multiplier;
  const costUnits = expandedRows + metrics + request.schedules.reduce((n, s) => n + s.coveredPeriodIds.length, 0);
  return { baseRows, expandedRows, metrics, costUnits };
}
export function normalizeOperationalRequest(raw: unknown, evaluatedAt: string) {
  ensureOperationalSize(raw);
  operationalTimestamp.parse(evaluatedAt);
  const request = operationalRequestSchema.parse(raw);
  const pools = new Set(request.network.stages.map((stage) => stage.poolId));
  request.values.forEach((value) => {
    if ("poolId" in value.unit) pools.add(value.unit.poolId);
    if ("roleId" in value.unit) pools.add(value.unit.roleId);
    if (value.declaredAt > evaluatedAt || (value.approvedAt !== null && value.approvedAt > evaluatedAt)) throw new RangeError("Future operational declaration/approval");
    if (value.value !== null) value.value = normalizeOperationalDecimal(value.value);
    value.evidence = sortEvidence(value.evidence);
  });
  if (pools.size > operationalBounds.pools) throw new RangeError("Operational pool limit");
  byId(request.values); byId(request.schedules); byId(request.requirements.entries); byId(request.scenarios); byId(request.sensitivity);
  request.analyses.sort(compareText);
  for (const schedule of request.schedules) {
    byId(schedule.rows); schedule.coveredPeriodIds.sort(compareText); schedule.evidence = sortEvidence(schedule.evidence);
  }
  request.requirements.evidence = sortEvidence(request.requirements.evidence);
  request.requirements.entries.forEach((entry) => { entry.evidence = sortEvidence(entry.evidence); });
  for (const entry of [...request.scenarios, ...request.sensitivity]) {
    if (entry.declaredAt > evaluatedAt) throw new RangeError("Future scenario declaration");
    entry.evidence = sortEvidence(entry.evidence);
  }
  for (const scenario of request.scenarios) {
    scenario.overrides.sort((a, b) => compareText(a.valueId, b.valueId));
    scenario.overrides.forEach((entry) => { if (entry.value !== null) entry.value = normalizeOperationalDecimal(entry.value); });
  }
  for (const point of request.sensitivity) {
    point.low = normalizeOperationalDecimal(point.low); point.base = normalizeOperationalDecimal(point.base); point.high = normalizeOperationalDecimal(point.high);
  }
  const work = operationalWork(request);
  if (work.baseRows > operationalBounds.items || work.expandedRows > operationalBounds.expandedRows
    || work.metrics > operationalBounds.metrics || work.costUnits > operationalBounds.budgetUnits) throw new RangeError("Operational work/output budget exceeded");
  ensureOperationalSize(request);
  return { normalized: request, evaluatedAt, requestHash: canonicalHash({ normalized: request, evaluatedAt }) };
}
export function normalizeOperationalInputs(raw: unknown) {
  ensureOperationalSize(raw);
  const inputs = operationalInputSchema.array().max(operationalBounds.versions).parse(raw);
  if (new Set(inputs.map((input) => input.id)).size !== inputs.length || new Set(inputs.map((input) => input.ref.id)).size !== inputs.length) throw new RangeError("Duplicate operational input or exact version");
  return byId(inputs);
}
export function operationalEvidence(request: OperationalRequest) {
  return [...request.values.flatMap((v) => v.evidence), ...request.schedules.flatMap((s) => s.evidence),
    ...request.requirements.evidence, ...request.requirements.entries.flatMap((e) => e.evidence),
    ...request.scenarios.flatMap((s) => s.evidence), ...request.sensitivity.flatMap((s) => s.evidence)];
}
