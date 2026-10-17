import { NextRequest } from "next/server";
import { glyphResponse } from "@/services/jenan-map/http";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ releaseId: string; glyphPath: string[] }> }) {
  const { releaseId, glyphPath } = await context.params;
  return glyphResponse(request, releaseId, glyphPath, true);
}
