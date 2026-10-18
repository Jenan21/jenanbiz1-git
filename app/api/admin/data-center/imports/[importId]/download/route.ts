import type { NextRequest } from "next/server";
import { dataCenterOriginalGet } from "@/lib/admin/data-center-http";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ importId: string }> }) {
  return dataCenterOriginalGet(request, (await context.params).importId);
}
