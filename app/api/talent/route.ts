import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { applyToJob, createJobPosting, listJobPostings, listOwnedJobApplications, updateJobApplicationStatus, updateJobPostingStatus } from "@/services/talent/job-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), title: z.string().trim().min(2).max(160), description: z.string().trim().min(20).max(4000), department: z.string().trim().max(120).optional(), countryCode: z.string().trim().length(2).optional(), city: z.string().trim().max(120).optional(), workMode: z.enum(["ON_SITE", "HYBRID", "REMOTE"]) }),
  z.object({ action: z.literal("updateStatus"), jobPostingId: z.string().cuid(), status: z.enum(["PUBLISHED", "CLOSED", "ARCHIVED"]) }),
  z.object({ action: z.literal("apply"), jobPostingId: z.string().cuid(), message: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("updateApplicationStatus"), applicationId: z.string().cuid(), status: z.enum(["UNDER_REVIEW", "ACCEPTED", "REJECTED"]) }),
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const [postings, applications] = await Promise.all([listJobPostings(user.id), listOwnedJobApplications(user.id)]);
  return NextResponse.json({ success: true, viewerId: user.id, postings, applications });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid talent command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "create"
      ? await createJobPosting(input, user.id)
      : input.action === "updateStatus"
        ? await updateJobPostingStatus(input.jobPostingId, input.status, user.id)
        : input.action === "updateApplicationStatus"
          ? await updateJobApplicationStatus(input.applicationId, input.status, user.id)
          : await applyToJob(input.jobPostingId, input.message, user.id);
    return NextResponse.json({ success: true, result }, { status: parsed.data.action === "create" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Talent command failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}