import { z } from "zod";
import { compareText } from "./canonical";
import { bilingualSchema, codeSchema, identifierSchema, type Bilingual } from "./primitives";

/**
 * A gap is a documented reason why a measurement is missing, partial or limited. Engines report gaps instead of inventing
 * values: nothing is ever replaced by zero or by a guess.
 *  - BLOCKING: the affected measurement could not be produced (or the dataset could not be used);
 *  - WARNING: a value was produced, but it is limited and must be presented with the limitation;
 *  - INFO: a fact the consumer must know that does not reduce what was produced.
 */
export const gapSeverities = ["BLOCKING", "WARNING", "INFO"] as const;
export type GapSeverity = typeof gapSeverities[number];
const severityRank: Record<GapSeverity, number> = { BLOCKING: 0, WARNING: 1, INFO: 2 };

export const gapSchema = z.object({
  code: codeSchema,
  severity: z.enum(gapSeverities),
  inputId: identifierSchema.optional(),
  subject: z.string().min(1).max(160).optional(),
  message: bilingualSchema,
  remedy: bilingualSchema,
}).strict();
export type Gap = z.infer<typeof gapSchema>;

export interface GapDefinition { readonly severity: GapSeverity; readonly message: Bilingual; readonly remedy: Bilingual }
export type GapCatalog<Code extends string = string> = Readonly<Record<Code, GapDefinition>>;
export interface GapReference { inputId?: string; subject?: string }
type GapParameters = Readonly<Record<string, string | number>>;

const placeholder = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
export function placeholdersOf(template: string): string[] {
  return [...new Set([...template.matchAll(placeholder)].map((match) => match[1] as string))].sort(compareText);
}

/** Renders one gap from its catalog entry. A missing parameter is a programming error and throws instead of printing a hole. */
export function createGap<Code extends string>(catalog: GapCatalog<Code>, code: Code, parameters: GapParameters = {}, reference: GapReference = {}): Gap {
  const definition = Object.prototype.hasOwnProperty.call(catalog, code) ? catalog[code] : undefined;
  if (!definition) throw new Error(`Unknown gap code ${code}`);
  const render = (template: string) => template.replace(placeholder, (_, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(parameters, name)) throw new Error(`Gap ${code} needs the parameter "${name}"`);
    const value = parameters[name] as string | number;
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Gap ${code} parameter "${name}" is not finite`);
    return String(value);
  });
  return {
    code, severity: definition.severity,
    ...(reference.inputId === undefined ? {} : { inputId: reference.inputId }),
    ...(reference.subject === undefined ? {} : { subject: reference.subject }),
    message: { ar: render(definition.message.ar), en: render(definition.message.en) },
    remedy: { ar: render(definition.remedy.ar), en: render(definition.remedy.en) },
  };
}

function compareGaps(first: Gap, second: Gap) {
  return severityRank[first.severity] - severityRank[second.severity]
    || compareText(first.code, second.code)
    || compareText(first.inputId ?? "", second.inputId ?? "")
    || compareText(first.subject ?? "", second.subject ?? "")
    || compareText(first.message.en, second.message.en);
}
const gapKey = (gap: Gap) => [gap.code, gap.inputId ?? "", gap.subject ?? "", gap.message.en].join("\u0000");

/** Removes duplicates and orders gaps by severity, code, input, subject: the same gaps always serialize the same way. */
export function normalizeGaps(gaps: readonly Gap[]): Gap[] {
  const unique = new Map<string, Gap>();
  for (const gap of gaps) if (!unique.has(gapKey(gap))) unique.set(gapKey(gap), gap);
  return [...unique.values()].sort(compareGaps);
}
export function isNormalizedGapList(gaps: readonly Gap[]): boolean {
  const normalized = normalizeGaps(gaps);
  return normalized.length === gaps.length && normalized.every((gap, index) => gapKey(gap) === gapKey(gaps[index] as Gap));
}
export function summarizeGaps(gaps: readonly Pick<Gap, "severity">[]): Record<GapSeverity, number> {
  const summary: Record<GapSeverity, number> = { BLOCKING: 0, WARNING: 0, INFO: 0 };
  for (const gap of gaps) summary[gap.severity] += 1;
  return summary;
}
export function hasGap(gaps: readonly Pick<Gap, "code" | "inputId">[], code: string, inputId?: string): boolean {
  return gaps.some((gap) => gap.code === code && (inputId === undefined || gap.inputId === inputId));
}

/** Combines the shared catalog with an engine's own; a code defined twice is a defect, not an override. */
export function combineGapCatalogs<A extends GapCatalog, B extends GapCatalog>(shared: A, own: B): Readonly<A & B> {
  const combined: Record<string, GapDefinition> = {};
  for (const catalog of [shared, own]) {
    for (const [code, definition] of Object.entries(catalog)) {
      if (Object.prototype.hasOwnProperty.call(combined, code)) throw new Error(`Gap code ${code} is defined twice`);
      combined[code] = definition;
    }
  }
  return Object.freeze(combined) as Readonly<A & B>;
}

/** Structural problems of a catalog (used by tests and by the startup self-check of an engine). */
export function catalogProblems(catalog: GapCatalog): string[] {
  const problems: string[] = [];
  for (const [code, definition] of Object.entries(catalog)) {
    if (!codeSchema.safeParse(code).success) problems.push(`${code}: invalid code`);
    if (!(gapSeverities as readonly string[]).includes(definition.severity)) problems.push(`${code}: invalid severity`);
    for (const field of ["message", "remedy"] as const) {
      if (!bilingualSchema.safeParse(definition[field]).success) problems.push(`${code}: ${field} must have ar and en text`);
      else if (placeholdersOf(definition[field].ar).join() !== placeholdersOf(definition[field].en).join()) problems.push(`${code}: ${field} placeholders differ between ar and en`);
    }
  }
  return problems;
}

/** Defines a frozen catalog while keeping the literal severities and codes, so a code that does not exist cannot be requested. */
export const defineGapCatalog = <T extends Record<string, GapDefinition>>(entries: T) => Object.freeze(entries);
const catalogOf = defineGapCatalog;

/** Gaps every engine can report. Engine-specific gaps live next to the engine and are combined with these. */
export const sharedGapCatalog = catalogOf({
  DATASET_NOT_AVAILABLE: {
    severity: "BLOCKING",
    message: { ar: "لا تتوفر بيانات متاحة للدور «{role}»؛ لذلك لا يمكن حساب المقاييس التي تعتمد عليه.", en: "No accessible data is available for role “{role}”, so the metrics that depend on it cannot be computed." },
    remedy: { ar: "انشر مجموعة بيانات لهذا الدور في مركز البيانات أو سجّل طبقة له في الخريطة.", en: "Publish a dataset for this role in the Data Center or register a Map layer for it." },
  },
  NO_COVERAGE: {
    severity: "BLOCKING",
    message: { ar: "الموقع المطلوب خارج التغطية المعلنة للبيانات «{dataset}»؛ القيمة غير معروفة وليست صفرًا.", en: "The requested location is outside the declared coverage of “{dataset}”; the value is unknown, not zero." },
    remedy: { ar: "استخدم بيانات تغطي الموقع، أو صحّح التغطية المعلنة لإصدار البيانات إن كانت غير دقيقة.", en: "Use data that covers the location, or correct the coverage declared on the data version if it is inaccurate." },
  },
  COVERAGE_UNDECLARED: {
    severity: "WARNING",
    message: { ar: "لا توجد تغطية جغرافية معلنة للبيانات «{dataset}»؛ لا يمكن التحقق من أن الموقع داخل نطاقها.", en: "No geographic coverage is declared for “{dataset}”; it cannot be verified that the location lies inside its extent." },
    remedy: { ar: "أعلن الدول أو المناطق أو الصندوق الجغرافي في إصدار البيانات.", en: "Declare the countries, regions or bounding box on the data version." },
  },
  COVERAGE_PARTIAL: {
    severity: "WARNING",
    message: { ar: "تغطي البيانات «{dataset}» جزءًا فقط من منطقة التحليل؛ القياسات تخص الجزء المغطى.", en: "“{dataset}” covers only part of the analysis area; the measurements describe the covered part." },
    remedy: { ar: "أضف بيانات تغطي بقية المنطقة.", en: "Add data that covers the rest of the area." },
  },
  DATA_EXPIRED: {
    severity: "BLOCKING",
    message: { ar: "انتهت صلاحية البيانات «{dataset}»؛ لم تُستخدم في الحساب.", en: "“{dataset}” has expired and was not used in the computation." },
    remedy: { ar: "انشر إصدارًا محدّثًا من البيانات أو حدّد تاريخ سريان جديدًا.", en: "Publish an updated version of the data or set a new validity date." },
  },
  DATA_STALE: {
    severity: "WARNING",
    message: { ar: "البيانات «{dataset}» أقدم من مدة الحداثة المعلنة لمصدرها.", en: "“{dataset}” is older than the freshness period declared for its source." },
    remedy: { ar: "حدّث البيانات من مصدرها.", en: "Refresh the data from its source." },
  },
  FRESHNESS_UNKNOWN: {
    severity: "WARNING",
    message: { ar: "تاريخ نشر مصدر البيانات «{dataset}» غير معروف؛ لا يمكن تقدير حداثتها.", en: "The publication date of the source of “{dataset}” is unknown; its freshness cannot be estimated." },
    remedy: { ar: "سجّل تاريخ نشر المصدر في إصدار البيانات.", en: "Record the source publication date on the data version." },
  },
  QUALITY_UNAVAILABLE: {
    severity: "INFO",
    message: { ar: "لا يوجد تقييم جودة مسجّل للبيانات «{dataset}»؛ لم تُحتسب الجودة.", en: "No quality assessment is recorded for “{dataset}”; quality was not scored." },
    remedy: { ar: "سجّل تقييم جودة بمنهجه وتاريخه في مركز البيانات.", en: "Record a quality assessment with its method and date in the Data Center." },
  },
  QUALITY_INSUFFICIENT_DATA: {
    severity: "INFO",
    message: { ar: "لا تكفي المعلومات لتقييم جودة البيانات «{dataset}»؛ لم تُحتسب الجودة.", en: "There is not enough information to assess the quality of “{dataset}”; quality was not scored." },
    remedy: { ar: "أضف القياسات اللازمة ثم أعد تقييم الجودة.", en: "Add the missing measurements and assess the quality again." },
  },
  COMPLETENESS_SAMPLE: {
    severity: "WARNING",
    message: { ar: "البيانات «{dataset}» عيّنة وليست جردًا كاملًا للعناصر.", en: "“{dataset}” is a sample, not a complete inventory of the features." },
    remedy: { ar: "للحصول على أعداد كاملة، استخدم بيانات معلنة الاكتمال.", en: "For complete counts, use data whose completeness is declared." },
  },
  COMPLETENESS_UNKNOWN: {
    severity: "WARNING",
    message: { ar: "اكتمال البيانات «{dataset}» غير معروف؛ لا تُعامل كجرد كامل.", en: "The completeness of “{dataset}” is unknown; it is not treated as a complete inventory." },
    remedy: { ar: "أعلن اكتمال البيانات في إصدار البيانات.", en: "Declare the completeness of the data on the data version." },
  },
  COUNT_IS_NOT_AN_INVENTORY: {
    severity: "WARNING",
    message: { ar: "العدد يخص العناصر الموجودة في البيانات المتاحة فقط، وليس جردًا كاملًا للسوق، ولا يدل غياب عنصر عن عدم وجوده.", en: "The count covers only the features present in the available data; it is not a complete inventory of the market, and the absence of a feature does not prove it does not exist." },
    remedy: { ar: "اعرض العدد مع البيانات التي اشتُق منها، لا بوصفه حجمًا للسوق.", en: "Present the count together with the data it comes from, not as the size of the market." },
  },
  LICENSE_CLASS_UNDECLARED: {
    severity: "WARNING",
    message: { ar: "لم يُحدَّد تصنيف الترخيص للبيانات «{dataset}»؛ لا يُسمح بتصدير النتيجة حتى يُحدَّد.", en: "No license class is declared for “{dataset}”; the result cannot be exported until it is declared." },
    remedy: { ar: "حدّد تصنيف الترخيص في مصدر البيانات.", en: "Declare the license class on the data source." },
  },
  LICENSE_CLASS_RESTRICTED: {
    severity: "WARNING",
    message: { ar: "البيانات «{dataset}» مقيّدة الاستخدام؛ لا يُسمح بتصدير النتيجة.", en: "“{dataset}” is restricted; the result cannot be exported." },
    remedy: { ar: "استخدم بيانات ذات ترخيص يسمح بالتصدير.", en: "Use data whose license allows export." },
  },
  EXPORT_NOT_PERMITTED: {
    severity: "WARNING",
    message: { ar: "مصدر البيانات «{dataset}» لا يسمح بالتصدير؛ لا يجوز تصدير النتيجة.", en: "The source of “{dataset}” does not allow export; the result cannot be exported." },
    remedy: { ar: "اطلب من مالك المصدر السماح بالتصدير أو استخدم مصدرًا آخر.", en: "Ask the source owner to allow export, or use another source." },
  },
  ATTRIBUTION_REQUIRED: {
    severity: "INFO",
    message: { ar: "البيانات «{dataset}» تشترط الإسناد؛ يجب عرض نص الإسناد المرفق مع النتيجة.", en: "“{dataset}” requires attribution; the attribution text included with the result must be shown with it." },
    remedy: { ar: "اعرض نص الإسناد كما ورد في النتيجة.", en: "Show the attribution text exactly as given in the result." },
  },
  FALLBACK_APPLIED: {
    severity: "WARNING",
    message: { ar: "طُبّقت طريقة بديلة ({from} ← {to}) لتعذّر الطريقة الأساسية.", en: "A fallback method was applied ({from} → {to}) because the primary method was not possible." },
    remedy: { ar: "راجع سبب تعذّر الطريقة الأساسية في بيانات التشغيل.", en: "Review why the primary method was not possible in the run data." },
  },
  ESTIMATE_ASSUMPTION: {
    severity: "WARNING",
    message: { ar: "القيمة تقديرية وتعتمد على الافتراض «{assumption}».", en: "The value is an estimate that relies on the assumption “{assumption}”." },
    remedy: { ar: "استبدل الافتراض ببيانات مقيسة عند توفرها.", en: "Replace the assumption with measured data when it becomes available." },
  },
  RESULT_TRUNCATED: {
    severity: "WARNING",
    message: { ar: "اقتُطعت النتيجة عند الحد الأقصى المسموح ({limit}).", en: "The result was truncated at the maximum allowed ({limit})." },
    remedy: { ar: "ضيّق نطاق الطلب بتقليل الأدوار أو أنصاف الأقطار.", en: "Narrow the request with fewer roles or radii." },
  },
  BACKEND_UNAVAILABLE: {
    severity: "BLOCKING",
    message: { ar: "تعذّر استخدام وسيلة الحساب «{backend}»؛ لا يمكن حساب المقاييس التي تعتمد عليها.", en: "The computation backend “{backend}” is not available, so the metrics that depend on it cannot be computed." },
    remedy: { ar: "تحقق من اتصال قاعدة البيانات المكانية ومن توفر الإمكانات المطلوبة.", en: "Check the spatial database connection and that the required capabilities are installed." },
  },
  MAP_LAYER_UNREGISTERED: {
    severity: "WARNING",
    message: { ar: "الطبقة «{dataset}» غير مسجّلة في الخريطة؛ استُخدمت لأغراض التطوير والاختبار فقط ولا يجوز اعتمادها مصدرًا للإنتاج.", en: "The layer “{dataset}” is not registered in the Map; it was used for development and testing only and must not be relied on in production." },
    remedy: { ar: "سجّل الطبقة في الخريطة عبر مسار النشر المعتمد.", en: "Register the layer in the Map through the approved publication path." },
  },
  UNREGISTERED_LAYERS_EXCLUDED: {
    severity: "INFO",
    message: { ar: "استُبعدت طبقات الخريطة غير المسجّلة من الحساب وفق سياسة بيئة الإنتاج.", en: "Unregistered Map layers were excluded from the computation under the production policy." },
    remedy: { ar: "سجّل الطبقات المطلوبة في الخريطة لتدخل في الحساب.", en: "Register the required layers in the Map so that they take part in the computation." },
  },
});
export type SharedGapCode = keyof typeof sharedGapCatalog;
