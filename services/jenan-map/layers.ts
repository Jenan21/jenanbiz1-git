import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { z } from "zod";
import { MapError } from "./contracts";

export const layerChangeSchema = z.object({
  id: z.string().regex(/^[a-z][a-z-]{0,63}$/),
  enabled: z.boolean(),
  expectedRevision: z.number().int().nonnegative(),
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
};

export function assertLayerCanEnable(layer: StoredMapLayer, activeReleaseId: string | null) {
  if (layer.status !== "ready" || !layer.source || !layer.version ||
      !activeReleaseId || layer.releaseId !== activeReleaseId) {
    throw new MapError("LAYER_DATA_UNAVAILABLE");
  }
  if (layer.visibility !== "public") throw new MapError("INTERNAL_LAYER_NOT_PUBLIC");
}

export async function mapLayers() {
  return db.$queryRaw<StoredMapLayer[]>(Prisma.sql`SELECT * FROM jenan_map.layer ORDER BY id`);
}

export async function changeMapLayer(input: z.infer<typeof layerChangeSchema>, actorId: string) {
  return db.$transaction(async (tx) => {
    const [runtime] = await tx.$queryRaw<{ publishedReleaseId: string | null }[]>(
      Prisma.sql`SELECT "publishedReleaseId" FROM jenan_map.runtime WHERE id = 1 FOR UPDATE`,
    );
    const [layer] = await tx.$queryRaw<StoredMapLayer[]>(
      Prisma.sql`SELECT * FROM jenan_map.layer WHERE id = ${input.id} FOR UPDATE`,
    );
    if (!layer) throw new MapError("LAYER_NOT_FOUND", 404);
    if (layer.revision !== input.expectedRevision) throw new MapError("STALE_REVISION");
    if (input.enabled) assertLayerCanEnable(layer, runtime?.publishedReleaseId ?? null);
    await tx.$executeRaw(Prisma.sql`
      UPDATE jenan_map.layer SET enabled = ${input.enabled}, revision = revision + 1,
      "updatedAt" = now() WHERE id = ${input.id}`);
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
}
