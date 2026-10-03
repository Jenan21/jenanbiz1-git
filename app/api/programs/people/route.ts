import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { acceptOrganizationInvitation, inviteOrganizationMember, listOrganizationMembers, listPendingOrganizationInvitations } from "@/services/programs/people-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), organizationId: z.string().cuid(), email: z.string().trim().email().max(320) }),
  z.object({ action: z.literal("acceptInvitation"), membershipId: z.string().cuid() }),
]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ success: true, invitations: await listPendingOrganizationInvitations(user.id) });
  if (!organizationId || !z.string().cuid().safeParse(organizationId).success) return NextResponse.json({ success: false, message: "Valid organizationId required" }, { status: 400 });
  try {
    return NextResponse.json({ success: true, members: await listOrganizationMembers(organizationId, user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Members could not be loaded";
    return NextResponse.json({ success: false, message }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid people command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "invite"
      ? await inviteOrganizationMember({ ...input, userId: user.id })
      : await acceptOrganizationInvitation(input.membershipId, user.id);
    return NextResponse.json({ success: true, result }, { status: input.action === "invite" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "People command failed";
    return NextResponse.json({ success: false, message }, { status: message.includes("required") || message.includes("not found") ? 403 : 409 });
  }
}