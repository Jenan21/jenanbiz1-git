import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import {
  createProject,
  addProjectMember,
  createProjectComplianceItem,
  createProjectRisk,
  createProjectVendor,
  listUserProjectsPage,
  recordProjectDecision,
  recordProjectAssessment,
  saveProjectFeasibilityStudySection,
  saveProjectFinancialPlan,
  startProject,
  updateProjectRiskStatus,
  updateProjectComplianceStatus,
  updateProjectPhase,
  updateProjectVendorStatus,
} from "@/services/projects/project-service";
import { calculateFeasibility, calculateRiskScore, calculateScenarios } from "@/services/projects/project-calculations";
import { assessProjectQuality } from "@/services/projects/project-quality";
import { saveProjectIntelligenceSnapshot, searchProjectIntelligence } from "@/services/projects/project-intelligence";
import { db } from "@/lib/db";
import { checkProjectRateLimit, type ProjectRateLimitAction } from "@/lib/rate-limit/project-rate-limit";
import {
  runProjectAnalysis,
  saveProjectAnalysisInput,
} from "@/services/projects/project-analysis";
import { saveProjectLaunchPlanSection } from "@/services/projects/project-launch";

const projectStatuses = ["DRAFT", "ANALYSIS", "FEASIBILITY", "EVALUATION", "APPROVED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "REJECTED", "ARCHIVED"] as const;
const phaseTypes = ["ANALYSIS", "FEASIBILITY", "EVALUATION", "PLANNING", "EXECUTION", "REVIEW", "COMPLETION"] as const;
const phaseStatuses = ["PENDING", "ACTIVE", "COMPLETED", "BLOCKED", "SKIPPED"] as const;
const assessmentTypes = ["MARKET", "FINANCIAL", "OPERATIONAL", "RISK", "TECHNICAL", "COMPLIANCE"] as const;
const decisionVerdicts = ["APPROVE", "REJECT", "RETURN_FOR_REVIEW"] as const;
const riskStatuses = ["OPEN", "MITIGATING", "ACCEPTED", "CLOSED"] as const;
const projectMemberRoles = ["EDITOR", "REVIEWER", "VIEWER"] as const;
const complianceKinds = ["LICENSE", "PROCEDURE"] as const;
const complianceStatuses = ["REQUIRED", "IN_PROGRESS", "SUBMITTED", "APPROVED", "REJECTED", "NOT_APPLICABLE"] as const;
const vendorKinds = ["VENDOR", "PARTNER"] as const;
const vendorStatuses = ["PROSPECT", "APPROVED", "ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
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
const projectAnalysisInput = z.object({
  idea: z.string().trim().min(10).max(4000),
  city: z.string().trim().min(2).max(160),
  targetAudience: z.enum(["CONSUMERS", "BUSINESSES", "YOUTH", "FAMILIES"]),
  budgetRange: z
    .enum(["UNDER_100K", "BETWEEN_100K_500K", "BETWEEN_500K_1M", "ABOVE_1M"])
    .optional(),
});
const projectLaunchPayload = z.discriminatedUnion("section", [
  z.object({
    section: z.literal("BASICS"),
    data: z.object({
      projectName: z.string().trim().min(2).max(160),
      idea: z.string().trim().min(10).max(4000),
      entityType: z.enum(["LLC", "SOLE_PROPRIETORSHIP", "JOINT_STOCK", "NONPROFIT", "OTHER"]),
      sector: z.string().trim().min(2).max(120),
      city: z.string().trim().min(2).max(160),
      targetAudience: z.string().trim().min(2).max(500),
      initialCapital: z.number().finite().positive().max(1_000_000_000_000),
      durationMonths: z.number().int().min(1).max(120),
      teamSize: z.number().int().min(1).max(10000),
    }),
  }),
  z.object({
    section: z.literal("BUDGET"),
    data: z.object({
      totalBudget: z.number().finite().positive().max(1_000_000_000_000),
      contingencyPercent: z.number().finite().min(0).max(100),
      expectedMonthlyRevenue: z.number().finite().min(0).max(1_000_000_000_000).optional(),
      expectedMonthlyOperatingCosts: z.number().finite().min(0).max(1_000_000_000_000).optional(),
      allocations: z.array(z.object({
        category: z.enum(["FOUNDATION", "EQUIPMENT", "MARKETING", "PEOPLE", "SYSTEMS", "CONTINGENCY"]),
        amount: z.number().finite().min(0).max(1_000_000_000_000),
      })).min(1).max(6),
    }).superRefine((data, context) => {
      if (new Set(data.allocations.map((item) => item.category)).size !== data.allocations.length) {
        context.addIssue({ code: "custom", message: "Budget categories must be unique", path: ["allocations"] });
      }
      if (data.allocations.reduce((sum, item) => sum + item.amount, 0) > data.totalBudget) {
        context.addIssue({ code: "custom", message: "Budget allocations exceed the total", path: ["allocations"] });
      }
    }),
  }),
  z.object({
    section: z.literal("TEAM"),
    data: z.object({
      roles: z.array(z.object({
        roleName: z.string().trim().min(2).max(160),
        responsibilities: z.string().trim().min(3).max(1000),
        requiredCount: z.number().int().min(1).max(100),
      })).min(1).max(30),
    }).superRefine((data, context) => {
      if (new Set(data.roles.map((role) => role.roleName.toLocaleLowerCase())).size !== data.roles.length) {
        context.addIssue({ code: "custom", message: "Launch role names must be unique", path: ["roles"] });
      }
    }),
  }),
  z.object({
    section: z.literal("TIMELINE"),
    data: z.object({
      startDate: z.string().date(),
      targetLaunchDate: z.string().date(),
      milestones: z.array(z.object({
        type: z.enum(["LICENSES", "SETUP", "VENDORS", "TEAM", "PILOT", "LAUNCH"]),
        startDate: z.string().date(),
        endDate: z.string().date(),
        status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "BLOCKED"]),
      })).length(6),
    }).superRefine((data, context) => {
      if (data.targetLaunchDate <= data.startDate) {
        context.addIssue({ code: "custom", message: "Launch date must follow the start date", path: ["targetLaunchDate"] });
      }
      if (new Set(data.milestones.map((milestone) => milestone.type)).size !== data.milestones.length) {
        context.addIssue({ code: "custom", message: "Launch milestone types must be unique", path: ["milestones"] });
      }
      data.milestones.forEach((milestone, index) => {
        if (milestone.endDate < milestone.startDate) {
          context.addIssue({ code: "custom", message: "Milestone end date must follow its start date", path: ["milestones", index, "endDate"] });
        }
        if (milestone.startDate < data.startDate || milestone.endDate > data.targetLaunchDate) {
          context.addIssue({ code: "custom", message: "Milestone dates must stay within the launch timeline", path: ["milestones", index] });
        }
      });
    }),
  }),
  z.object({
    section: z.literal("TASKS"),
    data: z.object({
      tasks: z.array(z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(2).max(240),
        status: z.enum(["TODO", "IN_PROGRESS", "DONE", "BLOCKED"]),
        dueDate: z.string().date().optional(),
        assigneeUserId: z.string().cuid().optional(),
      })).max(100),
    }).superRefine((data, context) => {
      if (new Set(data.tasks.map((task) => task.id)).size !== data.tasks.length) {
        context.addIssue({ code: "custom", message: "Launch task identifiers must be unique", path: ["tasks"] });
      }
    }),
  }),
]);
const feasibilityStudyPayload = z.discriminatedUnion("section", [
  z.object({
    section: z.literal("GENERAL"),
    data: z.object({
      projectType: z.string().trim().min(2).max(120),
      legalNature: z.string().trim().min(2).max(120),
      size: z.enum(["SMALL", "MEDIUM", "LARGE"]),
      location: z.string().trim().min(2).max(200),
      description: z.string().trim().min(10).max(4000),
    }),
  }),
  z.object({
    section: z.literal("MARKET"),
    data: z.object({
      scope: z.enum(["LOCAL", "REGIONAL", "NATIONAL", "INTERNATIONAL"]),
      customerSegment: z.string().trim().min(3).max(1000),
      demandTrend: z.string().trim().min(3).max(1000),
      marketSizeNotes: z.string().trim().min(3).max(2000),
      competitorNotes: z.string().trim().min(3).max(2000),
      pricingNotes: z.string().trim().min(3).max(2000),
      distributionNotes: z.string().trim().min(3).max(2000),
    }),
  }),
  z.object({
    section: z.literal("MARKETING"),
    data: z.object({
      objectives: z.array(z.enum(["AWARENESS", "ACQUISITION", "RETENTION", "SALES"])).min(1).max(4),
      strategy: z.enum(["DIGITAL", "DIRECT", "PARTNERSHIPS", "MIXED"]),
      budget: z.number().finite().min(0),
      channels: z.array(z.enum(["SEARCH", "SOCIAL", "EMAIL", "CONTENT", "EVENTS", "PARTNERS"])).min(1).max(6),
      awarenessMonths: z.number().int().min(0).max(36),
      launchMonths: z.number().int().min(0).max(36),
      growthMonths: z.number().int().min(0).max(36),
    }),
  }),
  z.object({
    section: z.literal("TECHNICAL"),
    data: z.object({
      facilityType: z.string().trim().min(2).max(160),
      facilityArea: z.number().finite().min(0),
      equipmentCount: z.number().int().min(0).max(100000),
      productsServices: z.string().trim().min(3).max(3000),
      rawMaterials: z.string().trim().min(3).max(3000),
      staffingPlan: z.string().trim().min(3).max(3000),
      organizationNotes: z.string().trim().min(3).max(3000),
    }),
  }),
  z.object({ section: z.literal("FINANCIAL"), data: financialInputs }),
  z.object({
    section: z.literal("SWOT"),
    data: z.object({
      strengths: z.string().trim().min(3).max(3000),
      weaknesses: z.string().trim().min(3).max(3000),
      opportunities: z.string().trim().min(3).max(3000),
      threats: z.string().trim().min(3).max(3000),
      recommendation: z.string().trim().min(10).max(4000),
    }),
  }),
  z.object({
    section: z.literal("TIMELINE"),
    data: z.object({
      startDate: z.string().date(),
      durationMonths: z.number().int().min(1).max(120),
      preparationMonths: z.number().int().min(0).max(120),
      launchMonths: z.number().int().min(0).max(120),
      growthMonths: z.number().int().min(0).max(120),
      milestones: z.string().trim().min(3).max(4000),
    }),
  }),
]);

function actionRateLimit(action: (typeof commandSchema)["_output"]["action"]): ProjectRateLimitAction | undefined {
  if (action === "create") return "create";
  if (action === "recordAssessment") return "assessment";
  if (action === "calculateFeasibility") return "financial";
  if (action === "saveFeasibilityStudy") return "assessment";
  if (action === "saveProjectAnalysis") return "assessment";
  if (action === "saveProjectLaunchPlan") return "phase";
  if (action === "runProjectAnalysis") return "intelligence";
  if (action === "searchIntelligence") return "intelligence";
  if (action === "createRisk" || action === "updateRiskStatus" || action === "calculateRisk") return "risk";
  if (action === "recordDecision") return "decision";
  if (action === "addMember") return "membership";
  if (action === "createCompliance" || action === "updateComplianceStatus" || action === "createVendor" || action === "updateVendorStatus") return "phase";
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
  z.object({ action: z.literal("createCompliance"), projectId: z.string().cuid(), kind: z.enum(complianceKinds), title: z.string().trim().min(2).max(240), authority: z.string().trim().max(240).optional(), reference: z.string().trim().max(500).optional(), dueAt: z.string().datetime().optional(), notes: z.string().trim().max(4000).optional() }),
  z.object({ action: z.literal("updateComplianceStatus"), projectId: z.string().cuid(), itemId: z.string().cuid(), status: z.enum(complianceStatuses) }),
  z.object({ action: z.literal("createVendor"), projectId: z.string().cuid(), kind: z.enum(vendorKinds), name: z.string().trim().min(2).max(240), category: z.string().trim().max(160).optional(), contactEmail: z.string().trim().email().max(320).optional(), notes: z.string().trim().max(4000).optional() }),
  z.object({ action: z.literal("updateVendorStatus"), projectId: z.string().cuid(), vendorId: z.string().cuid(), status: z.enum(vendorStatuses) }),
  z.object({ action: z.literal("calculateFeasibility"), inputs: financialInputs, projectId: z.string().cuid().optional(), persist: z.boolean().optional() }),
  z.object({
    action: z.literal("saveFeasibilityStudy"),
    projectId: z.string().cuid(),
    payload: feasibilityStudyPayload,
  }),
  z.object({
    action: z.literal("saveProjectAnalysis"),
    projectId: z.string().cuid(),
    input: projectAnalysisInput,
  }),
  z.object({
    action: z.literal("runProjectAnalysis"),
    projectId: z.string().cuid(),
  }),
  z.object({
    action: z.literal("saveProjectLaunchPlan"),
    projectId: z.string().cuid(),
    payload: projectLaunchPayload,
  }),
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
      : input.action === "createCompliance"
        ? await createProjectComplianceItem(input.projectId, { ...input, dueAt: input.dueAt ? new Date(input.dueAt) : undefined }, user.id)
      : input.action === "updateComplianceStatus"
        ? await updateProjectComplianceStatus(input.projectId, input.itemId, input.status, user.id)
      : input.action === "createVendor"
        ? await createProjectVendor(input.projectId, input, user.id)
      : input.action === "updateVendorStatus"
        ? await updateProjectVendorStatus(input.projectId, input.vendorId, input.status, user.id)
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
            : input.action === "saveFeasibilityStudy"
              ? await saveProjectFeasibilityStudySection(
                  input.projectId,
                  input.payload,
                  user.id,
                )
            : input.action === "saveProjectAnalysis"
              ? await saveProjectAnalysisInput(
                  input.projectId,
                  input.input,
                  user.id,
                )
            : input.action === "runProjectAnalysis"
              ? await runProjectAnalysis(input.projectId, user.id)
            : input.action === "saveProjectLaunchPlan"
              ? await saveProjectLaunchPlanSection(input.projectId, input.payload, user.id)
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
    return NextResponse.json({ success: true, result }, { status: input.action === "create" || input.action === "createCompliance" || input.action === "createVendor" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Project command failed";
    const status = message === "Project not found" ? 404 : 409;
    return NextResponse.json({ success: false, message }, { status });
  }
}
