import { z } from "zod";
import { compareText } from "../shared/canonical";
import { buildConfidenceBreakdown, confidenceBreakdownSchema, type ConfidenceCapInput, type ConfidencePolicyDescriptor } from "../shared/confidence";
import { bilingualSchema } from "../shared/primitives";
import { opportunityInputSchema, timestamp } from "./model";

const weights = {
  sourceQuality: 15, measurementDefinition: 15, comparability: 20, geographicSectorCoverage: 15,
  temporalFreshness: 10, completeness: 10, provenanceRights: 10, ruleApplicability: 5,
} as const;
type Factor = keyof typeof weights;
const text = (en: string, ar: string) => bilingualSchema.parse({ ar, en });
const labels: Record<Factor, ReturnType<typeof text>> = {
  sourceQuality: text("Source quality", "جودة المصدر"),
  measurementDefinition: text("Documented measurement and definition", "توثيق القياس والتعريف"),
  comparability: text("Quantity and scope comparability", "قابلية مقارنة الكمية والنطاق"),
  geographicSectorCoverage: text("Geographic and sector coverage", "التغطية الجغرافية والقطاعية"),
  temporalFreshness: text("Temporal alignment and freshness", "توافق الفترة وحداثة البيانات"),
  completeness: text("Completeness", "الاكتمال"),
  provenanceRights: text("Provenance and analysis rights", "سلسلة المصدر وحقوق التحليل"),
  ruleApplicability: text("Benchmark or rule applicability", "انطباق المعيار أو القاعدة"),
};
const caps = [
  { code: "OPPORTUNITY_PARTIAL", maxBand: "LOW", appliesWhen: text("Partial/unknown coverage or inventory; descriptive subset only.", "التغطية أو الحصر غير مكتمل؛ وصف للعينة فقط.") },
  { code: "OPPORTUNITY_STALE", maxBand: "LOW", appliesWhen: text("Stale or unknown freshness.", "البيانات قديمة أو حداثتها مجهولة.") },
  { code: "OPPORTUNITY_UNVERIFIED", maxBand: "LOW", appliesWhen: text("Unverified evidence, limited method or undeclared license.", "دليل غير متحقق أو منهج محدود أو ترخيص غير مصنف.") },
  { code: "OPPORTUNITY_QUALITY", maxBand: "MEDIUM", appliesWhen: text("Source quality is not measured.", "جودة المصدر غير مقاسة.") },
  { code: "OPPORTUNITY_WEAK_INPUT", maxBand: "LOW", appliesWhen: text("A required operand is LOW confidence.", "ثقة أحد المدخلات اللازمة منخفضة.") },
  { code: "OPPORTUNITY_MEDIUM_INPUT", maxBand: "MEDIUM", appliesWhen: text("A required operand is MEDIUM confidence.", "ثقة أحد المدخلات اللازمة متوسطة.") },
] as const;
export const opportunityConfidencePolicy: ConfidencePolicyDescriptor = {
  id: "opportunity-confidence-v1", version: "1.0.0", kind: "EXPLAINABLE_HEURISTIC", scale: "POINTS_100", isProbability: false,
  thresholds: { high: 80, medium: 60, low: 40 },
  factors: (Object.keys(weights) as Factor[]).map((key) => ({ key, maxPoints: weights[key], description: labels[key] })),
  caps: [...caps],
  methodology: text("Weakest required input per factor. Operand score ceilings proportionally bound each factor with integer floor; caps bound the final band. Invalid inputs cannot be repaired by points.",
    "يؤخذ أضعف مدخل لكل عامل؛ سقف ثقة المدخل يحد نقاط كل عامل تناسبيًا بالتقريب للأسفل، ثم تطبق حدود المستوى. النقاط لا تصلح المدخل غير الصالح."),
  disclaimer: text("Evidence quality only, not opportunity strength, investment advice or project success probability.",
    "جودة الدليل فقط، وليست قوة الفرصة أو توصية استثمارية أو احتمال نجاح المشروع."),
};
export const opportunityConfidenceBasisSchema = z.object({
  input: opportunityInputSchema,
  analysisUsage: z.enum(["ALLOWED", "DENIED", "NOT_VERIFIED"]),
  measurement: z.enum(["DOCUMENTED", "LIMITED", "UNSUPPORTED"]),
  comparability: z.enum(["EXACT", "INCOMPATIBLE", "UNKNOWN"]),
  coverage: z.enum(["COMPLETE", "PARTIAL", "NONE", "UNKNOWN"]),
  provenance: z.enum(["DOCUMENTED", "MISSING"]),
  applicability: z.enum(["DOCUMENTED", "NOT_APPLICABLE", "UNKNOWN"]),
  operandConfidence: confidenceBreakdownSchema.nullable(),
}).strict();
export type OpportunityConfidenceBasis = z.infer<typeof opportunityConfidenceBasisSchema>;
export function calculateOpportunityConfidence(raw: readonly OpportunityConfidenceBasis[], evaluatedAt: string) {
  timestamp.parse(evaluatedAt);
  const bases = z.array(opportunityConfidenceBasisSchema).min(1).max(32).parse(raw);
  if (new Set(bases.map(({ input }) => input.id)).size !== bases.length) throw new Error("Repeated confidence input identity");
  const invalid = bases.some(({ input, analysisUsage, measurement, comparability, coverage, provenance, applicability, operandConfidence }) =>
    analysisUsage !== "ALLOWED" || measurement === "UNSUPPORTED" || comparability !== "EXACT" || coverage === "NONE"
    || provenance !== "DOCUMENTED" || applicability !== "DOCUMENTED" || operandConfidence?.band === "INSUFFICIENT"
    || !input.license.trim() || !input.usagePolicy?.trim() || input.evidenceStatus === "ESTIMATED" || input.evidenceStatus === "CONFLICTED"
    || input.freshness.status === "EXPIRED" || input.freshness.sourcePublishedAt !== null && input.freshness.sourcePublishedAt > evaluatedAt
    || input.freshness.expiresAt !== null && input.freshness.expiresAt <= evaluatedAt
    || input.quality.status !== "UNAVAILABLE" && input.quality.measuredAt > evaluatedAt);
  if (invalid) return { kind: "NOT_SCORABLE" as const, confidence: null, reason: "Required evidence has invalid rights, provenance, measurement, comparability, applicability or validity" };
  const isFresh = (input: OpportunityConfidenceBasis["input"]) => input.freshness.status === "FRESH"
    && input.freshness.sourcePublishedAt !== null && input.freshness.freshnessDays !== null
    && Date.parse(evaluatedAt) - Date.parse(input.freshness.sourcePublishedAt) < input.freshness.freshnessDays * 86_400_000;
  const score = (basis: OpportunityConfidenceBasis, key: Factor) => {
    const { input } = basis;
    const points: Record<Factor, number> = {
      sourceQuality: input.quality.status === "MEASURED" ? Math.floor(15 * input.quality.score) : 0,
      measurementDefinition: basis.measurement === "DOCUMENTED" ? 15 : 5,
      comparability: 20,
      geographicSectorCoverage: basis.coverage === "COMPLETE" ? 15 : basis.coverage === "PARTIAL" ? 5 : 0,
      temporalFreshness: isFresh(input) ? 10 : input.freshness.status === "UNKNOWN" ? 0 : 3,
      completeness: input.completeness === "INVENTORY" ? 10 : input.completeness === "SAMPLE" ? 3 : 0,
      provenanceRights: input.licenseClass === null ? 5 : 10,
      ruleApplicability: 5,
    };
    return Math.min(points[key], Math.floor(weights[key] * (basis.operandConfidence?.score ?? 100) / 100));
  };
  const ordered = [...bases].sort((a, b) => compareText(a.input.id, b.input.id));
  const factors = (Object.keys(weights) as Factor[]).map((key) => {
    const weakest = [...ordered].sort((a, b) => score(a, key) - score(b, key) || compareText(a.input.id, b.input.id))[0]!;
    return { key, maxPoints: weights[key], points: score(weakest, key), inputId: weakest.input.id,
      explanation: text(`Weakest required ${labels[key].en}: ${score(weakest, key)}/${weights[key]} from ${weakest.input.id}, including any operand score ceiling.`,
        `أضعف مدخل لازم لعامل ${labels[key].ar}: ${score(weakest, key)}/${weights[key]} من ${weakest.input.id} مع سقف ثقة المدخل.`) };
  });
  const codes = new Set<string>();
  for (const basis of bases) {
    if (basis.coverage !== "COMPLETE" || basis.input.completeness !== "INVENTORY") codes.add("OPPORTUNITY_PARTIAL");
    if (!isFresh(basis.input)) codes.add("OPPORTUNITY_STALE");
    if (basis.input.evidenceStatus !== "VERIFIED" || basis.measurement !== "DOCUMENTED" || basis.input.licenseClass === null) codes.add("OPPORTUNITY_UNVERIFIED");
    if (basis.input.quality.status !== "MEASURED") codes.add("OPPORTUNITY_QUALITY");
    if (basis.operandConfidence?.band === "LOW") codes.add("OPPORTUNITY_WEAK_INPUT");
    if (basis.operandConfidence?.band === "MEDIUM") codes.add("OPPORTUNITY_MEDIUM_INPUT");
  }
  const applied: ConfidenceCapInput[] = caps.filter((cap) => codes.has(cap.code)).map((cap) => ({ code: cap.code, maxBand: cap.maxBand, reason: cap.appliesWhen }));
  return { kind: "SCORED" as const, confidence: buildConfidenceBreakdown(opportunityConfidencePolicy, factors, applied), reason: null };
}
