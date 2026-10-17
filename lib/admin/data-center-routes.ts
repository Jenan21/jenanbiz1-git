export const DATA_CENTER_AREAS = [
  { key: "overview", ar: "نظرة عامة", en: "Overview" },
  { key: "data", ar: "البيانات", en: "Data" },
  { key: "knowledge", ar: "المعرفة", en: "Knowledge" },
  { key: "assets", ar: "مكتبة الأصول", en: "Assets" },
  { key: "imports", ar: "الاستيراد", en: "Imports" },
  { key: "sources", ar: "المصادر", en: "Sources" },
  { key: "evidence", ar: "الأدلة", en: "Evidence" },
  { key: "conflicts", ar: "التعارضات", en: "Conflicts" },
  { key: "versions", ar: "الإصدارات", en: "Versions" },
  { key: "robot-knowledge", ar: "معرفة الروبوتات", en: "Robot Knowledge" },
  { key: "academy", ar: "الأكاديمية", en: "Academy" },
  { key: "publishing", ar: "النشر", en: "Publishing" },
  { key: "usage", ar: "الاستخدام", en: "Usage" },
  { key: "audit", ar: "سجل التدقيق", en: "Audit Log" },
  { key: "settings", ar: "الإعدادات", en: "Settings" },
] as const;

export type DataCenterArea = (typeof DATA_CENTER_AREAS)[number]["key"];

export function isDataCenterArea(value: string): value is DataCenterArea {
  return DATA_CENTER_AREAS.some((area) => area.key === value);
}

export function dataCenterPath(area: DataCenterArea) {
  return area === "overview" ? "/admin/data-center" : `/admin/data-center/${area}`;
}
