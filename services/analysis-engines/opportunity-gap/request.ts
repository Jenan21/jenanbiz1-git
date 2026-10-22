import { z } from "zod";
import { canonicalHash, canonicalize, compareText } from "../shared/canonical";
import { identifierSchema, sha256Schema } from "../shared/primitives";
import { quantitySemanticsSchema } from "../shared/quantities";
import { MAX_RUN_JSON_BYTES } from "../shared/run-record";
import { definitionSchema, OPPORTUNITY_REQUEST_CONTRACT, opportunityEvidenceSchema, opportunityRoles, scopeSchema, sortedUnique, timestamp, versionRefSchema } from "./model";

export function ensureOpportunitySize(raw: unknown) {
  if (Buffer.byteLength(canonicalize(raw), "utf8") > MAX_RUN_JSON_BYTES) throw new RangeError("Opportunity JSON exceeds 2 MiB");
}
export const opportunityAnalyses = ["DATA_COVERAGE", "BENCHMARK_GAP", "DEMAND_SUPPLY_GAP", "OPPORTUNITY_SIGNALS", "HISTORICAL_CHANGE"] as const;
export const opportunityRequestSchema = z.object({
  contract: z.literal(OPPORTUNITY_REQUEST_CONTRACT),
  scope: scopeSchema, definition: definitionSchema,
  analyses: z.array(z.enum(opportunityAnalyses)).min(1).max(5),
  data: z.object({
    roles: z.array(z.object({ role: z.enum(opportunityRoles), versionId: identifierSchema, checksum: sha256Schema }).strict()).max(32),
  }).strict(),
  benchmarkPolicy: versionRefSchema.nullable(),
  signalPolicy: versionRefSchema.nullable(),
  historical: z.object({
    scope: scopeSchema, versions: z.array(z.object({ role: z.enum(opportunityRoles), versionId: identifierSchema, checksum: sha256Schema }).strict()).min(1).max(32),
  }).strict().nullable(),
}).strict().superRefine((request, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (!quantitySemanticsSchema.safeParse({ ...request.definition, ...request.scope, evidenceNature: "OBSERVATION" }).success) fail("Definition, units and reporting scope must form a valid base quantity");
  if (new Set(request.analyses).size !== request.analyses.length) fail("Analyses cannot be repeated");
  const pins = [...request.data.roles, ...(request.historical?.versions ?? [])];
  if (pins.length > 32) fail("At most 32 exact role/version pins including history");
  const hashes = new Map<string, string>();
  for (const pin of pins) {
    if (hashes.has(pin.versionId) && hashes.get(pin.versionId) !== pin.checksum) fail("One exact version cannot have conflicting hashes");
    hashes.set(pin.versionId, pin.checksum);
  }
  for (const group of [request.data.roles, request.historical?.versions ?? []]) {
    if (new Set(group.map((pin) => `${pin.role}|${pin.versionId}`)).size !== group.length) fail("Duplicate role/version pins");
  }
  if (request.analyses.includes("BENCHMARK_GAP") && !request.benchmarkPolicy) fail("Benchmark analysis requires an explicit versioned policy");
  if (request.analyses.includes("OPPORTUNITY_SIGNALS") && !request.signalPolicy) fail("Signals require an explicit approved rule policy; there is no default threshold");
  if (request.analyses.includes("HISTORICAL_CHANGE") !== (request.historical !== null)) fail("Historical analysis requires an explicit independently pinned baseline");
});
export type OpportunityRequest = z.infer<typeof opportunityRequestSchema>;
export function normalizeOpportunityRequest(raw: unknown, evaluatedAt: string) {
  ensureOpportunitySize(raw);
  timestamp.parse(evaluatedAt);
  const parsed = opportunityRequestSchema.parse(raw);
  const sortPins = (pins: OpportunityRequest["data"]["roles"]) => [...pins].sort((a, b) => compareText(a.role, b.role) || compareText(a.versionId, b.versionId));
  const normalized: OpportunityRequest = {
    ...parsed, analyses: [...parsed.analyses].sort(compareText),
    data: { roles: sortPins(parsed.data.roles) },
    historical: parsed.historical ? { ...parsed.historical, versions: sortPins(parsed.historical.versions) } : null,
  };
  const request = { normalized, evaluatedAt };
  return { ...request, requestHash: canonicalHash(request) };
}
export function normalizeOpportunityEvidence(raw: unknown) {
  ensureOpportunitySize(raw);
  const evidence = opportunityEvidenceSchema.parse(raw);
  return {
    inputs: [...evidence.inputs].map((input) => ({
      ...input, coverage: input.coverage ? { ...input.coverage, countryCodes: sortedUnique(input.coverage.countryCodes), regionCodes: sortedUnique(input.coverage.regionCodes) } : null,
    })).sort((a, b) => compareText(a.id, b.id)),
    facts: evidence.facts.map((fact) => ({
      ...fact, limitations: sortedUnique(fact.limitations),
      evidence: [...new Map(fact.evidence.map((ref) => [canonicalize(ref), ref])).values()].sort((a, b) => compareText(canonicalize(a), canonicalize(b))),
    })).sort((a, b) => compareText(a.id, b.id)),
  };
}
