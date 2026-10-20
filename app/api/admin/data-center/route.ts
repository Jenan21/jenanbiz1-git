import type { NextRequest } from "next/server";
import { adminDataCenterGet, adminDataCenterPost, dataCenterJson } from "@/lib/admin/data-center-http";

export const runtime = "nodejs";

// Every /api/admin/* route answers 403 when there is no administrator session (tests/e2e/admin-control-panel.spec.ts);
// the shared Data Center handlers answer 401 to an anonymous caller, which stays true for /api/data-center.
async function adminBoundary(response: Promise<Response>) {
  const result = await response;
  return result.status === 401 ? dataCenterJson({ success: false, message: "Admin access required" }, 403) : result;
}

export const GET = (request: NextRequest) => adminBoundary(adminDataCenterGet(request));
export const POST = (request: NextRequest) => adminBoundary(adminDataCenterPost(request));
