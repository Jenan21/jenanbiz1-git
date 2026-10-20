import { NextRequest } from "next/server";
import { access, json, logUnexpected } from "@/services/jenan-map/http";
import { manifest } from "@/services/jenan-map/service";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const auth = await access(request);
    if (auth.response) return auth.response;
    return json(await manifest());
  } catch (error) {
    // The screen is told the map is unavailable and why in general terms; the cause stays in the server log.
    logUnexpected(error);
    return json({ status: "unavailable", release: null, reason: "MAP_NOT_PROVISIONED_OR_UNAVAILABLE" });
  }
}
