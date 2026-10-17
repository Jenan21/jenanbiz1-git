import { NextRequest } from "next/server";
import { access, failure, json } from "@/services/jenan-map/http";
import { changeMapLayer, layerChangeSchema, mapLayers } from "@/services/jenan-map/layers";
import { MapError } from "@/services/jenan-map/contracts";

export const runtime = "nodejs";

async function readChange(request: NextRequest) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2048) {
        await reader.cancel();
        throw new MapError("INVALID_LAYER_CHANGE", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await access(request, true);
    if (auth.response) return auth.response;
    try {
      return json({ layers: await mapLayers() });
    } catch {
      return json({ layers: null, available: false, error: "MAP_UNAVAILABLE" });
    }
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await access(request, true, true);
    if (auth.response) return auth.response;
    const input = layerChangeSchema.safeParse(await readChange(request));
    if (!input.success) return json({ error: "INVALID_LAYER_CHANGE" }, 400);
    return json(await changeMapLayer(input.data, auth.user!.id));
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "INVALID_LAYER_CHANGE" }, 400);
    return failure(error);
  }
}
