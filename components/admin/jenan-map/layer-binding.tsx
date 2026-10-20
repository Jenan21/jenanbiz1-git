"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { MapPanel } from "./display";
import { canMapAction, mapErrorMessage, type AdminMapSnapshot } from "./snapshot";

export function prepareLayerBinding(data: FormData) {
  const releaseId = String(data.get("releaseId") ?? "");
  const confirmation = String(data.get("confirmation") ?? "").trim();
  const raw = String(data.get("layersJson") ?? "");
  if (!/^[a-f0-9-]{36}$/i.test(releaseId) || confirmation !== "BIND MAP LAYERS" ||
      data.get("acknowledged") !== "on" || new TextEncoder().encode(raw).length > 120 * 1024) {
    throw new Error("اختر إصداراً وراجع إتاحة البيانات وأكمل التأكيد الصريح.");
  }
  let layers: unknown;
  try { layers = JSON.parse(raw); } catch { throw new Error("بيان الطبقات يجب أن يكون مصفوفة JSON صالحة."); }
  if (!Array.isArray(layers) || !layers.length || layers.length > 100 ||
      layers.some((layer) => !layer || layer.visibility !== "public" || typeof layer.id !== "string" ||
        !Array.isArray(layer.styleLayerIds) || !layer.styleLayerIds.length ||
        layer.styleLayerIds.some((id: unknown) => typeof id !== "string" || !id.trim()))) {
    throw new Error("يلزم لكل طبقة معرّف كتالوج ومعرّفات نمط حقيقية وتصنيف visibility بقيمة public صراحةً. لا يمكن ربط بيانات داخلية بالنمط العام.");
  }
  return { releaseId, body: JSON.stringify({ layers, confirmation }) };
}

export function MapLayerBinding({ snapshot, disabled, onSettled, onBusyChange }: {
  snapshot: AdminMapSnapshot | null;
  disabled: boolean;
  onSettled: () => Promise<unknown>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const eligible = snapshot?.releases.filter((release) => ["Draft", "Ready"].includes(release.status)) ?? [];
  const enabled = !disabled && !busy && canMapAction(snapshot, "layer-bind") && eligible.length > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled) return;
    const form = event.currentTarget;
    let request: ReturnType<typeof prepareLayerBinding>;
    try { request = prepareLayerBinding(new FormData(form)); }
    catch (error) { setMessage(error instanceof Error ? error.message : mapErrorMessage()); return; }
    if (!eligible.some((release) => release.id === request.releaseId)) return;
    setBusy(true);
    onBusyChange?.(true);
    setMessage("جارٍ مطابقة البيان مع ملف النمط المحفوظ وتسجيل الربط…");
    try {
      const response = await fetch(`/api/admin/jenan-map/releases/${encodeURIComponent(request.releaseId)}/layers`, {
        method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: request.body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload?.layers) || payload.error) {
        setMessage(mapErrorMessage(payload?.code ?? payload?.error, response.status));
      } else {
        setMessage("حُفظ ربط الطبقات لهذا الإصدار. راجع المعاينة ثم الاعتماد والنشر؛ لا يغير هذا الإجراء مؤشر الإنتاج أو يثبت صحة البيانات.");
        form.reset();
      }
    } catch {
      setMessage("انقطع الاتصال ولم يُؤكد الربط. حدّث الحالة وافحص معاينة الإصدار قبل إعادة الطلب؛ الربط المحفوظ غير قابل للاستبدال.");
    } finally {
      try { await onSettled(); } finally { setBusy(false); onBusyChange?.(false); }
    }
  }

  return <MapPanel title="ربط طبقات الإصدار بملف النمط الحقيقي">
    <p>بعد استيراد ملف النمط والأصول، سجّل مصفوفة JSON تربط معرّفات الكتالوج بمعرّفات طبقات النمط الفعلية وتصنيفات البحث. الخادم يقرأ النمط المحفوظ بنفسه؛ لا يعتمد معرّفات المتصفح دليلاً على وجود البيانات.</p>
    <p><bdi>id · styleLayerIds · searchCategories · visibility · confidence</bdi>. استخدم <bdi>base</bdi> لمعرّفات الخلفية والبحث الأساسي في المدن والعناوين. الثقة المجهولة تُترك محذوفة أو <bdi>null</bdi>.</p>
    <p>الحفظ يسجّل الطبقات العامة مفعّلة لهذا الإصدار دون نشره. الربط محفوظ لكل إصدار وغير قابل للاستبدال. البيانات الداخلية لا يمكن ربطها بأرشيف عام. تعطيل الطبقة لاحقاً يحجب إتاحتها والبحث عنها ولا يحذف بياناتها المحفوظة.</p>
    {!canMapAction(snapshot, "layer-bind") ? <p>ربط الطبقات غير متاح من الخادم؛ النموذج معطّل.</p> : !eligible.length ? <p>يلزم إصدار مسودة أو جاهز غير معتمد؛ لا يمكن تعديل ربط إصدار معتمد أو منشور.</p> : null}
    <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={!enabled} style={{ minWidth: 0, display: "grid", gap: 16, border: 0, margin: 0, padding: 0 }}>
        <legend>بيان ربط الطبقات العام</legend>
        <label>الإصدار<select name="releaseId" required defaultValue=""><option value="" disabled>اختر إصداراً غير معتمد</option>{eligible.map((release) => <option key={release.id} value={release.id}>{release.version}</option>)}</select></label>
        <label>مصفوفة ربط الطبقات JSON<textarea name="layersJson" required maxLength={120 * 1024} dir="ltr" spellCheck={false} /></label>
        <label className="jenan-map-admin__check"><input name="acknowledged" type="checkbox" required />راجعت المصدر والترخيص وأؤكد أن كل طبقة مصنفة public صراحةً وخالية من البيانات الداخلية.</label>
        <label>اكتب BIND MAP LAYERS للتأكيد<input name="confirmation" required pattern="BIND MAP LAYERS" dir="ltr" autoComplete="off" /></label>
        <Button type="submit" disabled={!enabled}>{busy ? "جارٍ التحقق والربط…" : "التحقق من النمط وحفظ الربط"}</Button>
      </fieldset>
    </form>
    {message ? <p role="status">{message}</p> : null}
  </MapPanel>;
}
