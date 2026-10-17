import { displayDataCenterValue, safeDataCenterSourceUrl } from "@/lib/admin/data-center-routes";
import styles from "./data-center.module.css";

export type DataCenterRecord = Record<string, unknown>;

const fieldLabels: Record<string, string> = {
  id: "معرّف السجل", title: "العنوان", name: "الاسم", description: "الوصف", content: "المحتوى",
  layer: "الطبقة", type: "النوع", category: "الفئة", department: "القسم", status: "الحالة",
  sourceId: "معرّف المصدر", sourceName: "المصدر", sourceUrl: "رابط المصدر", source: "المصدر",
  sourcePublishedAt: "تاريخ المصدر", createdAt: "تاريخ الإنشاء", updatedAt: "آخر تحديث",
  reviewedAt: "تاريخ المراجعة", reviewedById: "المراجع", publishedAt: "تاريخ النشر",
  confidence: "الثقة المسجلة (ليست ضماناً)", version: "الإصدار", currentVersion: "الإصدار الحالي",
  changeSummary: "ملخص التغيير", approvalState: "حالة الاعتماد", reviewState: "حالة المراجعة",
  provenance: "سلسلة المصدر", metadata: "بيانات وصفية", mimeType: "نوع الملف", sizeBytes: "حجم الملف بالبايت",
  action: "الإجراء", reason: "السبب", notes: "ملاحظات", targetId: "السجل المستهدف", actorId: "المنفذ",
  recordId: "السجل الأصلي", entityId: "السجل الأصلي", itemId: "السجل الأصلي", entityType: "نوع السجل",
  resolution: "قرار التعارض", resolvedAt: "تاريخ الحسم", checksum: "بصمة المحتوى",
  evidenceStatus: "حالة الدليل", origin: "أصل المحتوى", number: "رقم الإصدار", versions: "الإصدارات",
  reviews: "المراجعات البشرية", events: "سجل انتقالات الحالة", typeKey: "مفتاح النوع", scope: "نطاق الإتاحة",
  owner: "مالك المحتوى", license: "الترخيص", allowExport: "السماح بالتصدير", allowRetrieval: "السماح بالاسترجاع",
  freshnessDays: "مدة صلاحية المصدر (أيام)", specialties: "التخصصات",
  missionContexts: "سياقات المهام", requiredPermission: "الصلاحية المطلوبة", expiresAt: "انتهاء الصلاحية",
  capabilities: "الإمكانات المتاحة", backup: "النسخ الاحتياطي", imports: "الاستيراد", semantic: "البحث الدلالي",
  available: "متاح", scanner: "فحص الملفات", provider: "المزود", formats: "الصيغ", maxBytes: "الحد الأقصى بالبايت",
  targetKind: "نوع الجهة التعليمية", versionId: "معرّف الإصدار",
  fileName: "اسم الملف", adapter: "معالج الاستيراد", scanEngine: "مزود فحص الملف",
  categoryKey: "مفتاح الفئة", departmentKey: "مفتاح القسم", sourceOrganization: "الجهة الناشرة",
  effectiveFrom: "بداية السريان", effectiveTo: "نهاية السريان", publishedVersion: "الإصدار المنشور",
  classificationRegistry: "سجل التصنيف", types: "الأنواع", categories: "الفئات", departments: "الأقسام",
  total: "العدد الكلي", rows: "السجلات", limit: "حد العرض",
};

export function RecordDetails({ record }: { record: DataCenterRecord }) {
  return (
    <dl className={styles.details}>
      {Object.entries(record).map(([key, value]) => {
        const url = /url$/i.test(key) ? safeDataCenterSourceUrl(value) : null;
        return (
          <div key={key}>
            <dt>{fieldLabels[key] ?? key}</dt>
            <dd>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
              : value && typeof value === "object" ? <details><summary>عرض التفاصيل ({Array.isArray(value) ? value.length : Object.keys(value).length})</summary>
                {Array.isArray(value) ? value.map((entry, index) => <div key={index}>{entry && typeof entry === "object" ? <RecordDetails record={entry as DataCenterRecord} /> : displayDataCenterValue(entry)}</div>) : <RecordDetails record={value as DataCenterRecord} />}
              </details> : key === "content" ? <details><summary>عرض المحتوى</summary>{displayDataCenterValue(value)}</details> : displayDataCenterValue(value)}</dd>
          </div>
        );
      })}
    </dl>
  );
}
