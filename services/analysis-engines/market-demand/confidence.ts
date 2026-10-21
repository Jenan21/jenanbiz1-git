import { z } from "zod";
import { canonicalize, compareText } from "../shared/canonical";
import { buildConfidenceBreakdown, confidenceBreakdownSchema, type ConfidenceBreakdown, type ConfidenceCapInput, type ConfidencePolicyDescriptor } from "../shared/confidence";
import { engineInputSchema } from "../shared/contracts";
import { bandRank } from "../shared/states";
import { timestampSchema } from "../shared/primitives";
import { EngineError } from "../shared/errors";
import { observationRefSchema, temporalReferenceSchema } from "../shared/quantities";
import { isContextSubject, marketObservationSchema, normalizeMarketObservation, type MarketObservation } from "./model";

const weights = { sourceQuality: 20, geographicCoverage: 15, temporalCoverage: 15, freshness: 10, completeness: 15, measurementMethod: 15, evidenceNature: 5, rightsProvenance: 5 } as const;
type Factor = keyof typeof weights;
const descriptions: Record<Factor, { ar: string; en: string }> = {
  sourceQuality: { ar: "جودة المصدر المقيسة.", en: "Recorded measured source quality." },
  geographicCoverage: { ar: "تغطية المنطقة الإحصائية.", en: "Statistical geographic coverage." },
  temporalCoverage: { ar: "اكتمال فترات القياس.", en: "Reporting period coverage." },
  freshness: { ar: "حداثة المصدر وفق سياسة معلنة.", en: "Source freshness under its declared policy." },
  completeness: { ar: "اكتمال المجتمع الإحصائي.", en: "Completeness of the statistical universe." },
  measurementMethod: { ar: "توثيق وملاءمة المنهجية.", en: "Documented applicable measurement method." },
  evidenceNature: { ar: "طبيعة الدليل المرصود أو المقدّر.", en: "Observed or estimated evidence nature." },
  rightsProvenance: { ar: "المصدر والتتبع والحقوق.", en: "Source lineage and declared rights." },
};
const capDefinitions = [
  { code: "MARKET_INCOMPLETE", maxBand: "LOW", appliesWhen: { ar: "عينة أو اكتمال مجهول أو تغطية جزئية.", en: "Sample, unknown completeness or incomplete coverage." } },
  { code: "MARKET_UNVERIFIED", maxBand: "LOW", appliesWhen: { ar: "دليل غير متحقق أو ترخيص غير مصنف.", en: "Unverified evidence or undeclared license class." } },
  { code: "MARKET_ESTIMATED", maxBand: "MEDIUM", appliesWhen: { ar: "تقدير معلن أو اعتماد على تقدير.", en: "A declared estimate or reliance on an estimate." } },
  { code: "MARKET_FRESHNESS_LIMITED", maxBand: "MEDIUM", appliesWhen: { ar: "حداثة مجهولة أو مصدر قديم.", en: "Unknown freshness or stale source." } },
  { code: "MARKET_QUALITY_UNMEASURED", maxBand: "MEDIUM", appliesWhen: { ar: "جودة غير مقيسة.", en: "Unmeasured source quality." } },
  { code: "MARKET_OPERAND_LOW", maxBand: "LOW", appliesWhen: { ar: "أضعف مدخل منخفض الثقة.", en: "The weakest operand has low confidence." } },
  { code: "MARKET_OPERAND_MEDIUM", maxBand: "MEDIUM", appliesWhen: { ar: "أضعف مدخل متوسط الثقة.", en: "The weakest operand has medium confidence." } },
] as const;
export const marketConfidencePolicy: ConfidencePolicyDescriptor = {
  id: "market-confidence-v1", version: "1.0.0", kind: "EXPLAINABLE_HEURISTIC", scale: "POINTS_100", isProbability: false,
  thresholds: { high: 80, medium: 60, low: 35 },
  factors: (Object.keys(weights) as Factor[]).map((key) => ({ key, maxPoints: weights[key], description: descriptions[key] })),
  caps: [...capDefinitions],
  methodology: { ar: "مجموع ثمانية عوامل من أضعف المدخلات، ثم تطبيق الحدود؛ لا يعوّض نقص الصلاحية أو المصدر.", en: "Sum eight weakest-input factors, then apply caps; points never override missing validity or provenance." },
  disclaimer: { ar: "جودة الدليل السوقي وليست احتمال نجاح مشروع أو توصية.", en: "Market evidence quality, not project success probability or a recommendation." },
};

const basisSchema = z.object({ observation: marketObservationSchema, input: engineInputSchema }).strict();
export type MarketConfidenceBasis = z.infer<typeof basisSchema>;
const evidenceSchema = z.object({
  ref: observationRefSchema, role: z.enum(["demand.observations", "context.indicators", "demand.assumptions", "dimensions.dictionary"]),
  nature: z.enum(["OBSERVATION", "ESTIMATE", "DERIVED"]), time: temporalReferenceSchema,
  status: z.enum(["AVAILABLE", "SUPPRESSED", "NOT_AVAILABLE"]),
  geographicCoverage: z.enum(["EXACT", "PARTIAL", "UNKNOWN", "OUTSIDE"]),
  temporalCoverage: z.enum(["COMPLETE", "PARTIAL", "UNKNOWN"]),
  measurementMethod: z.enum(["DOCUMENTED", "LIMITED", "UNSUPPORTED"]),
  sourceRefs: z.array(observationRefSchema).min(1).max(672),
  identity: z.string().min(1).max(200_000),
}).strict();
export type MarketConfidenceEvidence = z.infer<typeof evidenceSchema>;
type ScoringBasis = { observation: MarketConfidenceEvidence; input: z.infer<typeof engineInputSchema> };
export type MarketConfidenceResult =
  | { kind: "SCORED"; confidence: ConfidenceBreakdown }
  | { kind: "NOT_SCORABLE"; reason: string; confidence: null };

function localReportingDate(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
  const part = (name: string) => parts.find((entry) => entry.type === name)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function pointsFor({ observation: row, input }: ScoringBasis): Record<Factor, number> {
  return {
    sourceQuality: input.quality.status === "MEASURED" ? input.quality.score >= 0.8 ? 20 : 10 : 0,
    geographicCoverage: row.geographicCoverage === "EXACT" ? 15 : row.geographicCoverage === "PARTIAL" ? 8 : 0,
    temporalCoverage: row.temporalCoverage === "COMPLETE" ? 15 : row.temporalCoverage === "PARTIAL" ? 8 : 0,
    freshness: input.freshness.status === "FRESH" ? 10 : input.freshness.status === "STALE" ? 5 : 0,
    completeness: input.completeness === "INVENTORY" ? 15 : input.completeness === "SAMPLE" ? 8 : 0,
    measurementMethod: row.measurementMethod === "DOCUMENTED" ? 15 : row.measurementMethod === "LIMITED" ? 8 : 0,
    evidenceNature: row.nature === "ESTIMATE" ? 3 : input.evidenceStatus === "UNVERIFIED" || input.evidenceStatus === null ? 0 : 5,
    rightsProvenance: input.licenseClass === null ? 3 : 5,
  };
}
function capsFor({ observation: row, input }: ScoringBasis): ConfidenceCapInput[] {
  const codes = new Set<string>();
  if (input.completeness !== "INVENTORY" || row.geographicCoverage !== "EXACT" || row.temporalCoverage !== "COMPLETE" || !input.coverage) codes.add("MARKET_INCOMPLETE");
  if (input.licenseClass === null || input.evidenceStatus === "UNVERIFIED" || input.evidenceStatus === null) codes.add("MARKET_UNVERIFIED");
  if (row.nature === "ESTIMATE" || input.evidenceStatus === "ESTIMATED") codes.add("MARKET_ESTIMATED");
  if (input.freshness.status !== "FRESH") codes.add("MARKET_FRESHNESS_LIMITED");
  if (input.quality.status !== "MEASURED") codes.add("MARKET_QUALITY_UNMEASURED");
  return capDefinitions.filter((cap) => codes.has(cap.code)).map((cap) => ({ code: cap.code, maxBand: cap.maxBand, reason: cap.appliesWhen }));
}

export function calculateMarketConfidence(raw: readonly MarketConfidenceBasis[], evaluatedAt: string): MarketConfidenceResult {
  const bases = z.array(basisSchema).min(1).max(32).parse(raw);
  return calculateMarketEvidenceConfidence(bases.map(({ observation: original, input }) => {
    const row = normalizeMarketObservation(original);
    return { input, observation: {
      ref: row.ref, role: isContextSubject(row.subject) ? "context.indicators" as const : "demand.observations" as const,
      nature: row.semantics.evidenceNature, time: row.semantics.time, status: row.status,
      geographicCoverage: row.geographicCoverage, temporalCoverage: row.temporalCoverage, measurementMethod: row.measurementMethod,
      sourceRefs: [...row.sourceRefs, ...row.assumptions.flatMap((assumption) => assumption.sourceRefs)],
      identity: canonicalize(row),
    } };
  }), evaluatedAt);
}

export function calculateMarketEvidenceConfidence(raw: readonly ScoringBasis[], evaluatedAt: string): MarketConfidenceResult {
  timestampSchema.parse(evaluatedAt);
  const bases = z.array(z.object({ observation: evidenceSchema, input: engineInputSchema }).strict()).min(1).max(10_000).parse(raw).map((basis) => {
    const freshness = basis.input.freshness;
    const tooOld = freshness.sourcePublishedAt && freshness.freshnessDays
      && Date.parse(evaluatedAt) - Date.parse(freshness.sourcePublishedAt) > freshness.freshnessDays * 86_400_000;
    return { ...basis, input: { ...basis.input, freshness: { ...freshness, status: freshness.status === "FRESH" && tooOld ? "STALE" as const : freshness.status } } };
  }).sort((a, b) => compareText(a.input.id, b.input.id) || compareText(a.observation.ref.observationId, b.observation.ref.observationId));
  const blocked = (reason: string): MarketConfidenceResult => ({ kind: "NOT_SCORABLE", reason, confidence: null });
  const rowsByRef = new Map<string, string>();
  const inputsById = new Map<string, string>();
  const knownInputIds = new Set(bases.map((basis) => basis.input.id));
  for (const basis of bases) {
    const { input, observation: row } = basis;
    const ref = canonicalize(row.ref);
    const prior = rowsByRef.get(ref);
    if (prior && prior !== canonicalize(basis)) return blocked("Conflicting evidence for the same exact observation");
    rowsByRef.set(ref, canonicalize(basis));
    const previousInput = inputsById.get(input.id);
    if (previousInput && previousInput !== canonicalize(input)) return blocked("Conflicting snapshots of one exact source input");
    inputsById.set(input.id, canonicalize(input));
    if (input.kind !== "DATA_CENTER_VERSION" || input.governance !== "DC_PUBLISHED" || row.ref.inputId !== input.id || !input.checksum) return blocked("Exact governed input provenance is required");
    if (!input.roles.includes(row.role)) return blocked("Source role does not support the measurement subject");
    if (row.sourceRefs.some((source) => !knownInputIds.has(source.inputId))) return blocked("Required lineage input is unresolved");
    if (input.evidenceStatus === "CONFLICTED" || row.status !== "AVAILABLE" || row.geographicCoverage === "UNKNOWN" || row.geographicCoverage === "OUTSIDE" || row.temporalCoverage === "UNKNOWN" || row.measurementMethod === "UNSUPPORTED") return blocked("Observation scope or evidence is unusable");
    if (input.evidenceStatus === "ESTIMATED" && row.nature !== "ESTIMATE") return blocked("An estimated source cannot be relabelled as observed");
    const expiry = input.freshness.expiresAt;
    if (input.freshness.status === "EXPIRED" || (expiry && Date.parse(expiry) <= Date.parse(evaluatedAt))) return blocked("Input expired");
    if (input.freshness.sourcePublishedAt && Date.parse(input.freshness.sourcePublishedAt) > Date.parse(evaluatedAt)) return blocked("Input publication lies after the evaluation instant");
    if (input.quality.status !== "UNAVAILABLE" && Date.parse(input.quality.measuredAt) > Date.parse(evaluatedAt)) return blocked("Quality assessment lies after the evaluation instant");
    const date = localReportingDate(evaluatedAt, row.time.timeZone);
    if ((row.time.kind === "INTERVAL" ? row.time.endDate : row.time.date) > date) return blocked("Incomplete or future reporting period");
  }
  const scored = bases.map((basis) => ({ basis, points: pointsFor(basis) }));
  const factors = (Object.keys(weights) as Factor[]).map((key) => {
    const weakest = [...scored].sort((a, b) => a.points[key] - b.points[key])[0]!;
    return { key, maxPoints: weights[key], points: weakest.points[key], inputId: weakest.basis.input.id, explanation: descriptions[key] };
  });
  const caps = bases.flatMap(capsFor);
  const operandBands = scored.map(({ basis, points }) => buildConfidenceBreakdown(marketConfidencePolicy,
    (Object.keys(weights) as Factor[]).map((key) => ({ key, maxPoints: weights[key], points: points[key], inputId: basis.input.id, explanation: descriptions[key] })), capsFor(basis)).band);
  const weakest = [...operandBands].sort((a, b) => bandRank(a) - bandRank(b))[0]!;
  if (weakest === "INSUFFICIENT") return blocked("Insufficient operand evidence quality");
  const operandCap = capDefinitions.find((cap) => cap.code === (weakest === "LOW" ? "MARKET_OPERAND_LOW" : weakest === "MEDIUM" ? "MARKET_OPERAND_MEDIUM" : ""));
  if (bases.length > 1 && operandCap) caps.push({ code: operandCap.code, maxBand: operandCap.maxBand, reason: operandCap.appliesWhen });
  const confidence = confidenceBreakdownSchema.parse(buildConfidenceBreakdown(marketConfidencePolicy, factors, caps));
  return confidence.band === "INSUFFICIENT" ? blocked("Insufficient combined evidence quality") : { kind: "SCORED", confidence };
}

export function observationBases(observations: readonly MarketObservation[], inputs: readonly z.infer<typeof engineInputSchema>[]): MarketConfidenceBasis[] {
  return observations.map((observation) => {
    const input = inputs.find((entry) => entry.id === observation.ref.inputId);
    if (!input) throw new EngineError("INVALID_INPUT", { first: "Unresolved Market input" });
    return { observation, input };
  });
}
