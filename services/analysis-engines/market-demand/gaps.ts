import { combineGapCatalogs, createGap, defineGapCatalog, sharedGapCatalog } from "../shared/gaps";

const own = defineGapCatalog({
  MARKET_NOT_AVAILABLE: {
    severity: "BLOCKING",
    message: { ar: "لا تتوفر مشاهدة سوق قابلة للاستخدام؛ القيمة غير معروفة.", en: "No usable market observation is available; the value is unknown." },
    remedy: { ar: "حدد إصدارًا محكومًا متاحًا وملائمًا للفترة والمؤشر.", en: "Select an accessible governed version matching the period and measure." },
  },
  MARKET_NO_COVERAGE: {
    severity: "BLOCKING",
    message: { ar: "المشاهدة لا تغطي المنطقة أو القطاع أو الفترة المطلوبة.", en: "The observation does not cover the requested geography, sector or period." },
    remedy: { ar: "استخدم مصدرًا بتغطية موثقة للنطاق والفترة.", en: "Use a source with documented scope and temporal coverage." },
  },
  MARKET_NOT_COMPARABLE: {
    severity: "BLOCKING",
    message: { ar: "الفترات أو الأبعاد أو طرق القياس غير قابلة للمقارنة.", en: "The periods, dimensions or measurement methods are not comparable." },
    remedy: { ar: "استخدم سلسلة متوافقة التعريف والوحدة والنطاق والمنهجية.", en: "Use a series with compatible definitions, units, scope and methodology." },
  },
  MARKET_INVALID_BASE: {
    severity: "BLOCKING",
    message: { ar: "قيمة الأساس صفر أو غير صالحة؛ لا تحسب النسبة أو المؤشر.", en: "The base is zero or invalid; the percentage or index is not computed." },
    remedy: { ar: "حدد فترة أساس موجبة وموثقة أو استخدم التغير المطلق.", en: "Select a documented positive base period or use absolute change." },
  },
  MARKET_INSUFFICIENT_EVIDENCE: {
    severity: "BLOCKING",
    message: { ar: "الدليل أو التغطية أو الثقة لا يدعم حسابًا صالحًا.", en: "The evidence, coverage or confidence does not support a valid calculation." },
    remedy: { ar: "استكمل الدليل والتغطية والمنهجية دون افتراض بيانات مفقودة.", en: "Supply evidence, coverage and methodology without inventing missing data." },
  },
  MARKET_LIMITED_EVIDENCE: {
    severity: "WARNING",
    message: { ar: "النتيجة محدودة بالتغطية أو جودة الدليل أو افتراضات معلنة.", en: "The result is limited by coverage, evidence quality or declared assumptions." },
    remedy: { ar: "اعرض القيود ولا تعمم النتيجة خارج نطاقها.", en: "Display the limitations and do not generalize beyond the stated scope." },
  },
  MARKET_DATASET_INVALID: {
    severity: "BLOCKING",
    message: { ar: "محتوى مجموعة السوق غير صالح لعقدها؛ لم تُصلح القيم تلقائيًا.", en: "Market dataset content violates its contract; values were not silently repaired." },
    remedy: { ar: "صحح المصدر عبر حوكمة مركز البيانات ثم حدد إصدارًا معتمدًا.", en: "Correct the source through Data Center governance and select an approved version." },
  },
  MARKET_SOURCE_TYPE_INVALID: {
    severity: "BLOCKING",
    message: { ar: "نوع المصدر أو دوره لا يطابق عقد السوق المطلوب.", en: "The source type or role does not match the requested Market contract." },
    remedy: { ar: "حدد مصدرًا يطابق النوع والدور صراحة.", en: "Select an explicitly matching source type and role." },
  },
  MARKET_SOURCE_INTEGRITY: {
    severity: "BLOCKING",
    message: { ar: "فشل تحقق سلامة إصدار المصدر أو تغيرت بياناته الوصفية أثناء القراءة.", en: "Source version integrity failed or metadata changed during the read." },
    remedy: { ar: "راجع الإصدار وصلاحياته وبصمته؛ لا يستخدم مصدر بديل تلقائيًا.", en: "Review the version, access and checksum; no alternate source is used automatically." },
  },
  MARKET_SOURCE_LIMIT: {
    severity: "BLOCKING",
    message: { ar: "تجاوزت المدخلات حد القراءة أو الصفوف المسموح.", en: "The inputs exceed the allowed discovery, read or row limit." },
    remedy: { ar: "ضيّق الطلب دون تجزئة مجموعة منطقية لإخفاء تجاوز الحد.", en: "Narrow the request without artificially splitting a logical dataset to hide excess." },
  },
});
export const marketGapCatalog = combineGapCatalogs(sharedGapCatalog, own);
export type MarketGapCode = keyof typeof own;
export const marketGap = (code: MarketGapCode, subject?: string) => createGap(marketGapCatalog, code, {}, subject ? { subject } : {});
