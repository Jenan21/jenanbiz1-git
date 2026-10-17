import { NextRequest } from "next/server";
import { access, failure, json } from "@/services/jenan-map/http";
import { idSchema } from "@/services/jenan-map/contracts";
import { previewManifest } from "@/services/jenan-map/service";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const auth = await access(request, true);
    if (auth.response) return auth.response;
    const parsed = idSchema.safeParse(request.nextUrl.searchParams.get("releaseId"));
    if (!parsed.success) return json({ error: "INVALID_RELEASE_ID" }, 400);
    return json(await previewManifest(parsed.data));
  } catch (error) { return failure(error); }
}
