export const mapAdminSections = [
  ["overview", "نظرة عامة"],
  ["versions", "الإصدارات"],
  ["updates", "التحديثات"],
  ["sources", "المصادر والتراخيص"],
  ["layers", "الطبقات"],
  ["storage", "التخزين والتصدير"],
  ["health", "الحالة التشغيلية"],
  ["audit", "سجل التدقيق"],
  ["settings", "الإعدادات"],
] as const;

export type MapAdminSection = typeof mapAdminSections[number][0];

export function isMapAdminSection(value: string): value is MapAdminSection {
  return mapAdminSections.some(([key]) => key === value);
}
