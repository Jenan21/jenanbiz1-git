import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { publicErrorMessage } from "@/lib/http/safe-error";
import { AccountApprovalError, approveAccount, listPendingAccounts, rejectAccount } from "@/services/auth/account-approval-service";

const noStore = { "cache-control": "private, no-store" };

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), userId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("reject"), userId: z.string().min(1).max(64) }),
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  try {
    const [users, pending] = await Promise.all([
      db.user.findMany({
        include: { profile: true, memberships: { include: { organization: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      listPendingAccounts(),
    ]);

    return NextResponse.json(
      {
        success: true,
        pending,
        users: users.map((account) => ({
          id: account.id,
          email: account.email,
          status: account.status,
          systemRole: account.systemRole,
          displayName: account.profile?.displayName ?? "Unknown",
          locale: account.profile?.locale ?? "ar",
          organizationCount: account.memberships.length,
          organizations: account.memberships.map((membership) => membership.organization.name),
        })),
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("admin users route failed", error);
    return NextResponse.json(
      {
        success: false,
        message: "Unable to load user data",
      },
      { status: 500 },
    );
  }
}

/** Approves or declines an account that is waiting for the owner. */
export async function POST(request: NextRequest) {
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid user command" }, { status: 400 });
  try {
    const command = parsed.data;
    const result =
      command.action === "approve"
        ? await approveAccount(command.userId, user.id, { schedule: (task) => after(task) })
        : await rejectAccount(command.userId, user.id);
    return NextResponse.json({ success: true, result }, { headers: noStore });
  } catch (error) {
    if (error instanceof AccountApprovalError) return NextResponse.json({ success: false, message: error.message }, { status: 409 });
    return NextResponse.json({ success: false, message: publicErrorMessage(error, "User command failed") }, { status: 409 });
  }
}
