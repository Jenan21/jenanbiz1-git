import { z } from "zod";
import { canonicalize, compareText } from "../shared/canonical";
import { engineInputSchema } from "../shared/contracts";
import { identifierSchema, sha256Schema, shortTextSchema, timestampSchema } from "../shared/primitives";
import { quantitySemanticsSchema, quantityValueProblems } from "../shared/quantities";

export const OPPORTUNITY_REQUEST_CONTRACT = "jenan.opportunity-gap.request/v1";
export const OPPORTUNITY_RESULT_CONTRACT = "jenan.opportunity-gap.result/v1";
export const OPPORTUNITY_VERSION = "1.0.0-m1";
export const opportunityStates = ["COMPUTED", "PARTIAL", "NO_COVERAGE", "NOT_AVAILABLE", "NOT_COMPUTABLE"] as const;
export const findingKinds = ["DATA_GAP", "BENCHMARK_GAP", "DEMAND_SUPPLY_GAP", "OPPORTUNITY_SIGNAL"] as const;
export const signalStates = ["SUPPORTED", "NOT_SUPPORTED", "INSUFFICIENT_EVIDENCE", "NOT_COMPARABLE"] as const;
export const opportunityRoles = ["need.observations", "supply.capacity", "provision.observations", "benchmarks.targets", "context.indicators", "dimensions.dictionary"] as const;
export const timestamp = timestampSchema.refine((value) => new Date(value).toISOString() === value, "Use canonical UTC millisecond timestamps");
export const versionRefSchema = z.object({ id: identifierSchema, version: identifierSchema }).strict();
export const methodSchema = versionRefSchema.extend({ description: shortTextSchema }).strict();
export const textListSchema = z.array(shortTextSchema).max(10);
export const sortedUnique = (values: readonly string[]) => [...new Set(values)].sort(compareText);
export const isSortedUnique = (values: readonly string[]) => canonicalize(values) === canonicalize(sortedUnique(values));
export const sourceRecordSchema = z.object({
  inputId: identifierSchema, versionId: identifierSchema, checksum: sha256Schema, sourceRecordId: identifierSchema,
}).strict();
export const scopeSchema = z.object({ dimensions: quantitySemanticsSchema.shape.dimensions, time: quantitySemanticsSchema.shape.time }).strict();
export const definitionSchema = z.object({
  measuredSubject: quantitySemanticsSchema.shape.measuredSubject, unit: quantitySemanticsSchema.shape.unit, measureKind: quantitySemanticsSchema.shape.measureKind,
}).strict();
export const benchmarkSchema = z.object({
  policy: versionRefSchema, authority: shortTextSchema, justification: shortTextSchema,
  validFrom: timestamp, validUntil: timestamp, scope: scopeSchema,
  source: sourceRecordSchema,
}).strict().refine((value) => value.validFrom < value.validUntil, "Benchmark validity is a nonempty interval");

export const opportunityFactSchema = z.object({
  contract: z.literal("jenan.opportunity-gap.fact/v1"), id: identifierSchema,
  role: z.enum(opportunityRoles),
  measurementBoundary: z.enum(["TOTAL_NEED", "UNMET_NEED", "ALREADY_SERVED", "SERVICEABLE_CAPACITY", "MEASURED_PROVISION", "NORMATIVE_TARGET", "CONTEXT_ONLY"]),
  evidenceClass: z.enum(["OBSERVED", "NORMATIVE", "CONTEXTUAL"]),
  value: z.number().finite().nonnegative().nullable(), semantics: quantitySemanticsSchema,
  coverage: z.enum(["COMPLETE", "PARTIAL", "NONE", "UNKNOWN"]),
  method: methodSchema, evidence: z.array(sourceRecordSchema).min(1).max(32),
  benchmark: benchmarkSchema.nullable(), limitations: textListSchema,
}).strict().superRefine((fact, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const boundaries = {
    "need.observations": ["TOTAL_NEED", "UNMET_NEED", "ALREADY_SERVED"],
    "supply.capacity": ["SERVICEABLE_CAPACITY"],
    "provision.observations": ["MEASURED_PROVISION"],
    "benchmarks.targets": ["NORMATIVE_TARGET"],
    "context.indicators": ["CONTEXT_ONLY"],
    "dimensions.dictionary": ["CONTEXT_ONLY"],
  };
  if (!boundaries[fact.role].includes(fact.measurementBoundary)) fail("Role does not establish this measurement boundary");
  const expectedClass = fact.role === "benchmarks.targets" ? "NORMATIVE" : fact.measurementBoundary === "CONTEXT_ONLY" ? "CONTEXTUAL" : "OBSERVED";
  if (fact.evidenceClass !== expectedClass) fail("Evidence class must reflect observed, normative or contextual meaning");
  if (fact.semantics.comparison || fact.semantics.evidenceNature === "ESTIMATE") fail("M1 accepts non-estimated base facts, not derived comparisons");
  if (fact.evidenceClass === "OBSERVED" && fact.semantics.evidenceNature !== "OBSERVATION") fail("An observed operand requires observation semantics");
  if (fact.evidenceClass === "NORMATIVE" && fact.semantics.evidenceNature !== "DERIVED") fail("A normative target is not observed demand");
  if (fact.method.id !== fact.semantics.dimensions.methodology.id || fact.method.version !== fact.semantics.dimensions.methodology.version) fail("Documented method must match the versioned methodology");
  if ((fact.role === "benchmarks.targets") !== (fact.benchmark !== null)) fail("Only a documented benchmark target carries benchmark authority");
  if (fact.benchmark && canonicalize(fact.benchmark.scope) !== canonicalize({ dimensions: fact.semantics.dimensions, time: fact.semantics.time })) fail("Benchmark applicability must describe the target scope and period");
  if (fact.benchmark && !fact.evidence.some((ref) => canonicalize(ref) === canonicalize(fact.benchmark?.source))) fail("Benchmark source must be retained in evidence");
  if (fact.coverage === "NONE" && fact.value !== null) fail("No coverage cannot carry a value");
  if (fact.value === 0 && fact.coverage !== "COMPLETE") fail("Incomplete coverage cannot prove zero");
  if (fact.coverage !== "COMPLETE" && !fact.limitations.length) fail("Incomplete coverage needs explicit limitations");
  if (fact.value !== null) for (const problem of quantityValueProblems(fact.value, fact.semantics, false)) fail(problem);
});
export type OpportunityFact = z.infer<typeof opportunityFactSchema>;
export const opportunityInputSchema = engineInputSchema.refine((input) =>
  input.kind === "DATA_CENTER_VERSION" && input.governance === "DC_PUBLISHED" && input.ref.system === "DATA_CENTER",
"Only exact governed Data Center descriptors are accepted; upstream facts await an approved resolver").refine((input) => {
  const dates = [input.freshness.sourcePublishedAt, input.freshness.expiresAt, input.quality.status === "UNAVAILABLE" ? null : input.quality.measuredAt];
  return dates.every((value) => value === null || timestamp.safeParse(value).success);
}, "Input dates must use canonical UTC millisecond timestamps");

export const opportunityEvidenceSchema = z.object({
  inputs: z.array(opportunityInputSchema).max(32),
  facts: z.array(opportunityFactSchema).max(10_000),
}).strict().superRefine((evidence, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  for (const entries of [evidence.inputs, evidence.facts]) if (new Set(entries.map((entry) => entry.id)).size !== entries.length) fail("Input/fact identities must be unique");
  const inputs = new Map(evidence.inputs.map((input) => [input.id, input]));
  for (const fact of evidence.facts) for (const ref of fact.evidence) {
    const input = inputs.get(ref.inputId);
    if (!input || input.ref.id !== ref.versionId || input.checksum?.value !== ref.checksum || !input.roles.includes(fact.role)) fail("Evidence must resolve to the exact version/hash and declared role");
  }
});
export type OpportunityEvidence = z.infer<typeof opportunityEvidenceSchema>;
