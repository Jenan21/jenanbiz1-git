"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { MapPanel } from "./display";
import { canMapAction, mapErrorMessage, type AdminMapSnapshot } from "./snapshot";

type ImportMode = "upload" | "staged";
const kinds = ["pmtiles", "style", "glyphs", "sprite", "schema", "coverage"] as const;
const uploadLimit = 31 * 1024 * 1024;

export function prepareArtifactImport(data: FormData, mode: ImportMode) {
  const kind = String(data.get("kind") ?? "");
  const filename = String(data.get("filename") ?? "").trim();
  const sha256 = String(data.get("sha256") ?? "").trim().toLowerCase();
  const byteSize = Number(data.get("byteSize"));
  const releaseId = String(data.get("releaseId") ?? "");
  const exportAllowed = data.get("exportAllowed") === "on";
  const exportLicense = String(data.get("exportLicense") ?? "").trim();
  const confirmation = String(data.get("confirmation") ?? "").trim();
  if (!/^[a-f0-9-]{36}$/i.test(releaseId) || !kinds.includes(kind as typeof kinds[number]) ||
      !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > 32 * 1024 ** 3 ||
      !filename || confirmation !== "IMPORT OWNED MAP ARTIFACT" || data.get("acknowledged") !== "on" ||
      (exportAllowed && exportLicense.length < 3)) throw new Error("أكمل بيانات الملف والترخيص والتأكيد الصريح قبل الاستيراد.");
  const publicSafe = data.get("publicSafe") === "on";
  if (publicSafe && ["schema", "coverage"].includes(kind)) throw new Error("أدلة المخطط والتغطية خاصة بالإدارة ولا يمكن تصنيفها عامة.");
  const metadata = { kind, filename, sha256, byteSize, publicSafe, exportAllowed, ...(exportAllowed ? { exportLicense } : {}), confirmation };
  if (mode === "staged") {
    const stagedFilename = String(data.get("stagedFilename") ?? "").trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(stagedFilename)) throw new Error("استخدم اسم ملف موجود في مجلد التجهيز الخاص فقط، وليس مساراً أو رابطاً.");
    return { releaseId, body: JSON.stringify({ metadata, stagedFilename }), headers: { "content-type": "application/json" } };
  }
  const file = data.get("file");
  if (!(file instanceof File) || file.size < 1 || file.size > uploadLimit || file.size !== byteSize) {
    throw new Error("اختر ملفاً مطابقاً للحجم المسجل وبحد أقصى 31 MiB؛ استخدم التجهيز الخاص للملفات الأكبر.");
  }
  const body = new FormData();
  body.set("metadata", JSON.stringify(metadata));
  body.set("file", file);
  return { releaseId, body, headers: undefined };
}

export function MapArtifactImport({ snapshot, disabled, onSettled, onBusyChange }: {
  snapshot: AdminMapSnapshot | null;
  disabled: boolean;
  onSettled: () => Promise<unknown>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [mode, setMode] = useState<ImportMode>("upload");
  const [kind, setKind] = useState("pmtiles");
  const [exportAllowed, setExportAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const eligible = snapshot?.releases.filter((release) => ["Draft", "Ready"].includes(release.status)) ?? [];
  const enabled = !disabled && !busy && canMapAction(snapshot, "artifact-import") && eligible.length > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled) return;
    const form = event.currentTarget;
    let request: ReturnType<typeof prepareArtifactImport>;
    try { request = prepareArtifactImport(new FormData(form), mode); }
    catch (error) { setMessage(error instanceof Error ? error.message : mapErrorMessage()); return; }
    if (!eligible.some((release) => release.id === request.releaseId)) return;
    setBusy(true);
    onBusyChange?.(true);
    setMessage("جارٍ نقل الملف والتحقق من الحجم والبصمة والصيغة على الخادم… لا تُغلق الصفحة.");
    try {
      const response = await fetch(`/api/admin/jenan-map/releases/${encodeURIComponent(request.releaseId)}/artifacts`, {
        method: "POST", credentials: "same-origin", headers: request.headers, body: request.body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.id || payload.error) {
        setMessage(mapErrorMessage(payload?.code ?? payload?.error, response.status));
      } else {
        setMessage("حُفظ الملف بعد التحقق على الخادم. لا يعني الاستيراد اعتماداً أو نشراً؛ أكمل تجهيز بيانات البحث والحدود وربط الطبقات ثم المعاينة والمراجعة.");
        form.reset();
        setKind("pmtiles");
        setExportAllowed(false);
      }
    } catch {
      setMessage("انقطع الاتصال ولم يُؤكد الاستيراد. حدّث قائمة الملفات وتحقق من البصمة قبل إعادة الطلب؛ قد يكون الخادم حفظ الملف.");
    } finally {
      try { await onSettled(); } finally { setBusy(false); onBusyChange?.(false); }
    }
  }

  return <MapPanel title="استيراد ملفات الإصدار الفعلية">
    <p>استيراد خاص موثّق إلى إصدار غير معتمد، دون استبدال ملفات محفوظة أو تغيير مؤشر الإنتاج. لا تقبل الواجهة روابط خارجية أو أوامر تشغيل. يلزم تجهيز الحدود والبحث وربط الطبقات بعملية البناء الموثوقة.</p>
    {!canMapAction(snapshot, "artifact-import") ? <p>استيراد الملفات غير متاح من الخادم؛ النموذج معطّل.</p> : !eligible.length ? <p>أنشئ مسودة أولاً؛ لا يمكن إضافة ملفات إلى إصدار معتمد أو منشور.</p> : null}
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={!enabled} style={{ minWidth: 0, display: "grid", gap: 16, border: 0, margin: 0, padding: 0 }}>
        <legend>الملف وحقوق استخدامه</legend>
        <label>الإصدار<select name="releaseId" required defaultValue=""><option value="" disabled>اختر مسودة أو إصداراً جاهزاً غير معتمد</option>{eligible.map((release) => <option key={release.id} value={release.id}>{release.version}</option>)}</select></label>
        <label>طريقة الإدخال<select value={mode} onChange={(event) => setMode(event.target.value as ImportMode)}><option value="upload">رفع ملف محلي — حتى 31 MiB</option><option value="staged">ملف مجهّز في التخزين الخاص — حتى 32 GiB</option></select></label>
        <label>نوع الملف<select name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>{kinds.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>اسم الأصل المنطقي<input name="filename" required maxLength={200} dir="ltr" placeholder={kind === "glyphs" ? "Font Name/0-255.pbf" : kind === "pmtiles" ? "saudi.pmtiles" : kind === "sprite" ? "sprite.json" : "asset.json"} /></label>
        {mode === "upload" ? <label>الملف المحلي<input name="file" type="file" required onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          const form = event.currentTarget.form;
          if (!file || !form) return;
          const size = form.elements.namedItem("byteSize");
          const name = form.elements.namedItem("filename");
          if (size instanceof HTMLInputElement) size.value = String(file.size);
          if (name instanceof HTMLInputElement && !name.value) name.value = file.name;
        }} /></label> : <label>اسم الملف داخل مجلد التجهيز الخاص<input name="stagedFilename" required pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}" maxLength={181} dir="ltr" /><span>يجهزه المشغّل داخل JENAN_MAP_STAGING_ROOT؛ لا تدخل المسار المطلق.</span></label>}
        <label>الحجم الدقيق بالبايت<input name="byteSize" type="number" min={1} max={mode === "upload" ? uploadLimit : 32 * 1024 ** 3} step={1} required dir="ltr" /></label>
        <label>بصمة SHA-256 الموثقة<input name="sha256" pattern="[a-fA-F0-9]{64}" minLength={64} maxLength={64} required dir="ltr" /></label>
        <label className="jenan-map-admin__check"><input name="publicSafe" type="checkbox" disabled={["schema", "coverage"].includes(kind)} />أؤكد خلو الأصل من البيانات الداخلية وصلاحيته للإتاحة العامة بعد النشر</label>
        <label className="jenan-map-admin__check"><input name="exportAllowed" type="checkbox" checked={exportAllowed} onChange={(event) => setExportAllowed(event.target.checked)} />الترخيص يسمح بتصدير هذا الأصل</label>
        <label>إذن التصدير وشروطه<textarea name="exportLicense" minLength={3} maxLength={2000} required={exportAllowed} disabled={!exportAllowed} /></label>
        <label className="jenan-map-admin__check"><input name="acknowledged" type="checkbox" required />راجعت المصدر والترخيص والبصمة؛ هذا الإجراء لا يعتمد الإصدار ولا ينشره.</label>
        <label>اكتب IMPORT OWNED MAP ARTIFACT للتأكيد<input name="confirmation" required pattern="IMPORT OWNED MAP ARTIFACT" dir="ltr" autoComplete="off" /></label>
        <Button type="submit" disabled={!enabled}>{busy ? "جارٍ الاستيراد والتحقق…" : "استيراد الملف والتحقق"}</Button>
      </fieldset>
    </form>
    {message ? <p role="status">{message}</p> : null}
  </MapPanel>;
}
