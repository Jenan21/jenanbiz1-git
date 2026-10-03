import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { createFieldAssignment, listFieldAssignments, listFieldAssignees, updateFieldAssignmentStatus } from "@/services/programs/field-operations-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), organizationId: z.string().cuid(), title: z.string().trim().min(2).max(200), description: z.string().trim().max(4_000).optional(), dueAt: z.string().datetime().optional(), assigneeMemberId: z.string().cuid().optional() }),
  z.object({ action: z.literal("updateStatus"), organizationId: z.string().cuid(), assignmentId: z.string().cuid(), status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]) }),
]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const organizationId = request.nextUrl.searchParams.get("organizationId");
  if (!organizationId || !z.string().cuid().safeParse(organizationId).success) return NextResponse.json({ success: false, message: "Valid organizationId required" }, { status: 400 });
  try {
    const [assignments, members] = await Promise.all([
      listFieldAssignments(organizationId, user.id),
      listFieldAssignees(organizationId, user.id),
    ]);
    return NextResponse.json({ success: true, assignments, members });
  }
  catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Assignments could not be loaded" }, { status: 403 }); }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid field operations command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "create" ? await createFieldAssignment({ ...input, dueAt: input.dueAt ? new Date(input.dueAt) : undefined, userId: user.id }) : await updateFieldAssignmentStatus({ ...input, userId: user.id });
    return NextResponse.json({ success: true, result }, { status: input.action === "create" ? 201 : 200 });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Field operations command failed" }, { status: 403 }); }
}