import { NextRequest } from "next/server";
import { access, failure, json } from "@/services/jenan-map/http";
import { locationSchema } from "@/services/jenan-map/contracts";
import { validateLocation } from "@/services/jenan-map/service";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const auth = await access(request, false, true);
    if (auth.response) return auth.response;
    const parsed = locationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "INVALID_COORDINATES" }, 400);
    return json(await validateLocation(parsed.data.latitude, parsed.data.longitude, parsed.data.releaseId));
  } catch (error) { return failure(error); }
}
