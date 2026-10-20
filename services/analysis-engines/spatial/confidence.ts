import { compareText, roundTo } from "../shared/canonical";
import { buildConfidenceBreakdown, type ConfidenceBreakdown, type ConfidenceCapInput, type ConfidenceFactorInput, type ConfidencePolicyDescriptor } from "../shared/confidence";
import type { EngineInput, ValueKind } from "../shared/contracts";
import { createGap, normalizeGaps, type Gap } from "../shared/gaps";
import type { Bilingual } from "../shared/primitives";
import type { MetricStatus } from "../shared/states";
import { spatialGapCatalog } from "./gaps";

/**
 * spatial-confidence-v1: an explainable heuristic quality indicator for the data a spatial measurement rests on.
 *
 * It is NOT a probability, a success rate or a forecast. It sums points granted by fixed, documented rules for six factors (100 in
 * all), maps the sum to a band with fixed thresholds, and lowers the band with fixed caps. Each factor takes the weakest of the datasets
 * the measurement depends on, so one poor dataset cannot be hidden by a good one. The result stores every factor, point and cap.
 * A measurement that cannot be supported at all (no coverage, expired data, invalid geometry, no dataset) is not scored: it has no value.
 */
export const SPATIAL_CONFIDENCE_POLICY_ID = "spatial-confidence-v1";
export const SPATIAL_CONFIDENCE_POLICY_VERSION = "1.0.0";
const THRESHOLDS = { high: 75, medium: 50, low: 25 } as const;
const MAX = { coverage: 25, freshness: 20, sourceQuality: 20, provenanceRights: 10, geometryFidelity: 15, completeness: 10 } as const;
type FactorKey = keyof typeof MAX;
const FACTOR_KEYS: readonly FactorKey[] = ["coverage", "freshness", "sourceQuality", "provenanceRights", "geometryFidelity", "completeness"];
const DAY_MS = 86_400_000;

export const spatialConfidencePolicy: ConfidencePolicyDescriptor = {
  id: SPATIAL_CONFIDENCE_POLICY_ID,
  version: SPATIAL_CONFIDENCE_POLICY_VERSION,
  kind: "EXPLAINABLE_HEURISTIC",
  scale: "POINTS_100",
  isProbability: false,
  thresholds: { ...THRESHOLDS },
  factors: [
    { key: "coverage", maxPoints: MAX.coverage, description: { ar: "مدى تغطية البيانات للموقع ولمنطقة التحليل.", en: "How far the data covers the location and the analysis area." } },
    { key: "freshness", maxPoints: MAX.freshness, description: { ar: "حداثة مصدر البيانات مقارنة بمدة الحداثة المعلنة له.", en: "How recent the data source is compared with its declared freshness period." } },
    { key: "sourceQuality", maxPoints: MAX.sourceQuality, description: { ar: "تقييم الجودة المسجّل للبيانات في مركز البيانات.", en: "The quality assessment recorded for the data in the Data Center." } },
    { key: "provenanceRights", maxPoints: MAX.provenanceRights, description: { ar: "وضوح المصدر والترخيص والإسناد، ونشر البيانات عبر مسار معتمد.", en: "Clarity of source, license and attribution, and publication through an approved path." } },
    { key: "geometryFidelity", maxPoints: MAX.geometryFidelity, description: { ar: "ملاءمة هندسة البيانات للقياس المطلوب ووضوح دقة مواضعها.", en: "How well the geometry of the data suits the requested measurement, and whether its positional accuracy is declared." } },
    { key: "completeness", maxPoints: MAX.completeness, description: { ar: "اكتمال البيانات، وتوفر بيانات لكل الأدوار المطلوبة.", en: "Completeness of the data, and the availability of data for every requested role." } },
  ],
  caps: [
    { code: "COUNT_IS_NOT_AN_INVENTORY", maxBand: "LOW", appliesWhen: { ar: "عدد أو كثافة مأخوذان من بيانات ليست جردًا كاملًا.", en: "A count or density taken from data that is not a complete inventory." } },
    { code: "MAP_LAYER_UNREGISTERED", maxBand: "MEDIUM", appliesWhen: { ar: "استخدام طبقة خريطة غير مسجّلة.", en: "An unregistered Map layer is used." } },
    { code: "QUALITY_NOT_MEASURED", maxBand: "MEDIUM", appliesWhen: { ar: "بيانات بلا تقييم جودة مقيس.", en: "Data without a measured quality assessment." } },
    { code: "ESTIMATED_VALUE", maxBand: "MEDIUM", appliesWhen: { ar: "قيمة تقديرية تعتمد على افتراض.", en: "An estimated value that relies on an assumption." } },
    { code: "FALLBACK_APPLIED", maxBand: "MEDIUM", appliesWhen: { ar: "طُبّقت طريقة بديلة عن الطريقة الأساسية.", en: "A fallback method replaced the primary method." } },
  ],
  methodology: {
    ar: "تُمنح نقاط لستة عوامل وفق قواعد ثابتة مجموعها 100، ويؤخذ في كل عامل أضعف مجموعة بيانات تعتمد عليها القيمة. تُحوَّل النقاط إلى مستوى بحدود ثابتة (مرتفع 75 فأكثر، متوسط 50، منخفض 25، وما دون ذلك غير كافٍ)، ثم تُخفِّض الحدود القصوى المستوى عند وجود قيود محددة. القيمة التي لا تسندها بيانات (لا تغطية، بيانات منتهية، هندسة غير صالحة، لا بيانات) لا تُقيَّم ولا تحمل قيمة.",
    en: "Points are granted for six factors by fixed rules that total 100, and each factor takes the weakest dataset the value depends on. The points are mapped to a band with fixed thresholds (high from 75, medium from 50, low from 25, otherwise insufficient), and fixed caps lower the band when specific limitations apply. A value that no data supports (no coverage, expired data, invalid geometry, no data) is not scored and carries no value.",
  },
  disclaimer: {
    ar: "هذا المؤشر يصف جودة البيانات التي يستند إليها القياس وفق قواعد موثقة. وهو ليس احتمالًا ولا نسبة نجاح ولا توقعًا ولا توصية.",
    en: "This indicator describes the quality of the data a measurement rests on, by documented rules. It is not a probability, a success rate, a forecast or a recommendation.",
  },
};

const capReason: Record<string, Bilingual> = {
  COUNT_IS_NOT_AN_INVENTORY: { ar: "العدد أو الكثافة مأخوذان من بيانات ليست جردًا كاملًا؛ لا يتجاوز مستوى الثقة «منخفض».", en: "The count or density comes from data that is not a complete inventory; confidence does not rise above low." },
  MAP_LAYER_UNREGISTERED: { ar: "طبقة الخريطة غير مسجّلة؛ لا يتجاوز مستوى الثقة «متوسط».", en: "The Map layer is not registered; confidence does not rise above medium." },
  QUALITY_NOT_MEASURED: { ar: "لا يوجد تقييم جودة مقيس لبعض البيانات؛ لا يتجاوز مستوى الثقة «متوسط».", en: "Some of the data has no measured quality assessment; confidence does not rise above medium." },
  ESTIMATED_VALUE: { ar: "القيمة تقديرية؛ لا يتجاوز مستوى الثقة «متوسط».", en: "The value is an estimate; confidence does not rise above medium." },
  FALLBACK_APPLIED: { ar: "طُبّقت طريقة بديلة؛ لا يتجاوز مستوى الثقة «متوسط».", en: "A fallback method was applied; confidence does not rise above medium." },
};

const text = {
  coverage: {
    FULL: { ar: "البيانات تغطي منطقة التحليل بالكامل.", en: "The data covers the whole analysis area." },
    PARTIAL: { ar: "البيانات تغطي جزءًا من منطقة التحليل؛ تُمنح النقاط بنسبة الجزء المغطى.", en: "The data covers part of the analysis area; points are granted in proportion to the covered part." },
    UNDECLARED: { ar: "لم تُعلن تغطية البيانات؛ لا تُمنح نقاط.", en: "The coverage of the data is not declared; no points are granted." },
  },
  freshness: {
    FRESH: { ar: "مصدر البيانات ضمن مدة الحداثة؛ تقل النقاط كلما قدم المصدر.", en: "The source is within its freshness period; points fall as the source ages." },
    STALE: { ar: "مصدر البيانات أقدم من مدة الحداثة؛ لا تُمنح نقاط.", en: "The source is older than its freshness period; no points are granted." },
    UNKNOWN: { ar: "تاريخ مصدر البيانات غير معروف؛ لا تُمنح نقاط.", en: "The source date is unknown; no points are granted." },
  },
  sourceQuality: {
    MEASURED: { ar: "تقييم الجودة المسجّل يمنح نقاطًا بنسبة درجته.", en: "The recorded quality assessment earns points in proportion to its score." },
    INSUFFICIENT_DATA: { ar: "لم تكف المعلومات لتقييم الجودة؛ لا تُمنح نقاط.", en: "There was not enough information to assess quality; no points are granted." },
    UNAVAILABLE: { ar: "لا يوجد تقييم جودة مسجّل؛ لا تُمنح نقاط.", en: "No quality assessment is recorded; no points are granted." },
  },
  provenanceRights: { ar: "نقاط للنشر عبر مسار معتمد، وللترخيص المسجّل، ولتصنيف الترخيص، وللإسناد.", en: "Points for publication through an approved path, a recorded license, a declared license class and an attribution statement." },
  fit: {
    EXACT: { ar: "هندسة البيانات تطابق القياس المطلوب.", en: "The geometry matches the requested measurement exactly." },
    SUITABLE: { ar: "هندسة البيانات تلائم القياس المطلوب.", en: "The geometry suits the requested measurement." },
    PROXY: { ar: "هندسة البيانات بديل تقريبي للقياس المطلوب (مثل نقاط تسمية بدل شبكة طرق).", en: "The geometry is only a proxy for the requested measurement (for example label points instead of a road network)." },
    UNSUITABLE: { ar: "هندسة البيانات لا تلائم القياس المطلوب.", en: "The geometry does not suit the requested measurement." },
  },
  accuracy: {
    DECLARED: { ar: "دقة المواضع معلنة.", en: "Positional accuracy is declared." },
    UNDECLARED: { ar: "دقة المواضع غير معلنة.", en: "Positional accuracy is not declared." },
  },
  completeness: {
    INVENTORY: { ar: "البيانات معلنة جردًا كاملًا.", en: "The data is declared a complete inventory." },
    SAMPLE: { ar: "البيانات عيّنة؛ تُمنح نقاط قليلة.", en: "The data is a sample; few points are granted." },
    UNKNOWN: { ar: "اكتمال البيانات غير معروف؛ تُمنح نقاط قليلة.", en: "The completeness of the data is unknown; few points are granted." },
    PARTIAL_ROLES: { ar: "البيانات متاحة لجزء فقط من الأدوار المطلوبة.", en: "Data is available for only part of the requested roles." },
  },
} satisfies Record<string, unknown>;
const join = (first: Bilingual, second: Bilingual): Bilingual => ({ ar: `${first.ar} ${second.ar}`, en: `${first.en} ${second.en}` });

export type CoverageAssessment = { status: "FULL" } | { status: "PARTIAL"; fraction: number } | { status: "UNDECLARED" } | { status: "NONE" };
export type GeometryFit = "EXACT" | "SUITABLE" | "PROXY" | "UNSUITABLE";
export interface SpatialConfidenceDataset {
  input: EngineInput;
  /** Judged by the engine against the target of this measurement; the policy only scores the judgement. */
  coverage: CoverageAssessment;
  geometry: { fit: GeometryFit; positionalAccuracy: "DECLARED" | "UNDECLARED"; valid: boolean };
}
export interface SpatialConfidenceContext {
  datasets: readonly SpatialConfidenceDataset[];
  requestedRoles: number;
  availableRoles: number;
  valueKind: ValueKind;
  estimated: boolean;
  fallbackApplied: boolean;
  evaluatedAt: string;
}
export type BlockCode = "NO_COVERAGE" | "DATA_EXPIRED" | "DATASET_GEOMETRY_INVALID" | "DATASET_NOT_AVAILABLE";
export interface ConfidenceBlock { code: BlockCode; inputId: string | null }
export type SpatialConfidenceOutcome =
  | { kind: "SCORED"; breakdown: ConfidenceBreakdown; gaps: Gap[] }
  | { kind: "NOT_SCORABLE"; blockedBy: ConfidenceBlock[] };

const FIT_POINTS: Record<GeometryFit, number> = { EXACT: 10, SUITABLE: 7, PROXY: 3, UNSUITABLE: 0 };
const ACCURACY_POINTS = { DECLARED: 5, UNDECLARED: 2 } as const;
const COMPLETENESS_MULTIPLIER = { INVENTORY: 1, SAMPLE: 0.2, UNKNOWN: 0.1 } as const;
const UNDECLARED_LICENSE_TEXTS = new Set(["", "unknown", "unspecified", "undeclared", "none", "n/a", "غير محدد", "غير معروف"]);
const isLicenseTextDeclared = (license: string) => !UNDECLARED_LICENSE_TEXTS.has(license.trim().toLowerCase());

function datasetPoints(dataset: SpatialConfidenceDataset, context: SpatialConfidenceContext): Record<FactorKey, number> {
  const { input } = dataset;
  const { coverage, geometry } = dataset;
  const freshness = input.freshness;
  let freshnessPoints = 0;
  if (freshness.status === "FRESH" && freshness.sourcePublishedAt !== null && freshness.freshnessDays !== null) {
    const age = (Date.parse(context.evaluatedAt) - Date.parse(freshness.sourcePublishedAt)) / DAY_MS;
    freshnessPoints = roundTo(MAX.freshness * (1 - Math.min(1, Math.max(0, age / freshness.freshnessDays))), 0);
  }
  const governed = input.governance !== "MAP_UNREGISTERED";
  const ratio = context.availableRoles / context.requestedRoles;
  return {
    coverage: coverage.status === "FULL" ? MAX.coverage : coverage.status === "PARTIAL" ? roundTo(MAX.coverage * coverage.fraction, 0) : 0,
    freshness: freshnessPoints,
    sourceQuality: input.quality.status === "MEASURED" ? roundTo(MAX.sourceQuality * input.quality.score, 0) : 0,
    provenanceRights: (governed ? 4 : 0) + (isLicenseTextDeclared(input.license) ? 2 : 0) + (input.licenseClass !== null ? 2 : 0) + (input.attribution.text !== null ? 2 : 0),
    geometryFidelity: FIT_POINTS[geometry.fit] + ACCURACY_POINTS[geometry.positionalAccuracy],
    completeness: roundTo(MAX.completeness * ratio * COMPLETENESS_MULTIPLIER[input.completeness], 0),
  };
}

function blocksOf(context: SpatialConfidenceContext): ConfidenceBlock[] {
  if (context.datasets.length === 0) return [{ code: "DATASET_NOT_AVAILABLE", inputId: null }];
  const blocks: ConfidenceBlock[] = [];
  for (const dataset of context.datasets) {
    if (dataset.coverage.status === "NONE") blocks.push({ code: "NO_COVERAGE", inputId: dataset.input.id });
    if (dataset.input.freshness.status === "EXPIRED") blocks.push({ code: "DATA_EXPIRED", inputId: dataset.input.id });
    if (!dataset.geometry.valid) blocks.push({ code: "DATASET_GEOMETRY_INVALID", inputId: dataset.input.id });
  }
  return blocks.sort((first, second) => compareText(first.code, second.code) || compareText(first.inputId ?? "", second.inputId ?? ""));
}

/** The status of a measurement that cannot be scored: unknown coverage first, then expired data, then unusable geometry, then no data. */
export function metricStatusForBlocks(blocks: readonly ConfidenceBlock[]): MetricStatus {
  const codes = new Set(blocks.map((block) => block.code));
  if (codes.has("NO_COVERAGE")) return "NO_COVERAGE";
  if (codes.has("DATASET_GEOMETRY_INVALID")) return "NOT_COMPUTABLE";
  return "NOT_AVAILABLE";
}

function assertContext(context: SpatialConfidenceContext) {
  if (!Number.isInteger(context.requestedRoles) || context.requestedRoles < 1) throw new RangeError("requestedRoles must be a whole number of at least 1");
  if (!Number.isInteger(context.availableRoles) || context.availableRoles < 0 || context.availableRoles > context.requestedRoles) throw new RangeError("availableRoles must be a whole number from 0 to requestedRoles");
  if (Number.isNaN(Date.parse(context.evaluatedAt))) throw new RangeError("evaluatedAt must be a valid instant");
  for (const dataset of context.datasets) {
    if (dataset.coverage.status === "PARTIAL" && !(dataset.coverage.fraction > 0 && dataset.coverage.fraction < 1)) throw new RangeError("A partial coverage fraction is above 0 and below 1; use NONE or FULL at the ends");
  }
}

export function scoreSpatialConfidence(context: SpatialConfidenceContext): SpatialConfidenceOutcome {
  assertContext(context);
  const blockedBy = blocksOf(context);
  if (blockedBy.length > 0) return { kind: "NOT_SCORABLE", blockedBy };

  const rows = context.datasets.map((dataset) => ({ dataset, points: datasetPoints(dataset, context) }));
  const factors: ConfidenceFactorInput[] = FACTOR_KEYS.map((key) => {
    // The weakest dataset decides; equal points are broken by input id so the result never depends on the order of the datasets.
    const weakest = rows.reduce((best, row) => (row.points[key] < best.points[key] || (row.points[key] === best.points[key] && compareText(row.dataset.input.id, best.dataset.input.id) < 0) ? row : best));
    return { key, maxPoints: MAX[key], points: weakest.points[key], inputId: weakest.dataset.input.id, explanation: explain(key, weakest.dataset, context) };
  });

  const countLike = context.valueKind === "COUNT" || context.valueKind === "DENSITY";
  const nonInventory = context.datasets.filter((dataset) => dataset.input.completeness !== "INVENTORY");
  const caps: ConfidenceCapInput[] = [];
  const cap = (code: string, maxBand: "LOW" | "MEDIUM") => caps.push({ code, maxBand, reason: capReason[code] as Bilingual });
  if (countLike && nonInventory.length > 0) cap("COUNT_IS_NOT_AN_INVENTORY", "LOW");
  if (context.datasets.some((dataset) => dataset.input.governance === "MAP_UNREGISTERED")) cap("MAP_LAYER_UNREGISTERED", "MEDIUM");
  if (context.datasets.some((dataset) => dataset.input.quality.status !== "MEASURED")) cap("QUALITY_NOT_MEASURED", "MEDIUM");
  if (context.estimated) cap("ESTIMATED_VALUE", "MEDIUM");
  if (context.fallbackApplied) cap("FALLBACK_APPLIED", "MEDIUM");

  const gaps: Gap[] = [];
  for (const dataset of context.datasets) {
    const parameters = { dataset: dataset.input.ref.label };
    if (dataset.coverage.status === "PARTIAL") gaps.push(createGap(spatialGapCatalog, "COVERAGE_PARTIAL", parameters, { inputId: dataset.input.id }));
    if (countLike && dataset.input.completeness !== "INVENTORY") gaps.push(createGap(spatialGapCatalog, "COUNT_IS_NOT_AN_INVENTORY", {}, { inputId: dataset.input.id }));
  }
  const breakdown = buildConfidenceBreakdown({ id: SPATIAL_CONFIDENCE_POLICY_ID, version: SPATIAL_CONFIDENCE_POLICY_VERSION, thresholds: THRESHOLDS }, factors, caps);
  return { kind: "SCORED", breakdown, gaps: normalizeGaps(gaps) };
}

function explain(key: FactorKey, dataset: SpatialConfidenceDataset, context: SpatialConfidenceContext): Bilingual {
  switch (key) {
    case "coverage": return text.coverage[dataset.coverage.status === "NONE" ? "UNDECLARED" : dataset.coverage.status];
    case "freshness": return text.freshness[dataset.input.freshness.status === "FRESH" || dataset.input.freshness.status === "STALE" ? dataset.input.freshness.status : "UNKNOWN"];
    case "sourceQuality": return text.sourceQuality[dataset.input.quality.status];
    case "provenanceRights": return text.provenanceRights;
    case "geometryFidelity": return join(text.fit[dataset.geometry.fit], text.accuracy[dataset.geometry.positionalAccuracy]);
    case "completeness": return context.availableRoles < context.requestedRoles ? join(text.completeness[dataset.input.completeness], text.completeness.PARTIAL_ROLES) : text.completeness[dataset.input.completeness];
  }
}
