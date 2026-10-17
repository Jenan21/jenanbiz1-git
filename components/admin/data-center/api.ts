import type { DataCenterRecord } from "./record-details";

export const DATA_CENTER_API = "/api/admin/data-center";

const errorMessages: Record<string, string> = {
  INDEPENDENT_REVIEW_REQUIRED: "يلزم مراجع مستقل عن منشئ الإصدار.",
  APPROVING_REVIEW_REQUIRED: "يلزم تسجيل مراجعة موافقة قبل الاعتماد أو النشر.",
  INVALID_LIFECYCLE_TRANSITION: "الانتقال غير مسموح من الحالة الحالية.",
  ITEM_NOT_IN_REVIEW: "يجب إرسال السجل للمراجعة أولاً.",
  UNRESOLVED_CONFLICT: "يجب حسم التعارضات المفتوحة قبل النشر.",
  EXPIRED_VERSION: "الإصدار منتهي الصلاحية؛ أنشئ إصداراً محدثاً.",
  TYPE_LAYER_MISMATCH: "نوع المحتوى غير مسجل أو لا يطابق الطبقة المختارة.",
  SEMANTIC_PROVIDER_UNAVAILABLE: "البحث الدلالي غير متاح؛ استخدم البحث بالكلمات.",
  SCANNER_UNAVAILABLE: "رفع الملفات غير متاح دون مزود فحص آمن.",
  FUTURE_SOURCE_DATE: "لا يمكن أن يكون تاريخ المصدر في المستقبل.",
  INVALID_DATA_CENTER_INPUT: "المدخلات غير صالحة. تحقق من الحقول والأطوال والتصنيفات.",
  ALREADY_EXISTS: "يوجد سجل بهذا المعرّف. استخدم مفتاحاً آخر.",
  DATA_CENTER_UNAVAILABLE: "الخدمة غير متاحة حالياً. لم تُحمّل بيانات بديلة؛ حاول مجدداً.",
};

export function dataCenterErrorMessage(status: number, payload: DataCenterRecord | null) {
  if (status === 401 || status === 403) return "ليست لديك صلاحية لتنفيذ هذا الإجراء. تحقق من جلسة الإدارة.";
  if (status === 429) return "تم تجاوز حد الطلبات. حاول مجدداً بعد قليل.";
  const code = String(payload?.code ?? payload?.error ?? payload?.message ?? "");
  return errorMessages[code] ?? (status >= 500 ? "الخدمة غير متاحة حالياً. لم تُحمّل بيانات بديلة؛ حاول مجدداً." : code || "تعذر إكمال الطلب. تحقق من المدخلات.");
}

export async function dataCenterRequest(url: string, init?: RequestInit): Promise<DataCenterRecord> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", ...init });
  const payload = await response.json().catch(() => null) as DataCenterRecord | null;
  if (!response.ok || payload?.success === false) throw new Error(dataCenterErrorMessage(response.status, payload));
  if (!payload || typeof payload !== "object") throw new Error("استجابة غير صالحة من مركز البيانات.");
  return payload;
}

export function asRecords(value: unknown): DataCenterRecord[] {
  return Array.isArray(value) ? value.filter((row): row is DataCenterRecord => !!row && typeof row === "object" && !Array.isArray(row)) : [];
}
