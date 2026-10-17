import { NextRequest } from "next/server";
import { access, failure, json } from "@/services/jenan-map/http";
import { savedLocationSchema } from "@/services/jenan-map/contracts";
import { saveLocation, savedLocation } from "@/services/jenan-map/service";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const auth = await access(request);
    if (auth.response) return auth.response;
    return json({ location: await savedLocation(auth.user!.id) });
  } catch (error) { return failure(error); }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await access(request, false, true);
    if (auth.response) return auth.response;
    const parsed = savedLocationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "INVALID_LOCATION" }, 400);
    return json({ location: await saveLocation(parsed.data, auth.user!.id) });
  } catch (error) { return failure(error); }
}
