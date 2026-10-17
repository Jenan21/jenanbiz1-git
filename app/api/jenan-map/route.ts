import { NextRequest } from "next/server";
import { access, json } from "@/services/jenan-map/http";
import { manifest } from "@/services/jenan-map/service";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const auth = await access(request);
    if (auth.response) return auth.response;
    return json(await manifest());
  } catch {
    return json({ status: "unavailable", release: null, reason: "MAP_NOT_PROVISIONED_OR_UNAVAILABLE" });
  }
}
