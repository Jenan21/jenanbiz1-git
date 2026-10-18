import { NextRequest } from "next/server";
import { releaseAssetResponse } from "@/services/jenan-map/http";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ releaseId: string; asset: string[] }> }) {
  const { releaseId, asset } = await context.params;
  return releaseAssetResponse(request, releaseId, asset, false);
}
