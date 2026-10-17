export const DATA_CENTER_SECTIONS = [
  { key: "overview", title: "نظرة عامة", english: "Overview", description: "سجل موحّد لبيانات المنصة ومعرفتها وأصولها، من المصدر إلى النشر." },
  { key: "data", title: "البيانات", english: "Data", description: "إنشاء وتصنيف البيانات المنظمة مع الاحتفاظ بالمصدر وسجل المراجعة." },
  { key: "knowledge", title: "المعرفة", english: "Knowledge", description: "إدارة المعرفة الموثقة وإرسالها للمراجعة البشرية قبل إتاحتها." },
  { key: "assets", title: "الأصول", english: "Assets", description: "أصول المنصة والملفات المرتبطة بها وحقوق استخدامها." },
  { key: "imports", title: "الاستيراد", english: "Imports", description: "رفع المحتوى وتتبع نتيجة الاستيراد وحدود المعالجة الفعلية." },
  { key: "sources", title: "المصادر", english: "Sources", description: "توثيق المصدر وموثوقيته وتاريخه وحالة مراجعته." },
  { key: "evidence", title: "الأدلة", english: "Evidence", description: "أدلة قابلة للتتبع مرتبطة بالبيانات والمعرفة الأصلية." },
  { key: "conflicts", title: "التعارضات", english: "Conflicts", description: "مراجعة التعارضات وحسمها بقرار بشري موثق." },
  { key: "versions", title: "الإصدارات", english: "Versions", description: "تفاصيل الإصدارات والتغييرات والمصدر دون استبدال صامت للسجلات." },
  { key: "robot-knowledge", title: "معرفة الروبوتات", english: "Robot Knowledge", description: "استرجاع المعرفة المنشورة مع بيان المصدر والثقة وحدود الاستخدام." },
  { key: "academy", title: "الأكاديمية", english: "Academy", description: "اقتراحات المحتوى التعليمي ومراجعتها مع الحفاظ على حوكمة النشر." },
  { key: "publishing", title: "النشر", english: "Publishing", description: "بوابة نشر المحتوى المعتمد؛ المسودة ليست معرفة منشورة." },
  { key: "usage", title: "الاستخدام", english: "Usage", description: "سجلات الاستخدام الفعلية؛ غياب القياس لا يعني انعدام الاستخدام." },
  { key: "audit", title: "سجل التدقيق", english: "Audit Log", description: "تتبع إجراءات الإدارة وقرارات المراجعة والنشر." },
  { key: "settings", title: "الإعدادات", english: "Settings", description: "سياسات المركز وإمكانات المعالجة المتاحة فعلياً." },
] as const;

export type DataCenterSection = (typeof DATA_CENTER_SECTIONS)[number]["key"];

export function dataCenterHref(section: DataCenterSection) {
  return section === "overview" ? "/admin/data-center" : `/admin/data-center/${section}`;
}

export function findDataCenterSection(section: string) {
  return DATA_CENTER_SECTIONS.find((item) => item.key === section) ?? null;
}

const dataCenterLabels: Record<string, string> = {
  DATA: "بيانات", KNOWLEDGE: "معرفة", ASSET: "أصل", EVIDENCE: "دليل",
  INTELLIGENCE: "تحليل ذكي", CONTEXT: "سياق",
  DRAFT: "مسودة", IN_REVIEW: "قيد المراجعة", APPROVED: "معتمد",
  PUBLISHED: "منشور", REJECTED: "مرفوض", ARCHIVED: "مؤرشف", DEPRECATED: "متقادم",
  VERIFIED: "متحقق منه", ESTIMATED: "تقديري", DERIVED: "مشتق",
  UNVERIFIED: "غير متحقق منه", CONFLICTED: "متعارض",
  PLATFORM: "المنصة", ORGANIZATION: "المؤسسة", PRIVATE: "خاص",
  JENAN_OWNED: "مملوك لجنان", OPEN_LICENSE: "ترخيص مفتوح", LICENSED: "مرخّص", RESTRICTED: "مقيّد",
  FRESH: "حديث", AGING: "يقترب من التقادم", STALE: "قديم", EXPIRED: "منتهي الصلاحية",
  HUMAN: "بشري", AI: "ذكاء اصطناعي", IMPORT: "مستورد", CALCULATION: "حساب حتمي",
  MANUAL: "يدوي", FILE: "ملف", OFFICIAL: "رسمي", ACADEMY: "الأكاديمية",
  GENERATED: "مولّد", API: "واجهة بيانات", SOURCE: "مصدر", DOCUMENT: "وثيقة",
  HUMAN_REVIEW: "مراجعة بشرية", EXISTING_EVIDENCE: "دليل موجود",
};

export function displayDataCenterValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "غير متاح";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "غير متاح";
  if (typeof value === "string") return dataCenterLabels[value] ?? value;
  return JSON.stringify(value);
}

export function safeDataCenterSourceUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
