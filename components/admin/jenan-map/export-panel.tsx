"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { MapEmpty, MapPanel, MapTable } from "./display";
import { mapErrorMessage } from "./snapshot";

export type ExportableLayer = {
  id: string; label: string; releaseId: string; source: string | null; license: string | null; featureCount: number; exportable: boolean;
};

export const EXPORT_FORMATS = [["geojson", "GeoJSON"], ["json", "JSON"], ["csv", "CSV"], ["gpkg", "GeoPackage"]] as const;

export function layerExportUrl(releaseId: string, layerId: string, format: string) {
  return `/api/admin/jenan-map/releases/${encodeURIComponent(releaseId)}/layers/export?layerId=${encodeURIComponent(layerId)}&format=${encodeURIComponent(format)}`;
}

/** Only layers of the published release that hold features can be exported; the server states whether the licence lets them leave. */
export function readExportLayers(payload: unknown): ExportableLayer[] | null {
  const layers = (payload as { layers?: unknown } | null)?.layers;
  if (!Array.isArray(layers)) return null;
  return layers.flatMap((layer) => {
    const item = layer as Partial<ExportableLayer> | null;
    if (!item || typeof item.id !== "string" || typeof item.label !== "string" || typeof item.releaseId !== "string" || !(Number(item.featureCount) > 0)) return [];
    return [{ id: item.id, label: item.label, releaseId: item.releaseId, source: item.source ?? null, license: item.license ?? null, featureCount: Number(item.featureCount), exportable: item.exportable === true }];
  });
}

export function LayerExportTable({ layers }: { layers: ExportableLayer[] }) {
  if (!layers.length) return <MapEmpty>لا توجد طبقات ببيانات قابلة للتصدير في الإصدار المنشور.</MapEmpty>;
  return <MapTable headers={["الطبقة", "المصدر", "الترخيص", "عدد العناصر", "التصدير"]}>
    {layers.map((layer) => <tr key={layer.id}>
      <td>{layer.label}</td>
      <td>{layer.source ?? "غير متاح"}</td>
      <td>{layer.license ?? "غير موثق"}</td>
      <td>{layer.featureCount.toLocaleString("en-US")}</td>
      <td>{layer.exportable
        ? <span className="jenan-map-admin__actions">{EXPORT_FORMATS.map(([format, label]) => <a key={format} href={layerExportUrl(layer.releaseId, layer.id, format)} download>{label}</a>)}</span>
        : "غير متاح: الترخيص غير موثق أو لا يسمح بإعادة التوزيع"}</td>
    </tr>)}
  </MapTable>;
}

export function MapExportPanel({ activeReleaseId, disabled = false }: { activeReleaseId: string | null; disabled?: boolean }) {
  const [layers, setLayers] = useState<ExportableLayer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/jenan-map/layers", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => null);
      const next = readExportLayers(payload);
      if (!response.ok || !next) throw new Error(mapErrorMessage(payload?.error, response.status));
      setLayers(next);
    } catch (error) {
      setLayers(null);
      setMessage(error instanceof Error ? error.message : mapErrorMessage());
    } finally { setLoading(false); }
  }
  const loadOnMount = useEffectEvent(() => { void load(); });
  useEffect(() => {
    const timer = window.setTimeout(loadOnMount, 0);
    return () => window.clearTimeout(timer);
  }, [activeReleaseId]);

  return <MapPanel title="تصدير بيانات الطبقات">
    <p>يُصدَّر محتوى الإصدار المنشور فقط، بصيغ GeoJSON وJSON وCSV وGeoPackage. يحمل كل ملف الترخيص والإسناد والمصدر. الطبقات ذات الترخيص غير الموثق أو المقيّد لا تُصدَّر، وتُسجَّل كل عملية تصدير في سجل التدقيق. ملفات PMTiles والنمط والخطوط تُنزَّل من قسم الإصدارات.</p>
    <Button type="button" variant="secondary" disabled={disabled || loading} onClick={() => void load()}>{loading ? "جارٍ قراءة الطبقات…" : "تحديث قائمة التصدير"}</Button>
    {message ? <p role="status">{message}</p> : null}
    {!activeReleaseId && !loading ? <MapEmpty>لا يوجد إصدار منشور؛ التصدير متاح لطبقات الإصدار المنشور.</MapEmpty>
      : layers ? <LayerExportTable layers={layers} />
        : <MapEmpty>{loading ? "جارٍ قراءة الحالة…" : "قائمة التصدير غير متاحة؛ حالتها غير معروفة."}</MapEmpty>}
  </MapPanel>;
}
