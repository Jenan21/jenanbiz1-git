import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { listReceivedProjectInvitations, listSentProjectInvitations } from "@/services/projects/project-invitations";

export const dynamic = "force-dynamic";

/** The invitations waiting for the signed-in person, and the ones they have sent from projects they own. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const [received, sent] = await Promise.all([listReceivedProjectInvitations(user.id), listSentProjectInvitations(user.id)]);
  return NextResponse.json({ success: true, received: received.invitations, requiresVerification: received.requiresVerification, sent }, { headers: { "cache-control": "private, no-store" } });
}
