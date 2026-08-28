import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getAcademyDashboard } from "@/lib/academy/academy-dashboard";
import {
  addSkillPrerequisite,
  createCandidateBatch,
  createCurriculumChangeProposal,
  createCurriculumVersion,
  createGeographyNode,
  createWorkforceDemand,
  enrollProfileInCohort,
  recordGeographicKnowledge,
  refreshGeographicKnowledgeFreshness,
  refreshCertificationExpiry,
  refreshWorkforceGap,
} from "@/services/academy/workforce-service";
import {
  completeLocalSandboxLabRun,
  createSandboxLabRun,
  enqueueAcademyWork,
  ensureAcademyQueue,
} from "@/services/academy/queue-service";
import { requireAcademyScope } from "@/services/academy/academy-access";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("createDemand"), title: z.string().trim().min(2).max(160), requiredCount: z.number().int().min(0), priority: z.number().int().min(0).max(100), specializationId: z.string().cuid().optional(), skillId: z.string().cuid().optional(), expectedGraduationAt: z.string().datetime().optional() }),
  z.object({ action: z.literal("refreshGap"), demandId: z.string().cuid() }),
  z.object({ action: z.literal("createBatch"), demandId: z.string().cuid().optional(), name: z.string().trim().min(2).max(160), requestedCount: z.number().int().min(0), priority: z.number().int().min(0).max(100), profileIds: z.array(z.string().cuid()).max(10_000).optional() }),
  z.object({ action: z.literal("enrollCohort"), profileId: z.string().cuid(), cohortId: z.string().cuid() }),
  z.object({ action: z.literal("addPrerequisite"), skillId: z.string().cuid(), prerequisiteId: z.string().cuid() }),
  z.object({ action: z.literal("createGeography"), parentId: z.string().cuid().optional(), type: z.enum(["WORLD", "COUNTRY", "STATE", "REGION", "CITY", "DISTRICT", "TOWN", "VILLAGE", "LOCAL_ZONE", "CUSTOM"]), name: z.string().trim().min(1).max(160), code: z.string().trim().max(64).optional() }),
  z.object({ action: z.literal("recordGeographicKnowledge"), geographyNodeId: z.string().cuid(), title: z.string().trim().min(2).max(200), content: z.string().trim().min(2).max(20_000), source: z.string().trim().min(2).max(400), sourceType: z.enum(["PUBLIC", "LICENSED", "AUTHORIZED", "AGGREGATED", "ANONYMIZED"]), verificationState: z.enum(["VERIFIED", "HIGH_CONFIDENCE", "ESTIMATED", "OUTDATED", "UNKNOWN"]), confidence: z.number().int().min(0).max(100), industry: z.string().trim().max(160).optional() }),
  z.object({ action: z.literal("createCurriculumVersion"), programId: z.string().cuid(), changeSummary: z.string().trim().min(2).max(4_000), source: z.string().trim().max(400).optional() }),
  z.object({ action: z.literal("proposeCurriculumChange"), academyId: z.string().cuid(), curriculumVersionId: z.string().cuid().optional(), sourceExperienceId: z.string().cuid().optional(), title: z.string().trim().min(2).max(200), rationale: z.string().trim().min(2).max(8_000) }),
  z.object({ action: z.literal("refreshCertificationExpiry") }),
  z.object({ action: z.literal("refreshGeographicKnowledgeFreshness") }),
  z.object({ action: z.literal("ensureQueue"), academyId: z.string().cuid(), key: z.string().trim().min(2).max(100), name: z.string().trim().min(2).max(160), concurrency: z.number().int().min(1).max(100) }),
  z.object({ action: z.literal("enqueueWork"), queueId: z.string().cuid(), kind: z.enum(["ADMISSION", "ENROLLMENT", "EXAMINATION", "CERTIFICATION", "RETRAINING", "RECERTIFICATION", "CURRICULUM_CHANGE", "GEOGRAPHY_REFRESH"]), idempotencyKey: z.string().trim().min(4).max(200), profileId: z.string().cuid().optional(), priority: z.number().int().min(0).max(100).optional(), maxAttempts: z.number().int().min(1).max(20).optional() }),
  z.object({ action: z.literal("createSandboxRun"), profileId: z.string().cuid(), labId: z.string().cuid(), idempotencyKey: z.string().trim().min(4).max(200) }),
  z.object({ action: z.literal("completeLocalSandboxRun"), runId: z.string().cuid(), passed: z.boolean(), evidence: z.record(z.string(), z.unknown()) }),
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }

  return NextResponse.json({ success: true, academy: await getAcademyDashboard() });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid academy command" }, { status: 400 });

  try {
    const input = parsed.data;
    const actorId = user.id;
    if (!hasPlatformAdminAccess(user.systemRole)) {
      if (input.action === "ensureQueue") {
        await requireAcademyScope({ userId: user.id, systemRole: user.systemRole, academyId: input.academyId, scope: "WORKFORCE_MANAGER" });
      } else if (input.action === "proposeCurriculumChange") {
        await requireAcademyScope({ userId: user.id, systemRole: user.systemRole, academyId: input.academyId, scope: "CURRICULUM_MANAGER" });
      } else {
        return NextResponse.json({ success: false, message: "Platform admin access required for this command" }, { status: 403 });
      }
    }
    const result =
      input.action === "createDemand" ? await createWorkforceDemand({ ...input, expectedGraduationAt: input.expectedGraduationAt ? new Date(input.expectedGraduationAt) : undefined }, actorId) :
      input.action === "refreshGap" ? await refreshWorkforceGap(input.demandId, actorId) :
      input.action === "createBatch" ? await createCandidateBatch(input, actorId) :
      input.action === "enrollCohort" ? await enrollProfileInCohort(input.profileId, input.cohortId, actorId) :
      input.action === "addPrerequisite" ? await addSkillPrerequisite(input.skillId, input.prerequisiteId, actorId) :
      input.action === "createGeography" ? await createGeographyNode(input, actorId) :
      input.action === "recordGeographicKnowledge" ? await recordGeographicKnowledge(input, actorId) :
      input.action === "createCurriculumVersion" ? await createCurriculumVersion(input, actorId) :
      input.action === "proposeCurriculumChange" ? await createCurriculumChangeProposal(input, actorId) :
      input.action === "ensureQueue" ? await ensureAcademyQueue(input, actorId) :
      input.action === "enqueueWork" ? await enqueueAcademyWork(input, actorId) :
      input.action === "createSandboxRun" ? await createSandboxLabRun(input, actorId) :
      input.action === "completeLocalSandboxRun" ? await completeLocalSandboxLabRun({ ...input, evidence: input.evidence as Prisma.InputJsonValue }, actorId) :
      input.action === "refreshCertificationExpiry" ? await refreshCertificationExpiry(actorId) :
      await refreshGeographicKnowledgeFreshness(actorId);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Academy command failed";
    return NextResponse.json({ success: false, message }, { status: 409 });
  }
}