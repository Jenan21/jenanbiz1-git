import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import {
  activateOrganizationProgram,
  createOrganizationForUser,
  listOrganizationPrograms,
  updateOrganizationProgramStatus,
} from "@/services/programs/organization-program-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createOrganization"), name: z.string().trim().min(2).max(160) }),
  z.object({ action: z.literal("activate"), organizationId: z.string().cuid(), key: z.enum(["FINANCE", "PEOPLE", "FIELD_OPERATIONS", "FLEET"]) }),
  z.object({ action: z.literal("updateStatus"), organizationId: z.string().cuid(), programId: z.string().cuid(), status: z.enum(["SUSPENDED", "ARCHIVED"]) }),
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  return NextResponse.json({ success: true, organizations: await listOrganizationPrograms(user.id) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid programs command" }, { status: 400 });

  try {
    const input = parsed.data;
    const result = input.action === "createOrganization"
      ? await createOrganizationForUser({ ...input, userId: user.id })
      : input.action === "activate"
      ? await activateOrganizationProgram({ ...input, userId: user.id })
      : await updateOrganizationProgramStatus({ ...input, userId: user.id });
    return NextResponse.json({ success: true, result }, { status: input.action === "createOrganization" || input.action === "activate" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Programs command failed";
    return NextResponse.json({ success: false, message }, { status: message.includes("required") ? 403 : 404 });
  }
}