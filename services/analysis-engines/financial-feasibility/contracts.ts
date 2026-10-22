import { z } from "zod";
import { canonicalHash, canonicalize, omitKeys } from "../shared/canonical";
import { attributionEntrySchema, deriveAttribution, deriveRights, rightsSchema, timingSchema } from "../shared/contracts";
import { identifierSchema, sha256Schema } from "../shared/primitives";
import { ENGINE_RUN_RECORD_CONTRACT, runRecordSchema, toRunInputRecord, type RunRecordContext } from "../shared/run-record";
import { engineEnvironments } from "../shared/states";
import { financialConfidencePolicy, financialConfidenceSchema } from "./confidence";
import { financialDecimalPolicy, financialResultDecimalSchema } from "./decimal";
import {
  currencySchema, FINANCIAL_REQUEST_CONTRACT, FINANCIAL_RESULT_CONTRACT, FINANCIAL_VERSION,
  financialAnalyses, financialInputSchema, financialReasons, financialSourceRefSchema, financialStates, financialTimestamp,
  financialVersionRefSchema,
  financialBasisSchema,
} from "./model";
import { ensureFinancialSize, financialBounds, financialRequestSchema, financialWorkUnits, normalizeFinancialInputs, normalizeFinancialRequest } from "./request";
import { assessFinancialPrerequisites } from "./semantics";

export const financialMetricSchema = z.object({
  key: identifierSchema, analysis: z.enum(financialAnalyses), status: z.enum(financialStates),
  value: financialResultDecimalSchema.nullable(), interpretation: z.enum(["OBSERVED", "ASSUMPTION_BASED_PROJECTION", "UNAVAILABLE"]),
  unit: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("MONEY"), currency: currencySchema }).strict(),
    z.object({ kind: z.literal("PERCENT") }).strict(),
    z.object({ kind: z.literal("PERIODS"), frequency: z.enum(["MONTHLY", "ANNUAL"]) }).strict(),
    z.object({ kind: z.literal("QUANTITY"), salesUnit: identifierSchema.nullable() }).strict(),
  ]),
  periodIds: z.array(identifierSchema).min(1).max(121), method: financialVersionRefSchema,
  basis: z.object({
    currency: financialBasisSchema.shape.currency, priceBasis: financialBasisSchema.shape.priceBasis,
    priceBaseDate: financialBasisSchema.shape.priceBaseDate, cashMode: financialBasisSchema.shape.cashMode,
    cashFlowBasis: financialBasisSchema.shape.cashFlowBasis,
  }).strict(),
  assumptionIds: z.array(identifierSchema).max(1000), evidence: z.array(financialSourceRefSchema).max(10_000),
  confidence: financialConfidenceSchema.nullable(), reasons: z.array(z.enum(financialReasons)).max(20),
  limitations: z.array(z.string().min(1).max(500)).min(1).max(10), rights: rightsSchema,
}).strict().superRefine((metric, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  const valued = ["COMPUTED", "PARTIAL", "ESTIMATED"].includes(metric.status);
  if (valued !== (metric.value !== null) || valued !== (metric.confidence !== null)) fail("Value/confidence exist exactly for valued financial states");
  if (valued === (metric.interpretation === "UNAVAILABLE")) fail("Interpretation must reflect value availability");
  if (!valued && !metric.reasons.length) fail("Unavailable values require a specific reason, never hidden zero");
  if (valued && (!metric.assumptionIds.length || !metric.evidence.length)) fail("Computed finances require explicit operands and evidence");
  if (valued && metric.unit.kind === "QUANTITY" && metric.unit.salesUnit === null) fail("A computed quantity needs its explicit sales unit");
  if (metric.unit.kind === "MONEY" && metric.unit.currency !== metric.basis.currency) fail("Metric currency must match its explicit financial basis");
  if (metric.status === "ESTIMATED" && metric.interpretation !== "ASSUMPTION_BASED_PROJECTION") fail("Estimated results cannot be observed facts");
  if (metric.reasons.some((reason) => ["AMBIGUOUS_IRR", "NON_CONVENTIONAL_CASH_FLOWS", "IRR_NOT_BRACKETED", "NUMERICAL_NONCONVERGENCE", "NONPOSITIVE_CONTRIBUTION"].includes(reason)) && metric.status !== "NOT_COMPUTABLE") fail("Invalid financial methods cannot carry values");
});
export const financialContextSchema = z.object({
  runId: identifierSchema, evaluatedAt: financialTimestamp, environment: z.enum(engineEnvironments), timing: timingSchema,
}).strict();
export type FinancialContext = z.infer<typeof financialContextSchema>;
export const financialFoundationResultSchema = z.object({
  contract: z.literal(FINANCIAL_RESULT_CONTRACT), phase: z.literal("M1_FOUNDATION"),
  runId: identifierSchema, evaluatedAt: financialTimestamp,
  engine: z.object({ key: z.literal("financial-feasibility"), version: z.literal(FINANCIAL_VERSION), environment: z.enum(engineEnvironments) }).strict(),
  request: z.object({ normalized: financialRequestSchema, evaluatedAt: financialTimestamp }).strict(),
  policies: z.object({ decimal: z.literal("financial-decimal-v1/1.0.0"), confidence: z.literal("financial-confidence-v1/1.0.0") }).strict(),
  inputs: z.array(financialInputSchema).max(32), metrics: z.array(financialMetricSchema).min(1).max(500),
  rights: rightsSchema, attribution: z.array(attributionEntrySchema).max(32),
  status: z.literal("COMPLETED_WITH_GAPS"), realDataAcceptance: z.literal("BLOCKED / NOT VERIFIED"),
  determinism: z.object({ requestHash: sha256Schema, inputsHash: sha256Schema, outputHash: sha256Schema }).strict(),
  limits: z.object({ costUnits: z.number().int().nonnegative().max(20_000), budgetUnits: z.literal(20_000) }).strict(),
  timing: timingSchema,
}).strict().superRefine((result, context) => {
  for (const metric of result.metrics) if (metric.value !== null || metric.confidence !== null || metric.status !== "NOT_COMPUTABLE" || !metric.reasons.includes("M1_CALCULATIONS_DEFERRED")) {
    context.addIssue({ code: "custom", message: "M1 is diagnostic only; financial calculations remain deferred" });
  }
});
export type FinancialFoundationResult = z.infer<typeof financialFoundationResultSchema>;

export function buildFinancialFoundationResult(rawRequest: unknown, rawInputs: unknown, rawContext: FinancialContext): FinancialFoundationResult {
  const context = financialContextSchema.parse(rawContext);
  const request = normalizeFinancialRequest(rawRequest, context.evaluatedAt);
  const inputs = normalizeFinancialInputs(rawInputs, request.normalized);
  const rights = deriveRights(inputs);
  const metrics = request.normalized.analyses.map((analysis) => {
    const prerequisites = assessFinancialPrerequisites(request.normalized, inputs, analysis);
    const evidence = [...prerequisites.assumptions.flatMap((entry) => entry.evidence),
      ...request.normalized.schedules.flatMap((entry) => entry.evidence)];
    const priceUnit = request.normalized.assumptions.find((entry) => entry.id === request.normalized.breakEven?.unitPriceId)?.unit;
    const unit = analysis === "MARGINS" || analysis === "IRR" ? { kind: "PERCENT" }
      : analysis === "PAYBACK" ? { kind: "PERIODS", frequency: request.normalized.basis.periods[0]!.frequency }
      : analysis === "BREAK_EVEN" ? {
        kind: "QUANTITY", salesUnit: priceUnit?.kind === "UNIT_PRICE" ? priceUnit.salesUnit : null,
      } : { kind: "MONEY", currency: request.normalized.basis.currency };
    return financialMetricSchema.parse({
      key: `readiness.${analysis.toLowerCase()}`, analysis, status: "NOT_COMPUTABLE", value: null,
      interpretation: "UNAVAILABLE", unit,
      periodIds: [request.normalized.basis.t0.id, ...request.normalized.basis.periods.map((period) => period.id)],
      basis: {
        currency: request.normalized.basis.currency, priceBasis: request.normalized.basis.priceBasis,
        priceBaseDate: request.normalized.basis.priceBaseDate, cashMode: request.normalized.basis.cashMode,
        cashFlowBasis: request.normalized.basis.cashFlowBasis,
      },
      method: { id: "financial-m1-foundation", version: "1.0.0" }, assumptionIds: prerequisites.assumptionIds,
      evidence, confidence: null, reasons: ["M1_CALCULATIONS_DEFERRED", ...prerequisites.reasons],
      limitations: ["M1 validates explicit assumptions and method prerequisites only; no financial result or investment recommendation is calculated."], rights,
    });
  });
  const core = {
    contract: FINANCIAL_RESULT_CONTRACT, phase: "M1_FOUNDATION" as const,
    runId: context.runId, evaluatedAt: context.evaluatedAt, timing: context.timing,
    engine: { key: "financial-feasibility" as const, version: FINANCIAL_VERSION, environment: context.environment },
    request: { normalized: request.normalized, evaluatedAt: context.evaluatedAt }, inputs, metrics, rights, attribution: deriveAttribution(inputs),
    policies: { decimal: "financial-decimal-v1/1.0.0" as const, confidence: "financial-confidence-v1/1.0.0" as const },
    status: "COMPLETED_WITH_GAPS" as const, realDataAcceptance: "BLOCKED / NOT VERIFIED" as const,
    limits: { costUnits: financialWorkUnits(request.normalized), budgetUnits: financialBounds.budgetUnits },
  };
  const result = financialFoundationResultSchema.parse({
    ...core, determinism: { requestHash: request.requestHash, inputsHash: canonicalHash(inputs), outputHash: canonicalHash(omitKeys(core, ["runId", "timing"])) },
  });
  ensureFinancialSize(result);
  return result;
}
export function validateFinancialFoundationResult(raw: unknown): FinancialFoundationResult {
  ensureFinancialSize(raw);
  const result = financialFoundationResultSchema.parse(raw);
  const recomputed = buildFinancialFoundationResult(result.request.normalized, result.inputs, {
    runId: result.runId, evaluatedAt: result.evaluatedAt, environment: result.engine.environment, timing: result.timing,
  });
  if (canonicalize(result) !== canonicalize(recomputed)) throw new RangeError("Financial M1 result/hash/semantics mismatch");
  return result;
}

/** Pure storage-shape proof, not an authorization or persistence service. */
export function buildFinancialFoundationRecord(raw: unknown, context: RunRecordContext) {
  const result = validateFinancialFoundationResult(raw);
  return runRecordSchema.parse({
    contract: ENGINE_RUN_RECORD_CONTRACT, runId: result.runId, engineKey: result.engine.key, engineVersion: result.engine.version,
    requestContract: FINANCIAL_REQUEST_CONTRACT, resultContract: FINANCIAL_RESULT_CONTRACT,
    environment: result.engine.environment, status: result.status, ...result.determinism, request: result.request, result,
    errorCode: null, confidence: null, gaps: { BLOCKING: result.metrics.length, WARNING: 0, INFO: 0 },
    actor: context.actor, subject: context.subject ?? null, timing: result.timing,
    cost: result.limits, runtime: { phase: "M1_FOUNDATION", decimalPolicy: financialDecimalPolicy, confidencePolicy: financialConfidencePolicy },
    createdAt: context.createdAt, inputs: result.inputs.map(toRunInputRecord),
  });
}
