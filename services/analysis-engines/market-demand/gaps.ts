import { combineGapCatalogs, createGap, defineGapCatalog, sharedGapCatalog } from "../shared/gaps";

const own = defineGapCatalog({
  MARKET_NOT_AVAILABLE: {
    severity: "BLOCKING",
    message: { ar: "لا تتوفر مشاهدة سوق قابلة للاستخدام؛ القيمة غير معروفة.", en: "No usable market observation is available; the value is unknown." },
    remedy: { ar: "حدد إصدارًا محكومًا متاحًا وملائمًا للفترة والمؤشر.", en: "Select an accessible governed version matching the period and measure." },
  },
  MARKET_NO_COVERAGE: {
    severity: "BLOCKING",
    message: { ar: "المشاهدة لا تغطي المنطقة المطلوبة.", en: "The observation does not cover the requested area." },
    remedy: { ar: "استخدم مصدرًا بتغطية موثقة للمنطقة.", en: "Use a source with documented coverage of the area." },
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
});
export const marketGapCatalog = combineGapCatalogs(sharedGapCatalog, own);
export type MarketGapCode = keyof typeof own;
export const marketGap = (code: MarketGapCode, subject?: string) => createGap(marketGapCatalog, code, {}, subject ? { subject } : {});
