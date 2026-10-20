import { parseMapPreferences } from "@/services/jenan-map/preferences-shape";
import { mapRequest } from "./api";
import type { MapLayer, MapPreferences } from "./types";

export function availableLayerIds(layers: MapLayer[]) {
  return layers.filter((layer) => layer.available && layer.styleLayerIds?.length).map((layer) => layer.id);
}

export function restoreMapPreferences(value: unknown, releaseId: string, layers: MapLayer[]): MapPreferences {
  if (!value || typeof value !== "object") throw new Error("إعدادات الخريطة المحفوظة غير صالحة.");
  const { revision, ...settings } = value as MapPreferences;
  const parsed = parseMapPreferences({ ...settings, expectedRevision: revision });
  if (!parsed || revision < 1 || parsed.releaseId !== releaseId) throw new Error("إعدادات الخريطة المحفوظة غير مرتبطة بالإصدار.");
  const allowed = new Set(availableLayerIds(layers));
  return { ...settings, revision, visibleLayers: parsed.visibleLayers.filter((id) => allowed.has(id)) };
}

export async function loadMapPreferences(releaseId: string, layers: MapLayer[], signal?: AbortSignal) {
  const { settings } = await mapRequest<{ settings: unknown }>(
    `/api/jenan-map/preferences?releaseId=${encodeURIComponent(releaseId)}`, { signal },
  );
  return settings === null ? null : restoreMapPreferences(settings, releaseId, layers);
}

export async function persistMapPreferences(settings: MapPreferences, layers: MapLayer[], signal?: AbortSignal) {
  const { revision, ...values } = settings;
  const result = await mapRequest<{ settings: unknown }>("/api/jenan-map/preferences", {
    method: "PUT", signal, body: JSON.stringify({ ...values, expectedRevision: revision }),
  });
  return restoreMapPreferences(result.settings, settings.releaseId, layers);
}
