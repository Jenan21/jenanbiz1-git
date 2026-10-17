import { Prisma } from "@/generated/prisma/client";
import { db, type DbExecutor } from "@/lib/db";
import { z } from "zod";
import { MapError } from "./contracts";

export const layerChangeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z-]{0,63}$/),
  enabled: z.boolean(),
  expectedRevision: z.number().int().nonnegative(),
  expectedReleaseId: z.string().uuid().nullable().optional(),
  confirmation: z.literal("CHANGE LAYER"),
}).strict();

export type StoredMapLayer = {
  id: string;
  label: string;
  enabled: boolean;
  visibility: "public" | "internal";
  status: "unavailable" | "ready" | "warning";
  releaseId: string | null;
  source: string | null;
  version: string | null;
  confidence: number | null;
  updatedAt: Date | null;
  revision: number;
  styleLayerIds: string[];
  searchCategories: string[];
  sourceDate: Date | null;
  license: string | null;
};

type LayerExecutor = Pick<DbExecutor, "$queryRaw" | "$executeRaw">;
const styleId = z.string().trim().min(1).max(200);
export const releaseLayerBindingSchema = z.object({
  id: z.string().regex(/^[a-z][a-z-]{0,63}$/),
  styleLayerIds: z.array(styleId).min(1).max(500),
  searchCategories: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  visibility: z.enum(["public", "internal"]).default("public"),
  confidence: z.number().finite().min(0).max(1).nullable().default(null),
}).strict();
export const releaseLayerBindingsSchema = z.array(releaseLayerBindingSchema).min(1).max(100)
  .refine((bindings) => new Set(bindings.map((binding) => binding.id)).size === bindings.length, "Duplicate layer IDs");
export type ReleaseLayerBinding = z.infer<typeof releaseLayerBindingSchema>;

export function validateReleaseLayerBindings(input: unknown, actualStyleIds: string[]): ReleaseLayerBinding[] {
  const parsed = releaseLayerBindingsSchema.safeParse(input);
  if (!parsed.success) throw new MapError("INVALID_LAYER_BINDING", 400);
  const ids = new Set<string>();
  const claimedStyles = new Set<string>();
  const categories = new Set<string>();
  const actual = new Set(actualStyleIds);
  for (const binding of parsed.data) {
    if (ids.has(binding.id)) throw new MapError("INVALID_LAYER_BINDING", 400);
    ids.add(binding.id);
    for (const id of binding.styleLayerIds) {
      if (!actual.has(id) || claimedStyles.has(id)) throw new MapError("INVALID_LAYER_BINDING", 400);
      claimedStyles.add(id);
    }
    for (const category of binding.searchCategories) {
      if (categories.has(category)) throw new MapError("INVALID_LAYER_BINDING", 400);
      categories.add(category);
    }
  }
  return parsed.data;
}

export async function bindReleaseLayers(executor: LayerExecutor, releaseId: string, input: unknown, actualStyleIds: string[]) {
  const bindings = validateReleaseLayerBindings(input, actualStyleIds);
  assertPublicStyleLayerBindings(bindings, actualStyleIds);
  const catalog = await executor.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM jenan_map.layer`);
  const known = new Set(catalog.map((layer) => layer.id));
  if (bindings.some((binding) => !known.has(binding.id))) throw new MapError("INVALID_LAYER_BINDING", 400);
  for (const binding of bindings) {
    await executor.$executeRaw(Prisma.sql`
      INSERT INTO jenan_map.release_layer ("releaseId", "layerId", visibility, "styleLayerIds", "searchCategories", confidence)
      VALUES (${releaseId}::uuid, ${binding.id}, ${binding.visibility},
        ARRAY[${Prisma.join(binding.styleLayerIds)}]::text[],
        ${binding.searchCategories.length ? Prisma.sql`ARRAY[${Prisma.join(binding.searchCategories)}]::text[]` : Prisma.sql`ARRAY[]::text[]`}, ${binding.confidence})`);
  }
}

export function assertPublicStyleLayerBindings(bindings: { visibility: string; styleLayerIds: string[] }[], actualStyleIds: string[]) {
  if (bindings.some((binding) => binding.visibility !== "public")) throw new MapError("INTERNAL_LAYER_NOT_PUBLIC");
  const claimed = new Set(bindings.flatMap((binding) => binding.styleLayerIds));
  if (!actualStyleIds.length || actualStyleIds.some((id) => !claimed.has(id))) throw new MapError("UNBOUND_PUBLIC_STYLE_LAYER");
}

function projectedLayers(releaseId: string | null) {
  return Prisma.sql`SELECT l.id, l.label, COALESCE(b.enabled, false) AS enabled,
    COALESCE(b.visibility, l.visibility) AS visibility, COALESCE(b.status, 'unavailable') AS status,
    b."releaseId", CASE WHEN b."releaseId" IS NOT NULL THEN r.source END AS source,
    CASE WHEN b."releaseId" IS NOT NULL THEN r.version END AS version,
    b.confidence, b."updatedAt", COALESCE(b.revision, l.revision) AS revision,
    COALESCE(b."styleLayerIds", ARRAY[]::text[]) AS "styleLayerIds",
    COALESCE(b."searchCategories", ARRAY[]::text[]) AS "searchCategories",
    r."sourceDate", r.license
    FROM jenan_map.layer l
    LEFT JOIN jenan_map.release_layer b ON b."layerId" = l.id AND b."releaseId" = ${releaseId}::uuid
    LEFT JOIN jenan_map.release r ON r.id = b."releaseId"`;
}

export async function releaseManifestLayers(releaseId: string, executor: LayerExecutor = db) {
  const rows = await executor.$queryRaw<StoredMapLayer[]>(Prisma.sql`${projectedLayers(releaseId)}
    WHERE b.visibility = 'public'
      AND cardinality(b."styleLayerIds") > 0 ORDER BY l.id`);
  return rows.filter((layer) => layer.visibility === "public" && layer.releaseId === releaseId && layer.styleLayerIds?.length)
    .map((layer) => {
      let available = false;
      try { assertLayerCanEnable(layer, releaseId); available = layer.enabled; } catch { /* Unavailable public bindings must still hide their immutable style IDs. */ }
      return { ...layer, available };
    });
}

export async function releaseMapLayers(releaseId: string, executor: LayerExecutor = db) {
  return (await releaseManifestLayers(releaseId, executor)).filter((layer) => layer.available);
}

export function readyLayerSearchFilter(releaseId: string, layerIds?: string[]) {
  const requested = layerIds === undefined ? Prisma.sql`` : Prisma.sql`
    AND (lb."layerId" = 'base' ${layerIds.length ? Prisma.sql`OR lb."layerId" IN (${Prisma.join(layerIds)})` : Prisma.sql``})`;
  return Prisma.sql`EXISTS (SELECT 1 FROM jenan_map.release_layer lb
    WHERE lb."releaseId" = ${releaseId}::uuid AND lb.visibility = 'public'
      AND lb.status = 'ready' AND lb.enabled AND cardinality(lb."styleLayerIds") > 0
      AND f.category = ANY(lb."searchCategories") ${requested})`;
}

export function assertLayerCanEnable(layer: StoredMapLayer, activeReleaseId: string | null) {
  if (layer.status !== "ready" || !layer.source || !layer.version ||
      !activeReleaseId || layer.releaseId !== activeReleaseId || !layer.styleLayerIds?.length) {
    throw new MapError("LAYER_DATA_UNAVAILABLE");
  }
  if (layer.visibility !== "public") throw new MapError("INTERNAL_LAYER_NOT_PUBLIC");
}

export async function mapLayers() {
  const [runtime] = await db.$queryRaw<{ publishedReleaseId: string | null }[]>(
    Prisma.sql`SELECT "publishedReleaseId" FROM jenan_map.runtime WHERE id = 1`);
  return db.$queryRaw<StoredMapLayer[]>(Prisma.sql`${projectedLayers(runtime?.publishedReleaseId ?? null)} ORDER BY l.id`);
}

export async function changeMapLayer(input: z.infer<typeof layerChangeSchema>, actorId: string) {
  try {
    return await db.$transaction(async (tx) => {
    const [runtime] = await tx.$queryRaw<{ publishedReleaseId: string | null }[]>(
      Prisma.sql`SELECT "publishedReleaseId" FROM jenan_map.runtime WHERE id = 1 FOR UPDATE`,
    );
    const [layer] = await tx.$queryRaw<StoredMapLayer[]>(Prisma.sql`
      ${projectedLayers(runtime?.publishedReleaseId ?? null)} WHERE l.id = ${input.id}`);
    if (!layer) throw new MapError("LAYER_NOT_FOUND", 404);
    if (layer.releaseId && input.expectedReleaseId !== layer.releaseId) throw new MapError("STALE_PUBLISHED_POINTER");
    if (input.expectedReleaseId !== undefined && input.expectedReleaseId !== (runtime?.publishedReleaseId ?? null)) throw new MapError("STALE_PUBLISHED_POINTER");
    if (layer.revision !== input.expectedRevision) throw new MapError("STALE_REVISION");
    if (input.enabled) assertLayerCanEnable(layer, runtime?.publishedReleaseId ?? null);
    if (layer.releaseId) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE jenan_map.release_layer SET enabled = ${input.enabled}, revision = revision + 1,
        "updatedAt" = now() WHERE "layerId" = ${input.id} AND "releaseId" = ${layer.releaseId}::uuid`);
    } else {
      await tx.$executeRaw(Prisma.sql`
        UPDATE jenan_map.layer SET enabled = false, revision = revision + 1, "updatedAt" = now() WHERE id = ${input.id}`);
    }
    await tx.auditLog.create({
      data: {
        actorId,
        action: "jenan_map.layer.updated",
        entityType: "JenanMapLayer",
        entityId: input.id,
        metadata: { enabled: input.enabled, releaseId: layer.releaseId, result: "success" },
      },
    });
    return { id: input.id, enabled: input.enabled, revision: layer.revision + 1 };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const adapter = error.meta?.driverAdapterError as { cause?: { originalCode?: unknown } } | undefined;
      const code = String(error.meta?.code ?? adapter?.cause?.originalCode ?? "");
      if (error.code === "P2034" || (error.code === "P2010" && ["40001", "40P01"].includes(code))) {
        throw new MapError("CONCURRENT_CHANGE_RETRY");
      }
    }
    throw error;
  }
}
