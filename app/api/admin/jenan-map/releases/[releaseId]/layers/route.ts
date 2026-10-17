import { NextRequest } from "next/server";
import { z } from "zod";
import { access, boundedBody, failure, json } from "@/services/jenan-map/http";
import { idSchema } from "@/services/jenan-map/contracts";
import { bindLayersSchema, ingestLayerBindings } from "@/services/jenan-map/layer-ingestion";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  try {
    const auth = await access(request, true, true);
    if (auth.response) return auth.response;
    const releaseId = idSchema.parse((await context.params).releaseId);
    const input = bindLayersSchema.parse(JSON.parse((await boundedBody(request, 256 * 1024, "LAYER_BINDINGS_TOO_LARGE")).toString("utf8")));
    return json(await ingestLayerBindings(releaseId, input, auth.user!.id), 201);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: "INVALID_LAYER_BINDINGS" }, 400);
    return failure(error);
  }
}
