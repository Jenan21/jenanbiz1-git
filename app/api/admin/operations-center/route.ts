import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { findAdminOperationRoute } from "@/lib/admin/admin-operations-routes";
import { createAdminCandidateBatch, createAdminMission, getAdminOperationSnapshot, reviewRobotInformationRequest } from "@/services/admin/admin-operations-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createMission"), name: z.string().trim().min(2).max(160), description: z.string().trim().max(4000).optional(), requiredIntelligence: z.number().int().min(0).max(100).optional() }),
  z.object({ action: z.literal("createBatch"), name: z.string().trim().min(2).max(160), requestedCount: z.number().int().min(0).max(10_000), priority: z.number().int().min(0).max(100).optional() }),
  z.object({ action: z.literal("reviewInformationRequest"), requestId: z.string().cuid(), status: z.enum(["REVIEWED", "CLOSED"]) }),
]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  const definition = findAdminOperationRoute(request.nextUrl.searchParams.get("path") ?? "");
  if (!definition) return NextResponse.json({ success: false, message: "Admin operation route not found" }, { status: 404 });
  return NextResponse.json({ success: true, snapshot: await getAdminOperationSnapshot(definition) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid admin operation command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "createMission" ? await createAdminMission(input, user.id)
      : input.action === "createBatch" ? await createAdminCandidateBatch(input, user.id)
      : await reviewRobotInformationRequest(input, user.id);
    return NextResponse.json({ success: true, result }, { status: input.action === "reviewInformationRequest" ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin operation failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}