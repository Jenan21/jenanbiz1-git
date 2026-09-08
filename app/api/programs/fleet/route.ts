import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { createFleetVehicle, listFleetVehicles, updateFleetVehicleStatus } from "@/services/programs/fleet-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), organizationId: z.string().cuid(), label: z.string().trim().min(2).max(160), plateNumber: z.string().trim().min(2).max(32) }),
  z.object({ action: z.literal("updateStatus"), organizationId: z.string().cuid(), vehicleId: z.string().cuid(), status: z.enum(["MAINTENANCE", "INACTIVE"]) }),
]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId || !z.string().cuid().safeParse(organizationId).success) return NextResponse.json({ success: false, message: "Valid organizationId required" }, { status: 400 });
  try { return NextResponse.json({ success: true, vehicles: await listFleetVehicles(organizationId, user.id) }); }
  catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Fleet could not be loaded" }, { status: 403 }); }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid fleet command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "create" ? await createFleetVehicle({ ...input, userId: user.id }) : await updateFleetVehicleStatus({ ...input, userId: user.id });
    return NextResponse.json({ success: true, result }, { status: input.action === "create" ? 201 : 200 });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Fleet command failed" }, { status: 403 }); }
}