import { NextRequest } from "next/server";
import { access, failure, json } from "@/services/jenan-map/http";
import { idSchema, locationSchema } from "@/services/jenan-map/contracts";
import { validateLocation } from "@/services/jenan-map/service";

export const runtime = "nodejs";
const previewLocationSchema = locationSchema.extend({ releaseId: idSchema });
export async function POST(request: NextRequest) {
  try {
    const auth = await access(request, true, true);
    if (auth.response) return auth.response;
    const parsed = previewLocationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "INVALID_PREVIEW_COORDINATES" }, 400);
    return json(await validateLocation(parsed.data.latitude, parsed.data.longitude, parsed.data.releaseId, true));
  } catch (error) { return failure(error); }
}
