"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { MapActionConfirmation } from "./confirmation";
import { displayDate, MapEmpty, MapPanel, MapTable } from "./display";
import { mapErrorMessage } from "./snapshot";

export type AdminMapLayer = {
  id: string;
  label: string;
  enabled: boolean;
  visibility: "public" | "internal";
  status: "unavailable" | "ready" | "warning";
  releaseId: string | null;
  source: string | null;
  version: string | null;
  confidence: number | null;
  updatedAt: string | null;
  revision: number;
  styleLayerIds: string[];
  searchCategories: string[];
  sourceDate: string | null;
  license: string | null;
};

export function canChangeLayer(layer: AdminMapLayer, activeReleaseId: string | null) {
  if (layer.enabled) return true;
  return Boolean(layer.status === "ready" && layer.styleLayerIds?.length && layer.source && layer.version && layer.visibility === "public" && activeReleaseId && layer.releaseId === activeReleaseId);
}

export function MapLayerCatalog({ activeReleaseId }: { activeReleaseId: string | null }) {
  const [layers, setLayers] = useState<AdminMapLayer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<AdminMapLayer | null>(null);

  async function load() {
    setPending(null);
    setLoading(true);
    try {
      const response = await fetch("/api/admin/jenan-map/layers", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload?.layers)) throw new Error(mapErrorMessage(payload?.error, response.status));
      setLayers(payload.layers);
    } catch (error) {
      setLayers(null);
      setMessage(error instanceof Error ? error.message : mapErrorMessage());
    } finally {
      setLoading(false);
    }
  }
  const loadOnMount = useEffectEvent(() => { void load(); });
  useEffect(() => {
    const timer = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timer);
  }, [activeReleaseId]);

  async function changeLayer() {
    if (!pending || busy || loading || !canChangeLayer(pending, activeReleaseId)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/jenan-map/layers", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: pending.id, enabled: !pending.enabled, expectedRevision: pending.revision, expectedReleaseId: pending.releaseId, confirmation: "CHANGE LAYER" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.error) throw new Error(mapErrorMessage(payload?.error, response.status));
      setMessage("حُفظت سياسة طبقة هذا الإصدار على الخادم. تعتمد الخريطة والبحث السياسة نفسها؛ أعد فتح الخريطة لقراءة الحالة الجديدة.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : mapErrorMessage());
    } finally {
      setPending(null);
      await load();
      setBusy(false);
    }
  }

  return <MapPanel title="كتالوج الطبقات وسياسة الإتاحة">
    <p>ربط الطبقات ومعرّفات النمط وتصنيفات البحث يأتي من بيان الاستيراد الموثّق لكل إصدار. التفعيل محجوب للبيانات غير الجاهزة أو الداخلية أو غير المرتبطة بإصدار الإنتاج الحالي؛ يمكن دائماً تعطيل طبقة مفعّلة.</p>
    <Button type="button" variant="secondary" disabled={loading || busy} onClick={() => { setMessage(""); void load(); }}>{loading ? "جارٍ قراءة الكتالوج…" : "تحديث كتالوج الطبقات"}</Button>
    {message ? <p role="status">{message}</p> : null}
    {layers?.length ? <MapTable headers={["الطبقة", "الحالة", "المصدر", "الإصدار", "تاريخ المصدر", "الترخيص", "معرّفات النمط", "تصنيفات البحث", "الثقة", "الرؤية", "آخر تحديث السجل", "الإتاحة"]}>
      {layers.map((layer) => <tr key={layer.id}>
        <td>{layer.label}</td><td>{layer.status === "ready" ? "جاهز بحسب السجل" : layer.status === "warning" ? "يتطلب مراجعة" : "بيانات غير متاحة"}</td>
        <td>{layer.source ?? "غير متاح"}</td><td>{layer.version ?? "غير متاح"}</td><td>{displayDate(layer.sourceDate)}</td><td>{layer.license ?? "غير موثق"}</td>
        <td><bdi>{layer.styleLayerIds?.join("، ") || "غير مرتبط"}</bdi></td><td><bdi>{layer.searchCategories?.join("، ") || "لا توجد تصنيفات بحث مرتبطة"}</bdi></td>
        <td>{layer.confidence === null ? "غير معروفة" : `${Math.round(layer.confidence * 100)}%`}</td><td>{layer.visibility === "public" ? "عامة بشرط النشر" : "داخلية"}</td><td>{displayDate(layer.updatedAt)}</td>
        <td><span>{layer.enabled ? "مفعّلة في السياسة" : "معطّلة"}</span><Button type="button" variant="secondary" disabled={loading || busy || !canChangeLayer(layer, activeReleaseId)} onClick={() => setPending(layer)}>{layer.enabled ? "تعطيل" : "تفعيل"}</Button></td>
      </tr>)}
    </MapTable> : <MapEmpty>{loading ? "جارٍ قراءة الحالة…" : layers ? "لا توجد طبقات مسجلة." : "كتالوج الطبقات غير متاح؛ حالته غير معروفة وجميع عناصر التحكم معطلة."}</MapEmpty>}
    {pending ? <MapActionConfirmation pending={{ action: "layer", title: pending.enabled ? "تأكيد تعطيل الطبقة" : "تأكيد تفعيل الطبقة", description: `تغيير إتاحة طبقة «${pending.label}». لن يغيّر هذا الإجراء بيانات المصدر أو ينشئ بيانات جديدة.`, requireReason: false }} revision={pending.revision} publishedReleaseId={activeReleaseId} busy={busy} onCancel={() => setPending(null)} onConfirm={() => { void changeLayer(); }} /> : null}
  </MapPanel>;
}
