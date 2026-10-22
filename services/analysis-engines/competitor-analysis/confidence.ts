import { z } from "zod";
import { compareText } from "../shared/canonical";
import { buildConfidenceBreakdown, confidenceBreakdownSchema, findBreakdownPolicyViolations, type ConfidenceCapInput, type ConfidencePolicyDescriptor } from "../shared/confidence";
import { engineInputSchema } from "../shared/contracts";
import { bandRank } from "../shared/states";
import { competitorTimestampSchema, hasCanonicalInputDates } from "./model";

const weights = { sourceQuality: 15, identityCertainty: 15, activityMatch: 15, geographicCoverage: 10, freshness: 10, completeness: 15, measurementMethod: 10, rightsProvenance: 10 } as const;
type Factor = keyof typeof weights;
const text = (en: string, ar: string) => ({ ar, en });
const descriptions: Record<Factor, ReturnType<typeof text>> = {
  sourceQuality: text("Source quality", "جودة المصدر"),
  identityCertainty: text("Identity certainty", "وثوق الهوية"),
  activityMatch: text("Category/activity match", "مطابقة التصنيف والنشاط"),
  geographicCoverage: text("Geographic coverage", "التغطية الجغرافية"),
  freshness: text("Freshness", "حداثة المصدر"),
  completeness: text("Completeness", "اكتمال الحصر"),
  measurementMethod: text("Measurement method", "منهجية القياس"),
  rightsProvenance: text("Rights and provenance", "الحقوق وسلسلة المصدر"),
};
const caps = [
  { code: "COMPETITOR_PARTIAL", maxBand: "LOW", appliesWhen: text("Partial or unknown scope/inventory; subset evidence only.", "النطاق أو الحصر جزئي أو مجهول؛ الدليل يصف عينة فقط.") },
  { code: "COMPETITOR_UNCERTAIN", maxBand: "LOW", appliesWhen: text("Unresolved identity or uncertain matching.", "الهوية أو المطابقة غير محسومة.") },
  { code: "COMPETITOR_STALE", maxBand: "LOW", appliesWhen: text("Stale or unknown freshness.", "حداثة المصدر قديمة أو غير معروفة.") },
  { code: "COMPETITOR_UNVERIFIED", maxBand: "LOW", appliesWhen: text("Unverified evidence or undeclared license class.", "الدليل غير متحقق أو فئة الترخيص غير معلنة.") },
  { code: "COMPETITOR_QUALITY", maxBand: "MEDIUM", appliesWhen: text("Source quality is not measured.", "جودة المصدر غير مقاسة.") },
  { code: "COMPETITOR_WEAK_INPUT", maxBand: "LOW", appliesWhen: text("A required operand has LOW confidence.", "ثقة أحد المدخلات اللازمة منخفضة.") },
  { code: "COMPETITOR_MEDIUM_INPUT", maxBand: "MEDIUM", appliesWhen: text("A required operand has MEDIUM confidence.", "ثقة أحد المدخلات اللازمة متوسطة.") },
] as const;
export const competitorConfidencePolicy: ConfidencePolicyDescriptor = {
  id: "competitor-confidence-v1", version: "1.0.0", kind: "EXPLAINABLE_HEURISTIC", scale: "POINTS_100", isProbability: false,
  thresholds: { high: 80, medium: 60, low: 35 },
  factors: (Object.keys(weights) as Factor[]).map((key) => ({ key, maxPoints: weights[key], description: descriptions[key] })),
  caps: [...caps], methodology: text("Weakest required evidence per factor, then explicit caps; missing validity is not repaired by points.", "يؤخذ أضعف مدخل لازم لكل عامل ثم تطبق الحدود؛ النقاط لا تعوض غياب صلاحية الدليل."),
  disclaimer: text("Competitive evidence quality only; not competitor strength, project success or an investment recommendation.", "جودة دليل تحليل المنافسين فقط، وليست قوة المنافس أو احتمال نجاح المشروع أو توصية استثمارية."),
};
export const competitorConfidenceBasisSchema = z.object({
  input: engineInputSchema.refine(hasCanonicalInputDates, "Source metadata must use canonical UTC millisecond timestamps"),
  analysisUsage: z.enum(["ALLOWED", "DENIED", "NOT_VERIFIED"]),
  identity: z.enum(["RESOLVED", "SEPARATE_UNVERIFIED", "AMBIGUOUS", "CONFLICTED"]),
  match: z.enum(["SUPPORTED", "AMBIGUOUS", "INSUFFICIENT"]),
  coverage: z.enum(["COMPLETE", "PARTIAL", "NONE", "UNKNOWN"]),
  method: z.enum(["DOCUMENTED", "LIMITED", "UNSUPPORTED"]),
  provenance: z.enum(["DOCUMENTED", "MISSING"]),
  upstreamConfidence: confidenceBreakdownSchema.nullable(),
}).strict();
export type CompetitorConfidenceBasis = z.infer<typeof competitorConfidenceBasisSchema>;
export function calculateCompetitorConfidence(raw: readonly CompetitorConfidenceBasis[], evaluatedAt: string) {
  competitorTimestampSchema.parse(evaluatedAt);
  const bases = z.array(competitorConfidenceBasisSchema).min(1).max(32).parse(raw);
  if (new Set(bases.map((basis) => basis.input.id)).size !== bases.length) throw new Error("Repeated confidence basis for one input");
  const invalid = bases.find(({ input, analysisUsage, coverage, method, provenance, upstreamConfidence }) => analysisUsage !== "ALLOWED" || input.kind !== "DATA_CENTER_VERSION" || input.governance !== "DC_PUBLISHED" || !input.checksum
    || input.freshness.status === "EXPIRED" || input.freshness.sourcePublishedAt !== null && input.freshness.sourcePublishedAt > evaluatedAt
    || input.freshness.expiresAt !== null && input.freshness.expiresAt <= evaluatedAt || input.evidenceStatus === "CONFLICTED" || input.evidenceStatus === "ESTIMATED"
    || coverage === "NONE" || method === "UNSUPPORTED" || provenance === "MISSING"
    || !input.license.trim() || !input.usagePolicy?.trim() || input.attribution.required && !input.attribution.text
    || upstreamConfidence?.band === "INSUFFICIENT");
  if (invalid) return { kind: "NOT_SCORABLE" as const, confidence: null, reason: "Required evidence lacks current validity, scope, method, provenance or rights" };
  if (bases.some((basis) => basis.upstreamConfidence && findBreakdownPolicyViolations(basis.upstreamConfidence, competitorConfidencePolicy).length)) return { kind: "NOT_SCORABLE" as const, confidence: null, reason: "Required operand confidence does not belong to the independent Competitor policy" };
  const freshAt = (input: CompetitorConfidenceBasis["input"]) => input.freshness.status === "FRESH"
    && input.freshness.sourcePublishedAt !== null && input.freshness.freshnessDays !== null
    && Date.parse(evaluatedAt) - Date.parse(input.freshness.sourcePublishedAt) < input.freshness.freshnessDays * 86_400_000;
  const pointsFor = ({ input, identity, match, coverage, method }: CompetitorConfidenceBasis): Record<Factor, number> => ({
    sourceQuality: input.quality.status === "MEASURED" && input.quality.measuredAt <= evaluatedAt ? Math.floor(input.quality.score * 15) : 0,
    identityCertainty: identity === "RESOLVED" ? 15 : identity === "SEPARATE_UNVERIFIED" ? 5 : 0,
    activityMatch: match === "SUPPORTED" ? 15 : match === "AMBIGUOUS" ? 5 : 0,
    geographicCoverage: coverage === "COMPLETE" ? 10 : coverage === "PARTIAL" ? 5 : 0,
    freshness: freshAt(input) ? 10 : input.freshness.status !== "UNKNOWN" ? 3 : 0,
    completeness: input.completeness === "INVENTORY" ? 15 : input.completeness === "SAMPLE" ? 5 : 0,
    measurementMethod: method === "DOCUMENTED" ? 10 : 5,
    rightsProvenance: input.licenseClass === null ? 5 : 10,
  });
  const ordered = [...bases].sort((a, b) => compareText(a.input.id, b.input.id));
  const factors = (Object.keys(weights) as Factor[]).map((key) => {
    const points = (basis: CompetitorConfidenceBasis) => Math.min(pointsFor(basis)[key], basis.upstreamConfidence?.factors.find((factor) => factor.key === key)?.points ?? weights[key]);
    const weakest = [...ordered].sort((a, b) => points(a) - points(b) || compareText(a.input.id, b.input.id))[0]!;
    return { key, maxPoints: weights[key], points: points(weakest), inputId: weakest.input.id,
      explanation: text(`Weakest required ${descriptions[key].en}: ${points(weakest)}/${weights[key]} from ${weakest.input.id}`,
        `أضعف مدخل لازم لعامل ${descriptions[key].ar}: ${points(weakest)}/${weights[key]} من ${weakest.input.id}`) };
  });
  const codes = new Set<string>();
  for (const basis of bases) {
    if (basis.coverage !== "COMPLETE" || basis.input.completeness !== "INVENTORY") codes.add("COMPETITOR_PARTIAL");
    if (basis.identity !== "RESOLVED" || basis.match !== "SUPPORTED") codes.add("COMPETITOR_UNCERTAIN");
    if (!freshAt(basis.input)) codes.add("COMPETITOR_STALE");
    if (basis.input.evidenceStatus !== "VERIFIED" || basis.input.licenseClass === null) codes.add("COMPETITOR_UNVERIFIED");
    if (basis.input.quality.status !== "MEASURED" || basis.input.quality.measuredAt > evaluatedAt) codes.add("COMPETITOR_QUALITY");
    if (basis.upstreamConfidence?.band === "LOW") codes.add("COMPETITOR_WEAK_INPUT");
    if (basis.upstreamConfidence?.band === "MEDIUM") codes.add("COMPETITOR_MEDIUM_INPUT");
  }
  const selected: ConfidenceCapInput[] = caps.filter((cap) => codes.has(cap.code)).map((cap) => ({ code: cap.code, maxBand: cap.maxBand, reason: cap.appliesWhen }));
  const confidence = buildConfidenceBreakdown(competitorConfidencePolicy, factors, selected);
  if (bases.some((basis) => basis.upstreamConfidence && bandRank(confidence.band) > bandRank(basis.upstreamConfidence.band))) throw new Error("Confidence exceeds its weakest required operand");
  return { kind: "SCORED" as const, confidence: confidenceBreakdownSchema.parse(confidence), reason: null };
}
