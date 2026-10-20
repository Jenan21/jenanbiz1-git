import { NextRequest } from "next/server";
import { artifactResponse } from "@/services/jenan-map/http";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ artifactId: string }> }) {
  return artifactResponse(request, (await context.params).artifactId, true);
}
