import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { idSchema, MapError } from "./contracts";
import { artifacts } from "./service";
import { bindReleaseLayers, releaseLayerBindingSchema, releaseMapLayers } from "./layers";
import { openArtifact } from "./storage";
import { readJson } from "./validation";

export const bindLayersSchema = z.object({
  layers: z.array(releaseLayerBindingSchema.extend({
    visibility: z.enum(["public", "internal"]),
  })).min(1).max(100),
  confirmation: z.literal("BIND MAP LAYERS"),
}).strict().refine((input) => new Set(input.layers.map((layer) => layer.id)).size === input.layers.length, "Duplicate layer IDs");

export async function ingestLayerBindings(releaseId: string, input: z.infer<typeof bindLayersSchema>, actor: string) {
  idSchema.parse(releaseId);
  input = bindLayersSchema.parse(input);
  return db.$transaction(async (tx) => {
    const [release] = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`SELECT status FROM jenan_map.release WHERE id=${releaseId}::uuid FOR UPDATE`);
    if (!release || !["Draft", "Ready"].includes(release.status)) throw new MapError("IMPORT_REQUIRES_UNREVIEWED_RELEASE");
    const styles = (await artifacts(releaseId, tx)).filter((file) => file.kind === "style" && file.publicSafe);
    if (styles.length !== 1) throw new MapError("ONE_PUBLIC_STYLE_REQUIRED", 422);
    if (input.layers.some((layer) => layer.visibility !== "public")) throw new MapError("INTERNAL_LAYER_IN_PUBLIC_STYLE", 422);
    const handle = await openArtifact(styles[0]);
    let actualStyleIds: string[];
    try {
      const style = await readJson(handle);
      if (!Array.isArray(style.layers)) throw new MapError("ARTIFACT_FORMAT_INVALID", 422);
      actualStyleIds = style.layers.map((layer: { id: string }) => layer.id);
    } finally { await handle.close(); }
    const claimed = new Set(input.layers.flatMap((layer) => layer.styleLayerIds));
    if (actualStyleIds.some((id) => !claimed.has(id))) throw new MapError("UNBOUND_PUBLIC_STYLE_LAYER", 422);
    await bindReleaseLayers(tx, releaseId, input.layers, actualStyleIds);
    const metadata = JSON.stringify({ layerIds: input.layers.map((layer) => layer.id), publicLayerIds: input.layers.filter((layer) => layer.visibility === "public").map((layer) => layer.id) });
    await tx.$executeRaw(Prisma.sql`INSERT INTO jenan_map.audit (id,"actorId",action,"releaseId",metadata)
      VALUES (${randomUUID()}::uuid,${actor},'layers.imported',${releaseId}::uuid,${metadata}::jsonb)`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO "AuditLog" (id,"actorId",action,"entityType","entityId",metadata)
      VALUES (${randomUUID()},${actor},'jenan_map.layers.imported','JenanMapRelease',${releaseId},${metadata}::jsonb)`);
    return { releaseId, layers: await releaseMapLayers(releaseId, tx), reviewRequired: true };
  }, { isolationLevel: "Serializable", timeout: 30_000 });
}
