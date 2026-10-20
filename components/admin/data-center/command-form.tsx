"use client";

import { useState, type FormEvent } from "react";
import type { DataCenterRecord } from "./record-details";
import styles from "./data-center.module.css";

type Field = {
  name: string; label: string; kind?: "text" | "textarea" | "number" | "datetime-local" | "url";
  options?: readonly string[]; optional?: boolean; defaultValue?: string; placeholder?: string;
  min?: number; max?: number; step?: string;
};
export type CommandDefinition = { action: string; title: string; fields: Field[] };
const layers = ["DATA", "KNOWLEDGE", "INTELLIGENCE", "CONTEXT"];
const input = (name: string, label: string, extra: Partial<Field> = {}): Field => ({ name, label, ...extra });
const reason = input("reason", "سبب الإجراء", { kind: "textarea" });
const bboxEdge = (name: string, label: string, limit: number) => input(name, label, { kind: "number", optional: true, min: -limit, max: limit, step: "any" });
const BBOX_FIELDS = ["bboxWest", "bboxSouth", "bboxEast", "bboxNorth"];
// Version-level attribution and declared WGS84 coverage (plain metadata, no geometry). All optional: undeclared stays undeclared.
const versionRightsFields = [
  input("attribution", "إسناد هذا الإصدار — يتقدم على إسناد المصدر عند ذكره", { kind: "textarea", optional: true }),
  input("coverageCountries", "رموز الدول ISO 3166-1 مثل SA (مفصولة بفواصل)", { optional: true }),
  input("coverageRegions", "رموز المناطق ISO 3166-2 مثل SA-01 (مفصولة بفواصل)", { optional: true }),
  bboxEdge("bboxWest", "الحد الغربي — خط الطول من -180 إلى 180", 180),
  bboxEdge("bboxSouth", "الحد الجنوبي — خط العرض من -90 إلى 90", 90),
  bboxEdge("bboxEast", "الحد الشرقي — خط الطول من -180 إلى 180", 180),
  bboxEdge("bboxNorth", "الحد الشمالي — خط العرض من -90 إلى 90", 90),
];

export const DATA_CENTER_COMMANDS: Record<string, CommandDefinition> = {
  source: { action: "create-source", title: "إضافة مصدر", fields: [
    input("name", "اسم المصدر"), input("kind", "نوع المصدر", { options: ["MANUAL", "FILE", "OFFICIAL", "ACADEMY", "GENERATED", "API"] }),
    input("scope", "نطاق الإتاحة", { options: ["PRIVATE", "ORGANIZATION", "PLATFORM"] }),
    input("organizationId", "معرّف المؤسسة — مطلوب لنطاق المؤسسة فقط", { optional: true }),
    input("owner", "مالك المحتوى"), input("license", "الترخيص وحقوق الاستخدام"),
    input("sourceOrganization", "الجهة الناشرة للمصدر", { optional: true }),
    input("sourceUrl", "رابط المصدر (http أو https)", { kind: "url", optional: true }),
    input("ownership", "ملكية البيانات — تُحدد تلقائياً إن تُركت فارغة", { options: ["", "THIRD_PARTY", "PLATFORM_OWNED", "USER_OWNED", "AI_GENERATED"], optional: true }),
    input("licenseClass", "تصنيف الترخيص المعلن (لا يُستنتج من الملكية)", { options: ["", "OPEN_LICENSE", "LICENSED", "JENAN_OWNED", "RESTRICTED"], optional: true }),
    input("usagePolicy", "سياسة الاستخدام — الافتراضي: استخدام داخلي وإعادة التوزيع بإذن صريح", { kind: "textarea", optional: true }),
    input("attribution", "نص الإسناد الواجب عرضه مع البيانات", { kind: "textarea", optional: true }),
    input("attributionRequired", "الإسناد إلزامي", { options: ["false", "true"] }),
    input("freshnessDays", "مدة صلاحية المصدر (أيام)", { kind: "number", defaultValue: "90" }),
    input("allowExport", "السماح بالتصدير", { options: ["false", "true"] }),
    input("allowRetrieval", "السماح بالاسترجاع", { options: ["true", "false"] }),
  ] },
  item: { action: "create-item", title: "إنشاء سجل", fields: [
    input("title", "عنوان السجل"), input("sourceId", "المصدر"),
    input("typeKey", "مفتاح النوع"), input("layer", "الطبقة", { options: layers }),
    input("content", "المحتوى", { kind: "textarea" }),
    input("sourcePublishedAt", "تاريخ نشر المصدر", { kind: "datetime-local", optional: true }),
    input("expiresAt", "انتهاء الصلاحية", { kind: "datetime-local", optional: true }),
    input("effectiveFrom", "بداية السريان", { kind: "datetime-local", optional: true }),
    input("effectiveTo", "نهاية السريان", { kind: "datetime-local", optional: true }),
    input("evidenceStatus", "حالة الدليل — الاعتماد ليس تحققاً من الحقيقة", { options: ["UNVERIFIED", "ESTIMATED", "DERIVED", "VERIFIED", "CONFLICTED"] }),
    input("specialties", "التخصصات (مفصولة بفواصل)", { optional: true }),
    input("missionContexts", "سياقات المهام (مفصولة بفواصل)", { optional: true }),
    input("requiredPermission", "صلاحية الاسترجاع المطلوبة", { optional: true }),
    input("provenance", "المراجع: JSON [{label, reference, kind}]", { kind: "textarea", optional: true }),
    input("upstreamVersionIds", "معرّفات الإصدارات التي اشتُق منها هذا الإصدار (مفصولة بفواصل)", { optional: true }),
    ...versionRightsFields,
  ] },
  type: { action: "register-type", title: "تسجيل نوع", fields: [
    input("key", "مفتاح النوع (حروف لاتينية صغيرة)"), input("label", "اسم النوع"),
    input("layer", "الطبقة", { options: layers }),
    input("categoryKey", "مفتاح الفئة المسجلة", { optional: true }),
    input("departmentKey", "مفتاح القسم المسجل", { optional: true }),
    input("requiresIndependentReview", "مراجعة مستقلة إلزامية", { options: ["true", "false"] }),
  ] },
  version: { action: "create-version", title: "إنشاء إصدار جديد", fields: [
    input("title", "العنوان"), input("content", "المحتوى الجديد", { kind: "textarea" }), reason,
    input("evidenceStatus", "حالة الدليل", { options: ["UNVERIFIED", "ESTIMATED", "DERIVED", "VERIFIED", "CONFLICTED"] }),
    input("sourcePublishedAt", "تاريخ المصدر", { kind: "datetime-local", optional: true }),
    input("expiresAt", "انتهاء الصلاحية", { kind: "datetime-local", optional: true }),
    input("effectiveFrom", "بداية السريان", { kind: "datetime-local", optional: true }),
    input("effectiveTo", "نهاية السريان", { kind: "datetime-local", optional: true }),
    input("specialties", "التخصصات (مفصولة بفواصل)", { optional: true }),
    input("missionContexts", "سياقات المهام (مفصولة بفواصل)", { optional: true }),
    input("requiredPermission", "صلاحية الاسترجاع المطلوبة", { optional: true }),
    input("provenance", "المراجع: JSON [{label, reference, kind}]", { kind: "textarea", optional: true }),
    input("upstreamVersionIds", "معرّفات الإصدارات التي اشتُق منها هذا الإصدار (مفصولة بفواصل)", { optional: true }),
    ...versionRightsFields,
  ] },
  transition: { action: "transition-item", title: "تغيير حالة السجل", fields: [
    input("status", "الحالة الجديدة", { options: ["IN_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED", "DRAFT"] }), reason,
  ] },
  review: { action: "review-item", title: "قرار المراجعة البشرية", fields: [
    input("decision", "القرار", { options: ["APPROVED", "REJECTED"] }), input("notes", "أسباب القرار", { kind: "textarea" }),
  ] },
  conflict: { action: "create-conflict", title: "تسجيل تعارض", fields: [
    input("itemId", "معرّف السجل الأول"), input("otherItemId", "معرّف السجل المقابل"), reason,
  ] },
  resolve: { action: "resolve-conflict", title: "حسم التعارض", fields: [
    input("resolution", "قرار الحسم", { options: ["KEEP_FIRST", "KEEP_SECOND", "KEEP_BOTH", "SUPERSEDED"] }),
    input("notes", "مبررات الحسم", { kind: "textarea" }),
  ] },
  release: { action: "request-academy-release", title: "اقتراح إصدار للأكاديمية", fields: [
    input("versionId", "معرّف الإصدار المنشور"), input("targetKind", "جهة الاستخدام", { options: ["COURSE", "ROBOT", "SPECIALTY"] }),
    input("targetId", "معرّف الجهة المستهدفة"), input("notes", "سبب الاقتراح", { kind: "textarea" }),
  ] },
  approveRelease: { action: "approve-academy-release", title: "اعتماد إصدار الأكاديمية", fields: [
    input("notes", "مبررات الاعتماد", { kind: "textarea" }),
  ] },
  academySource: { action: "import-academy-source", title: "ربط مصدر معتمد من الأكاديمية", fields: [
    input("sourceId", "معرّف مصدر المركز"), input("resourceVersionId", "معرّف إصدار المورد المعتمد بالأكاديمية"),
  ] },
  usage: { action: "record-usage", title: "تسجيل مرجع استخدام", fields: [
    input("versionId", "معرّف الإصدار المنشور"), input("consumer", "الخدمة أو المستهلك"),
    input("purpose", "غرض الاستخدام"), input("missionId", "معرّف المهمة", { optional: true }),
    input("specialty", "التخصص", { optional: true }), input("missionContext", "سياق المهمة", { optional: true }),
  ] },
  category: { action: "register-category", title: "تسجيل فئة", fields: [
    input("key", "مفتاح الفئة (حروف لاتينية صغيرة)"), input("label", "اسم الفئة"),
  ] },
  department: { action: "register-department", title: "تسجيل قسم", fields: [
    input("key", "مفتاح القسم (حروف لاتينية صغيرة)"), input("label", "اسم القسم"),
  ] },
  evidence: { action: "link-evidence", title: "ربط دليل بإصدار", fields: [
    input("versionId", "معرّف الإصدار"), input("label", "وصف الدليل"),
    input("kind", "نوع الدليل", { options: ["SOURCE", "DOCUMENT", "CALCULATION", "HUMAN_REVIEW", "EXISTING_EVIDENCE"] }),
    input("reference", "المرجع أو رابط المصدر"), input("evidenceId", "معرّف دليل موجود (لنمط EXISTING_EVIDENCE)", { optional: true }),
    input("notes", "ملاحظات الربط", { kind: "textarea", optional: true }),
  ] },
  grantRobot: { action: "grant-robot-access", title: "منح روبوت وصولاً إلى مصدر", fields: [
    input("sourceId", "المصدر"), input("robotId", "معرّف الروبوت"), input("principalId", "معرّف الحساب الذي يعمل به الروبوت"),
    input("roleKey", "دور الروبوت"), input("specialty", "التخصص"), input("missionId", "معرّف المهمة المسندة للروبوت"),
    input("access", "نوع الوصول — الاقتراح يتطلب منحة PROPOSE صريحة", { options: ["READ", "PROPOSE"] }),
    input("expiresAt", "تاريخ انتهاء المنحة (حتى 365 يوماً)", { kind: "datetime-local" }),
    input("reason", "سبب المنح", { kind: "textarea" }),
  ] },
  revokeRobot: { action: "revoke-robot-access", title: "سحب منحة وصول روبوت", fields: [
    input("reason", "سبب السحب", { kind: "textarea" }),
  ] },
  quality: { action: "record-quality-assessment", title: "تسجيل تقييم جودة", fields: [
    input("versionId", "معرّف الإصدار المقيَّم"),
    input("status", "نتيجة التقييم — INSUFFICIENT_DATA تعني عدم كفاية البيانات ولا درجة لها", { options: ["MEASURED", "INSUFFICIENT_DATA"] }),
    input("score", "الدرجة من 0 إلى 1 — لنتيجة MEASURED فقط", { kind: "number", optional: true, min: 0, max: 1, step: "any" }),
    input("method", "منهج القياس"), input("methodVersion", "إصدار المنهج"),
    input("measuredAt", "تاريخ القياس", { kind: "datetime-local" }),
    input("explanation", "كيف قيست الجودة، أو ما الذي تفتقده البيانات", { kind: "textarea" }),
    input("metrics", "مؤشرات تفسيرية اختيارية بصيغة JSON مثل {\"completeness\": 0.9}", { kind: "textarea", optional: true }),
  ] },
};

export function commandPayload(form: FormData, definition: CommandDefinition, fixed: DataCenterRecord = {}) {
  const payload: DataCenterRecord = { action: definition.action, ...fixed };
  const list = (value: string) => value.split(/[,،]/).map((part) => part.trim()).filter(Boolean);
  const coverage: { countryCodes?: string[]; regionCodes?: string[]; boundingBox?: Record<string, number> } = {};
  for (const field of definition.fields) {
    const value = String(form.get(field.name) ?? "").trim();
    if (!value && field.optional) continue;
    if (["allowExport", "allowRetrieval", "requiresIndependentReview", "attributionRequired"].includes(field.name)) payload[field.name] = value === "true";
    else if (field.name === "coverageCountries") coverage.countryCodes = list(value).map((code) => code.toUpperCase());
    else if (field.name === "coverageRegions") coverage.regionCodes = list(value).map((code) => code.toUpperCase());
    else if (BBOX_FIELDS.includes(field.name)) coverage.boundingBox = { ...coverage.boundingBox, [field.name.slice(4).toLowerCase()]: Number(value) };
    else if (field.kind === "number") payload[field.name] = Number(value);
    else if (field.kind === "datetime-local") payload[field.name] = new Date(value).toISOString();
    else if (["specialties", "missionContexts", "upstreamVersionIds"].includes(field.name)) payload[field.name] = list(value);
    else if (field.name === "provenance" || field.name === "metrics") payload[field.name] = JSON.parse(value);
    else payload[field.name] = value;
  }
  if (Object.keys(coverage).length) payload.coverage = coverage;
  return payload;
}

export function CommandForm({ definition, fixed, busy, onSubmit, sources = [], types = [] }: {
  definition: CommandDefinition; fixed?: DataCenterRecord; busy: boolean;
  onSubmit: (payload: DataCenterRecord) => Promise<boolean>; sources?: DataCenterRecord[]; types?: DataCenterRecord[];
}) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = event.currentTarget;
    try {
      const payload = commandPayload(new FormData(form), definition, fixed);
      if (await onSubmit(payload)) form.reset();
    } catch {
      setError("تعذر قراءة المدخلات. تحقق من التواريخ ومن صيغة JSON للمراجع.");
    }
  }
  return (
    <form className={styles.form} onSubmit={submit} aria-label={definition.title}>
      {definition.fields.map((field) => {
        const choices = field.name === "sourceId" ? sources : field.name === "typeKey" ? types : [];
        return <label className={field.kind === "textarea" ? styles.wide : undefined} key={field.name}>
          {field.label}{field.optional ? " (اختياري)" : ""}
          {field.options ? <select name={field.name} required={!field.optional} defaultValue={field.defaultValue}>{field.options.map((value) => <option key={value} value={value}>{value === "true" ? "نعم" : value === "false" ? "لا" : value === "" ? "غير محدد" : value}</option>)}</select>
            : choices.length ? <><input name={field.name} required list={`dc-${field.name}-options`} placeholder="اختر اقتراحاً أو أدخل المعرّف المسجل" maxLength={128} onChange={(event) => {
              if (field.name !== "typeKey") return;
              const selectedType = types.find((record) => String(record.key) === event.target.value);
              const layer = event.currentTarget.form?.elements.namedItem("layer");
              if (layer instanceof HTMLSelectElement && selectedType?.layer) layer.value = String(selectedType.layer);
            }} /><datalist id={`dc-${field.name}-options`}>{choices.map((record) => <option key={String(record.id ?? record.key)} value={String(record.id ?? record.key)}>{String(record.name ?? record.label ?? record.id ?? record.key)}</option>)}</datalist></>
            : field.kind === "textarea" ? <textarea name={field.name} required={!field.optional} rows={4} maxLength={field.name === "content" ? 200000 : 10000} placeholder={field.placeholder} defaultValue={field.defaultValue} />
            : <input name={field.name} required={!field.optional} type={field.kind ?? "text"} defaultValue={field.defaultValue} placeholder={field.placeholder} maxLength={2000} min={field.min ?? (field.kind === "number" ? 1 : undefined)} max={field.max ?? (field.name === "freshnessDays" ? 3650 : undefined)} step={field.step} />}
        </label>;
      })}
      {error ? <p role="alert" className={`${styles.feedback} ${styles.error} ${styles.wide}`}>{error}</p> : null}
      <div className={styles.wide}><button className={styles.button} type="submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : definition.title}</button></div>
    </form>
  );
}
