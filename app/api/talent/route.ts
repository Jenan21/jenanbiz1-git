import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { applyToJob, createJobPosting, getTalentProfile, listDiscoverableTalent, listJobPostings, listMyJobApplications, listOwnedJobApplications, listSavedJobs, listTalentMatches, removeSavedJob, saveJob, saveTalentProfile, scheduleTalentInterview, updateJobApplicationStatus, updateJobPostingStatus, updateTalentInterviewStatus, withdrawJobApplication } from "@/services/talent/job-service";
import { listSoftwareOrganizations } from "@/services/software/software-access";
import { sendTalentMessage } from "@/services/talent/talent-message-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), title: z.string().trim().min(2).max(160), description: z.string().trim().min(20).max(4000), benefits: z.string().trim().max(2000).optional(), conditions: z.string().trim().max(2000).optional(), organizationId: z.string().cuid().optional(), department: z.string().trim().max(120).optional(), countryCode: z.string().trim().length(2).optional(), city: z.string().trim().max(120).optional(), currency: z.string().trim().length(3).optional(), salaryMinMinor: z.number().int().positive().optional(), salaryMaxMinor: z.number().int().positive().optional(), requiredSkills: z.string().trim().max(1000).optional(), questions: z.array(z.object({ prompt: z.string().trim().min(5).max(500), required: z.boolean().optional() })).max(5).optional(), workMode: z.enum(["ON_SITE", "HYBRID", "REMOTE"]) }),
  z.object({ action: z.literal("updateStatus"), jobPostingId: z.string().cuid(), status: z.enum(["PUBLISHED", "CLOSED", "ARCHIVED"]) }),
  z.object({ action: z.literal("apply"), jobPostingId: z.string().cuid(), message: z.string().trim().max(2000).optional(), answers: z.array(z.object({ questionId: z.string().cuid(), answer: z.string().trim().min(1).max(2000) })).max(5).optional(), cvDocumentId: z.string().cuid().optional(), shareProfile: z.boolean().optional() }),
  z.object({ action: z.literal("updateApplicationStatus"), applicationId: z.string().cuid(), status: z.enum(["UNDER_REVIEW", "ACCEPTED", "REJECTED"]), employerNotes: z.string().trim().max(2000).optional() }),
  z.object({ action: z.literal("withdrawApplication"), applicationId: z.string().cuid() }),
  z.object({ action: z.literal("saveJob"), jobPostingId: z.string().cuid() }),
  z.object({ action: z.literal("removeSavedJob"), jobPostingId: z.string().cuid() }),
  z.object({ action: z.literal("scheduleInterview"), applicationId: z.string().cuid(), scheduledAt: z.string().datetime({ offset: true }), durationMinutes: z.number().int().min(15).max(240), mode: z.enum(["VIDEO", "PHONE", "ON_SITE"]), location: z.string().trim().max(500).optional(), notes: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("updateInterviewStatus"), interviewId: z.string().cuid(), status: z.enum(["COMPLETED", "CANCELLED"]) }),
  z.object({ action: z.literal("sendMessage"), applicationId: z.string().cuid(), body: z.string().trim().min(1).max(2000) }),
  z.object({ action: z.literal("saveProfile"), headline: z.string().trim().min(2).max(160), summary: z.string().trim().min(20).max(4000), city: z.string().trim().max(120).optional(), countryCode: z.string().trim().length(2).optional(), yearsExperience: z.number().int().min(0).max(80).optional(), skills: z.string().trim().max(1000).optional(), experience: z.string().trim().max(4000).optional(), education: z.string().trim().max(4000).optional(), desiredWorkModes: z.array(z.enum(["ON_SITE", "HYBRID", "REMOTE"])).max(3).optional(), availability: z.string().trim().max(160).optional(), cvDocumentId: z.string().cuid().optional(), isDiscoverable: z.boolean().optional() }),
]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const [postings, applications, ownApplications, savedJobs, talentProfile, talent, matches, organizations] = await Promise.all([listJobPostings(user.id, {
    countryCode: request.nextUrl.searchParams.get("countryCode") ?? undefined,
    limit: Number(request.nextUrl.searchParams.get("limit") ?? 50),
    offset: Number(request.nextUrl.searchParams.get("offset") ?? 0),
    search: request.nextUrl.searchParams.get("search") ?? undefined,
    status: (request.nextUrl.searchParams.get("status") as "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED" | null) ?? undefined,
    workMode: (request.nextUrl.searchParams.get("workMode") as "ON_SITE" | "HYBRID" | "REMOTE" | null) ?? undefined,
  }), listOwnedJobApplications(user.id), listMyJobApplications(user.id), listSavedJobs(user.id), getTalentProfile(user.id), listDiscoverableTalent(user.id, request.nextUrl.searchParams.get("talentSearch") ?? undefined), listTalentMatches(user.id), listSoftwareOrganizations(user.id)]);
  return NextResponse.json({ success: true, viewerId: user.id, postings, applications, ownApplications, savedJobs, talentProfile, talent, matches, organizations });
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
            ? await updateJobApplicationStatus(input.applicationId, input.status, user.id, input.employerNotes)
            : input.action === "withdrawApplication"
              ? await withdrawJobApplication(input.applicationId, user.id)
              : input.action === "saveJob"
                ? await saveJob(input.jobPostingId, user.id)
              : input.action === "removeSavedJob"
                ? await removeSavedJob(input.jobPostingId, user.id)
              : input.action === "scheduleInterview"
                ? await scheduleTalentInterview(input, user.id)
              : input.action === "updateInterviewStatus"
                ? await updateTalentInterviewStatus(input.interviewId, input.status, user.id)
              : input.action === "sendMessage"
                ? await sendTalentMessage(input, user.id)
              : input.action === "saveProfile"
                ? await saveTalentProfile(input, user.id)
                : await applyToJob(input.jobPostingId, input.message, user.id, { answers: input.answers, cvDocumentId: input.cvDocumentId, shareProfile: input.shareProfile });
      return NextResponse.json({ success: true, result }, { status: parsed.data.action === "create" || parsed.data.action === "apply" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Talent command failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}