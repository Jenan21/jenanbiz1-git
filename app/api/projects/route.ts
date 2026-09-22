import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import {
  createProject,
  addProjectMember,
  createProjectRisk,
  listUserProjectsPage,
  recordProjectDecision,
  recordProjectAssessment,
  saveProjectFinancialPlan,
  startProject,
  updateProjectRiskStatus,
  updateProjectPhase,
} from "@/services/projects/project-service";
import { calculateFeasibility, calculateRiskScore, calculateScenarios } from "@/services/projects/project-calculations";
import { assessProjectQuality } from "@/services/projects/project-quality";
import { saveProjectIntelligenceSnapshot, searchProjectIntelligence } from "@/services/projects/project-intelligence";
import { db } from "@/lib/db";
import { checkProjectRateLimit, type ProjectRateLimitAction } from "@/lib/rate-limit/project-rate-limit";

const projectStatuses = ["DRAFT", "ANALYSIS", "FEASIBILITY", "EVALUATION", "APPROVED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "REJECTED", "ARCHIVED"] as const;
const phaseTypes = ["ANALYSIS", "FEASIBILITY", "EVALUATION", "PLANNING", "EXECUTION", "REVIEW", "COMPLETION"] as const;
const phaseStatuses = ["PENDING", "ACTIVE", "COMPLETED", "BLOCKED", "SKIPPED"] as const;
const assessmentTypes = ["MARKET", "FINANCIAL", "OPERATIONAL", "RISK", "TECHNICAL", "COMPLIANCE"] as const;
const decisionVerdicts = ["APPROVE", "REJECT", "RETURN_FOR_REVIEW"] as const;
const riskStatuses = ["OPEN", "MITIGATING", "ACCEPTED", "CLOSED"] as const;
const projectMemberRoles = ["EDITOR", "REVIEWER", "VIEWER"] as const;
const financialInputs = z.object({
  initialInvestment: z.number().finite().min(0),
  monthlyFixedCosts: z.number().finite().min(0),
  variableCostPerUnit: z.number().finite().min(0),
  pricePerUnit: z.number().finite().min(0),
  monthlyUnits: z.number().int().min(1),
  months: z.number().int().min(1),
  annualDiscountRate: z.number().finite().min(0).max(100).optional(),
  annualInflationRate: z.number().finite().min(0).max(100).optional(),
  taxRate: z.number().finite().min(0).max(100).optional(),
});

function actionRateLimit(action: (typeof commandSchema)["_output"]["action"]): ProjectRateLimitAction | undefined {
  if (action === "create") return "create";
  if (action === "recordAssessment") return "assessment";
  if (action === "calculateFeasibility") return "financial";
  if (action === "searchIntelligence") return "intelligence";
  if (action === "createRisk" || action === "updateRiskStatus" || action === "calculateRisk") return "risk";
  if (action === "recordDecision") return "decision";
  if (action === "addMember") return "membership";
  if (action === "updatePhase") return "phase";
  if (action === "start") return "start";
  return undefined;
}

const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(4000).optional(),
    sector: z.string().trim().max(120).optional(),
    countryCode: z.string().trim().length(2).optional(),
    currency: z.string().trim().length(3).optional(),
  }),
  z.object({
    action: z.literal("searchIntelligence"),
    projectId: z.string().cuid().optional(),
    query: z.string().trim().min(2).max(200),
    countryCode: z.string().trim().length(2).optional(),
    sector: z.string().trim().max(120).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
  z.object({
    action: z.literal("assessQuality"),
    assessments: z.array(z.object({
      type: z.enum(assessmentTypes),
      score: z.number().int().min(0).max(100).nullable(),
      summary: z.string().nullable(),
      source: z.string().nullable(),
    })).max(assessmentTypes.length),
  }),
  z.object({
    action: z.literal("updatePhase"),
    projectId: z.string().cuid(),
    phaseType: z.enum(phaseTypes),
    status: z.enum(phaseStatuses),
    notes: z.string().trim().max(4000).optional(),
  }),
  z.object({
    action: z.literal("recordAssessment"),
    projectId: z.string().cuid(),
    type: z.enum(assessmentTypes),
    score: z.number().int().min(0).max(100),
    summary: z.string().trim().min(3).max(4000),
    source: z.string().trim().min(3).max(500),
  }),
  z.object({ action: z.literal("start"), projectId: z.string().cuid() }),
  z.object({ action: z.literal("addMember"), projectId: z.string().cuid(), email: z.string().trim().email().max(320), role: z.enum(projectMemberRoles) }),
  z.object({ action: z.literal("calculateFeasibility"), inputs: financialInputs, projectId: z.string().cuid().optional(), persist: z.boolean().optional() }),
  z.object({ action: z.literal("recordDecision"), projectId: z.string().cuid(), verdict: z.enum(decisionVerdicts), rationale: z.string().trim().min(10).max(4000) }),
  z.object({ action: z.literal("createRisk"), projectId: z.string().cuid(), category: z.string().trim().min(2).max(120), title: z.string().trim().min(3).max(300), likelihood: z.number().int().min(1).max(5), impact: z.number().int().min(1).max(5), mitigation: z.string().trim().min(3).max(4000), ownerLabel: z.string().trim().min(2).max(160), reviewAt: z.string().datetime().optional() }),
  z.object({ action: z.literal("updateRiskStatus"), projectId: z.string().cuid(), riskId: z.string().cuid(), status: z.enum(riskStatuses) }),
  z.object({
    action: z.literal("calculateRisk"),
    factors: z.object({
      market: z.number().int().min(0).max(100),
      financial: z.number().int().min(0).max(100),
      operational: z.number().int().min(0).max(100),
      technical: z.number().int().min(0).max(100),
      compliance: z.number().int().min(0).max(100),
    }),
  }),
]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const query = request.nextUrl.searchParams;
  const requestedLimit = Number(query.get("limit") ?? "50");
  const requestedOffset = Number(query.get("offset") ?? "0");
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  const offset = Number.isInteger(requestedOffset) ? Math.max(requestedOffset, 0) : 0;
  const status = query.get("status");
  const phase = query.get("phase");
  if (status && !projectStatuses.includes(status as typeof projectStatuses[number])) return NextResponse.json({ success: false, message: "Invalid project status filter" }, { status: 400 });
  if (phase && !phaseTypes.includes(phase as typeof phaseTypes[number])) return NextResponse.json({ success: false, message: "Invalid project phase filter" }, { status: 400 });
  const result = await listUserProjectsPage(user.id, {
    limit,
    offset,
    status: status as typeof projectStatuses[number] | undefined,
    phase: phase as typeof phaseTypes[number] | undefined,
    search: query.get("search")?.slice(0, 160) || undefined,
  });
  return NextResponse.json({ success: true, ...result }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid project command" }, { status: 400 });
  const rateLimitAction = actionRateLimit(parsed.data.action);
  if (rateLimitAction) {
    const decision = await checkProjectRateLimit(rateLimitAction, request, user.id);
    if (!decision.allowed) {
      return NextResponse.json(
        { success: false, message: "Project operation rate limit exceeded" },
        { status: 429, headers: { "retry-after": String(decision.retryAfterSeconds) } },
      );
    }
  }

  try {
    const input = parsed.data;
    const result = input.action === "create"
      ? await createProject(input, user.id)
      : input.action === "addMember"
        ? await addProjectMember(input.projectId, input, user.id)
      : input.action === "updatePhase"
        ? await updateProjectPhase(input.projectId, input.phaseType, input.status, user.id, input.notes)
        : input.action === "recordAssessment"
          ? await recordProjectAssessment(input.projectId, input, user.id)
          : input.action === "calculateFeasibility"
            ? await (async () => {
                const result = { base: calculateFeasibility(input.inputs), scenarios: calculateScenarios(input.inputs) };
                if (input.persist) {
                  if (!input.projectId) throw new Error("Project id is required to save a financial plan");
                  await saveProjectFinancialPlan(input.projectId, { inputs: input.inputs, baseCase: result.base, scenarios: result.scenarios }, user.id);
                }
                return result;
              })()
            : input.action === "recordDecision"
              ? await recordProjectDecision(input.projectId, input, user.id)
              : input.action === "createRisk"
                ? await createProjectRisk(input.projectId, { ...input, reviewAt: input.reviewAt ? new Date(input.reviewAt) : undefined }, user.id)
                : input.action === "updateRiskStatus"
                  ? await updateProjectRiskStatus(input.projectId, input.riskId, input.status, user.id)
            : input.action === "calculateRisk"
              ? calculateRiskScore(input.factors)
              : input.action === "assessQuality"
                ? assessProjectQuality(input.assessments)
                : input.action === "searchIntelligence"
                  ? await (async () => {
                      const result = await searchProjectIntelligence(input);
                      if (input.projectId) {
                        const project = await db.project.findFirst({
                          where: {
                            id: input.projectId,
                            OR: [
                              { createdById: user.id },
                              { members: { some: { userId: user.id, role: { in: ["OWNER", "EDITOR"] } } } },
                            ],
                          },
                          select: { id: true },
                        });
                        if (!project) throw new Error("Project not found");
                        await saveProjectIntelligenceSnapshot(project.id, input.query, result);
                      }
                      return result;
                    })()
              : await startProject(input.projectId, user.id);
    return NextResponse.json({ success: true, result }, { status: input.action === "create" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project command failed";
    const status = message === "Project not found" ? 404 : 409;
    return NextResponse.json({ success: false, message }, { status });
  }
}
