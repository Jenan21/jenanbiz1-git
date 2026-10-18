import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { MapError, mapPreferencesSchema } from "./contracts";
import { publishedRelease } from "./service";
import { releaseMapLayers } from "./layers";

export type MapPreferences = Omit<z.infer<typeof mapPreferencesSchema>, "expectedRevision"> & { revision: number };

export async function mapPreferences(userId: string, releaseId: string) {
  await publishedRelease(releaseId);
  const [settings] = await db.$queryRaw<MapPreferences[]>(Prisma.sql`
    SELECT "releaseId", radius, "visibleLayers", viewport, revision
    FROM jenan_map.preference WHERE "userId" = ${userId} AND "releaseId" = ${releaseId}::uuid`);
  return settings ?? null;
}

export async function saveMapPreferences(userId: string, input: z.infer<typeof mapPreferencesSchema>) {
  return db.$transaction(async (tx) => {
    const [runtime] = await tx.$queryRaw<{ publishedReleaseId: string | null; status: string }[]>(Prisma.sql`
      SELECT "publishedReleaseId", status FROM jenan_map.runtime WHERE id = 1 FOR UPDATE`);
    if (runtime?.publishedReleaseId !== input.releaseId || runtime.status !== "enabled")
      throw new MapError("RELEASE_NOT_PUBLISHED", 409);
    const allowed = new Set((await releaseMapLayers(input.releaseId, tx))
      .filter((layer) => layer.available && layer.styleLayerIds.length > 0)
      .map((layer) => layer.id));
    if (input.visibleLayers.some((id) => !allowed.has(id))) throw new MapError("LAYER_DATA_UNAVAILABLE", 400);
    const [existing] = await tx.$queryRaw<{ revision: number }[]>(Prisma.sql`
      SELECT revision FROM jenan_map.preference
      WHERE "userId" = ${userId} AND "releaseId" = ${input.releaseId}::uuid FOR UPDATE`);
    if ((existing?.revision ?? 0) !== input.expectedRevision) throw new MapError("STALE_REVISION");
    const [settings] = await tx.$queryRaw<MapPreferences[]>(Prisma.sql`
      INSERT INTO jenan_map.preference ("userId", "releaseId", radius, "visibleLayers", viewport)
      VALUES (${userId}, ${input.releaseId}::uuid, ${input.radius},
        ${JSON.stringify(input.visibleLayers)}::jsonb, ${JSON.stringify(input.viewport)}::jsonb)
      ON CONFLICT ("userId", "releaseId") DO UPDATE SET
        radius = EXCLUDED.radius, "visibleLayers" = EXCLUDED."visibleLayers", viewport = EXCLUDED.viewport,
        revision = jenan_map.preference.revision + 1, "updatedAt" = now()
      RETURNING "releaseId", radius, "visibleLayers", viewport, revision`);
    await tx.auditLog.create({
      data: {
        actorId: userId, action: "jenan_map.preferences.updated", entityType: "JenanMapPreference",
        entityId: input.releaseId, metadata: { releaseId: input.releaseId, revision: settings.revision },
      },
    });
    return settings;
  });
}
