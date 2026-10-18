import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { MapError } from "./contracts";
import { layerExportable, ownershipOf } from "./backup";
import { buildGeoPackage, GEOPACKAGE_CONTENT_TYPE, type GeoPackageFeature } from "./geopackage";

const sql = Prisma.sql;
export const FEATURE_EXPORT_FORMATS = ["geojson", "json", "csv", "gpkg"] as const;
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
  geojson: "application/geo+json", json: "application/json", csv: "text/csv; charset=utf-8", gpkg: GEOPACKAGE_CONTENT_TYPE,
};
export const featureExportExtension: Record<FeatureExportFormat, string> = { geojson: "geojson", json: "json", csv: "csv", gpkg: "gpkg" };

type ExportMeta = {
  releaseId: string; layer: string; license: string; ownership: string; attribution: string | null; source: string | null; generatedAt: string;
};
export type FeatureExport = { body: string; contentType: string; count: number; meta: ExportMeta };
export type BinaryFeatureExport = { body: Buffer; contentType: string; count: number; meta: ExportMeta };

const GEOJSON_COLUMNS = sql`
  ST_Y(ST_PointOnSurface(f.geometry)) AS latitude, ST_X(ST_PointOnSurface(f.geometry)) AS longitude,
  ST_AsGeoJSON(f.geometry, 7)::jsonb AS geometry`;
const GEOPACKAGE_COLUMNS = sql`
  ST_AsBinary(f.geometry) AS wkb, ST_XMin(f.geometry) AS "minX", ST_YMin(f.geometry) AS "minY",
  ST_XMax(f.geometry) AS "maxX", ST_YMax(f.geometry) AS "maxY"`;

/** One layer's features of a release, in a stable order; a layer above the limit is refused whole, never cut short. */
async function layerRows<T>(input: { releaseId: string; layerId: string }, columns: Prisma.Sql): Promise<T[]> {
  const rows = await db.$queryRaw<T[]>(sql`
    SELECT f.id, f.label, f.category, f."layerId", f."sourceId", f.aliases, ${columns}
    FROM jenan_map.feature f
    WHERE f."releaseId" = ${input.releaseId}::uuid AND f."layerId" = ${input.layerId}
    ORDER BY f.id LIMIT ${FEATURE_EXPORT_LIMIT + 1}`);
  if (rows.length > FEATURE_EXPORT_LIMIT) throw new MapError("EXPORT_TOO_LARGE", 413);
  return rows;
}

/**
 * Exports one layer's features of a release. Only layers that are bound to the release, and whose licence allows redistribution,
 * can leave the platform; the provenance travels with the data.
 */
export async function exportFeatures(input: { releaseId: string; layerId: string; format: Exclude<FeatureExportFormat, "gpkg"> }): Promise<FeatureExport>;
export async function exportFeatures(input: { releaseId: string; layerId: string; format: "gpkg" }): Promise<BinaryFeatureExport>;
export async function exportFeatures(input: { releaseId: string; layerId: string; format: FeatureExportFormat }): Promise<FeatureExport | BinaryFeatureExport>;
export async function exportFeatures(input: { releaseId: string; layerId: string; format: FeatureExportFormat }): Promise<FeatureExport | BinaryFeatureExport> {
  const [binding] = await db.$queryRaw<Array<{ provenance: { license?: string; attribution?: string; source?: string } | null; status: string }>>(sql`
    SELECT rl.provenance, rl.status FROM jenan_map.release_layer rl
    WHERE rl."releaseId" = ${input.releaseId}::uuid AND rl."layerId" = ${input.layerId}`);
  if (!binding) throw new MapError("LAYER_NOT_BOUND_TO_RELEASE", 404);
  const license = binding.provenance?.license ?? "";
  if (!layerExportable(binding.provenance)) throw new MapError("EXPORT_LICENSE_PERMISSION_REQUIRED", 403);
  const ownership = ownershipOf({ license, author: null });
  const meta = { releaseId: input.releaseId, layer: input.layerId, license, ownership, attribution: binding.provenance?.attribution ?? null, source: binding.provenance?.source ?? null, generatedAt: new Date().toISOString() };
  if (input.format === "gpkg") {
    const rows = await layerRows<Omit<GeoPackageFeature, "wkb" | "aliases"> & { wkb: Uint8Array; aliases: string[] | null }>(input, GEOPACKAGE_COLUMNS);
    const features: GeoPackageFeature[] = rows.map((row) => ({ ...row, wkb: Buffer.from(row.wkb), aliases: row.aliases ?? [] }));
    return { body: await buildGeoPackage(features, { releaseId: input.releaseId, layerId: input.layerId, license, ownership, attribution: meta.attribution, source: meta.source, generatedAt: meta.generatedAt }), contentType: featureExportContentType.gpkg, count: features.length, meta };
  }
  const rows = await layerRows<{ id: string; label: string; category: string; layerId: string | null; sourceId: string | null; aliases: string[] | null; latitude: number; longitude: number; geometry: unknown }>(input, GEOJSON_COLUMNS);
  const features: ExportFeature[] = rows.map((row) => ({ ...row, aliases: row.aliases ?? [] }));
  if (input.format === "csv") return { body: featuresToCsv(features), contentType: featureExportContentType.csv, count: features.length, meta };
  const collection = featuresToGeoJson(features, meta);
  return { body: JSON.stringify(input.format === "json" ? { ...meta, features: features } : collection), contentType: featureExportContentType[input.format], count: features.length, meta };
}
