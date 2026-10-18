import { NextRequest } from "next/server";
import { access, failure, json } from "@/services/jenan-map/http";
import { idSchema, MapError, mapPreferencesSchema } from "@/services/jenan-map/contracts";
import { mapPreferences, saveMapPreferences } from "@/services/jenan-map/preferences";

export const runtime = "nodejs";

async function preferenceBody(request: NextRequest) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        throw new MapError("PAYLOAD_TOO_LARGE", 413);
      }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally { reader.releaseLock(); }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await access(request);
    if (auth.response) return auth.response;
    const releaseId = idSchema.safeParse(request.nextUrl.searchParams.get("releaseId"));
    if (!releaseId.success) return json({ error: "INVALID_RELEASE_ID" }, 400);
    return json({ settings: await mapPreferences(auth.user!.id, releaseId.data) });
  } catch (error) { return failure(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await access(request, false, true);
    if (auth.response) return auth.response;
    const parsed = mapPreferencesSchema.safeParse(await preferenceBody(request));
    if (!parsed.success) return json({ error: "INVALID_PREFERENCES" }, 400);
    return json({ settings: await saveMapPreferences(auth.user!.id, parsed.data) });
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "INVALID_PREFERENCES" }, 400);
    return failure(error);
  }
}
