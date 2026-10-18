import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { MapError } from "./contracts";
import { mayRedistribute, ownershipOf } from "./backup";

const sql = Prisma.sql;
export const FEATURE_EXPORT_FORMATS = ["geojson", "json", "csv"] as const;
export type FeatureExportFormat = (typeof FEATURE_EXPORT_FORMATS)[number];
export const FEATURE_EXPORT_LIMIT = 100_000;

export type ExportFeature = {
  id: string; label: string; category: string; layerId: string | null; sourceId: string | null; aliases: string[];
  latitude: number; longitude: number; geometry: unknown;
};

/** Spreadsheet formula characters at the start of a cell would run as a formula when the file is opened. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function featuresToCsv(features: ExportFeature[]): string {
  const header = ["id", "label", "category", "layer", "source_id", "aliases", "latitude", "longitude"];
  const rows = features.map((f) => [f.id, f.label, f.category, f.layerId, f.sourceId, f.aliases, f.latitude, f.longitude].map(csvCell).join(","));
  // A byte-order mark makes Excel read the Arabic text as UTF-8.
  return `\uFEFF${header.join(",")}\r\n${rows.join("\r\n")}${rows.length ? "\r\n" : ""}`;
}

export function featuresToGeoJson(features: ExportFeature[], meta: Record<string, unknown>) {
  return {
    type: "FeatureCollection",
    properties: meta,
    features: features.map((f) => ({
      type: "Feature", id: f.id, geometry: f.geometry,
      properties: { label: f.label, category: f.category, layer: f.layerId, sourceId: f.sourceId, aliases: f.aliases },
    })),
  };
}

export const featureExportContentType: Record<FeatureExportFormat, string> = {
  geojson: "application/geo+json", json: "application/json", csv: "text/csv; charset=utf-8",
};

/**
 * Exports one layer's features of a release. Only layers that are bound to the release, and whose licence allows redistribution,
 * can leave the platform; the provenance travels with the data.
 */
export async function exportFeatures(input: { releaseId: string; layerId: string; format: FeatureExportFormat }) {
  const [binding] = await db.$queryRaw<Array<{ provenance: { license?: string; attribution?: string; source?: string } | null; status: string }>>(sql`
    SELECT rl.provenance, rl.status FROM jenan_map.release_layer rl
    WHERE rl."releaseId" = ${input.releaseId}::uuid AND rl."layerId" = ${input.layerId}`);
  if (!binding) throw new MapError("LAYER_NOT_BOUND_TO_RELEASE", 404);
  const license = binding.provenance?.license ?? "";
  const ownership = ownershipOf({ license, author: null });
  if (!mayRedistribute(ownership, license.length > 0)) throw new MapError("EXPORT_LICENSE_PERMISSION_REQUIRED", 403);
  const rows = await db.$queryRaw<Array<{ id: string; label: string; category: string; layerId: string | null; sourceId: string | null; aliases: string[] | null; latitude: number; longitude: number; geometry: unknown }>>(sql`
    SELECT f.id, f.label, f.category, f."layerId", f."sourceId", f.aliases,
      ST_Y(ST_PointOnSurface(f.geometry)) AS latitude, ST_X(ST_PointOnSurface(f.geometry)) AS longitude,
      ST_AsGeoJSON(f.geometry, 7)::jsonb AS geometry
    FROM jenan_map.feature f
    WHERE f."releaseId" = ${input.releaseId}::uuid AND f."layerId" = ${input.layerId}
    ORDER BY f.id LIMIT ${FEATURE_EXPORT_LIMIT + 1}`);
  if (rows.length > FEATURE_EXPORT_LIMIT) throw new MapError("EXPORT_TOO_LARGE", 413);
  const features: ExportFeature[] = rows.map((row) => ({ ...row, aliases: row.aliases ?? [] }));
  const meta = { releaseId: input.releaseId, layer: input.layerId, license, ownership, attribution: binding.provenance?.attribution ?? null, source: binding.provenance?.source ?? null, generatedAt: new Date().toISOString() };
  if (input.format === "csv") return { body: featuresToCsv(features), contentType: featureExportContentType.csv, count: features.length, meta };
  const collection = featuresToGeoJson(features, meta);
  return { body: JSON.stringify(input.format === "json" ? { ...meta, features: features } : collection), contentType: featureExportContentType[input.format], count: features.length, meta };
}
