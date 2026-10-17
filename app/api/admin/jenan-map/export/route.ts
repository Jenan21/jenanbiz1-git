import { NextRequest } from "next/server";
import { access, failure, json } from "@/services/jenan-map/http";
import { idSchema } from "@/services/jenan-map/contracts";
import { exportManifest } from "@/services/jenan-map/service";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const auth = await access(request, true);
    if (auth.response) return auth.response;
    const parsed = idSchema.safeParse(request.nextUrl.searchParams.get("releaseId"));
    if (!parsed.success) return json({ error: "INVALID_RELEASE_ID" }, 400);
    const response = json(await exportManifest(parsed.data));
    response.headers.set("content-disposition", `attachment; filename="jenan-pro-map-${parsed.data}-manifest.json"`);
    return response;
  } catch (error) { return failure(error); }
}
