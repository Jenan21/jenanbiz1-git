import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import {
  createProject,
  listUserProjects,
  recordProjectAssessment,
  startProject,
  updateProjectPhase,
} from "@/services/projects/project-service";
import { calculateFeasibility, calculateRiskScore, calculateScenarios } from "@/services/projects/project-calculations";
import { assessProjectQuality } from "@/services/projects/project-quality";
import { saveProjectIntelligenceSnapshot, searchProjectIntelligence } from "@/services/projects/project-intelligence";
import { db } from "@/lib/db";

const phaseTypes = ["ANALYSIS", "FEASIBILITY", "EVALUATION", "PLANNING", "EXECUTION", "REVIEW", "COMPLETION"] as const;
const phaseStatuses = ["PENDING", "ACTIVE", "COMPLETED", "BLOCKED", "SKIPPED"] as const;
const assessmentTypes = ["MARKET", "FINANCIAL", "OPERATIONAL", "RISK", "TECHNICAL", "COMPLIANCE"] as const;
const financialInputs = z.object({
  initialInvestment: z.number().finite().min(0),
  monthlyFixedCosts: z.number().finite().min(0),
  variableCostPerUnit: z.number().finite().min(0),
  pricePerUnit: z.number().finite().min(0),
  monthlyUnits: z.number().int().min(1),
  months: z.number().int().min(1),
});

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
    score: z.number().int().min(0).max(100).optional(),
    summary: z.string().trim().max(4000).optional(),
    source: z.string().trim().max(500).optional(),
  }),
  z.object({ action: z.literal("start"), projectId: z.string().cuid() }),
  z.object({ action: z.literal("calculateFeasibility"), inputs: financialInputs }),
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

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  return NextResponse.json({ success: true, projects: await listUserProjects(user.id) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid project command" }, { status: 400 });

  try {
    const input = parsed.data;
    const result = input.action === "create"
      ? await createProject(input, user.id)
      : input.action === "updatePhase"
        ? await updateProjectPhase(input.projectId, input.phaseType, input.status, user.id, input.notes)
        : input.action === "recordAssessment"
          ? await recordProjectAssessment(input.projectId, input, user.id)
          : input.action === "calculateFeasibility"
            ? { base: calculateFeasibility(input.inputs), scenarios: calculateScenarios(input.inputs) }
            : input.action === "calculateRisk"
              ? calculateRiskScore(input.factors)
              : input.action === "assessQuality"
                ? assessProjectQuality(input.assessments)
                : input.action === "searchIntelligence"
                  ? await (async () => {
                      const result = await searchProjectIntelligence(input);
                      if (input.projectId) {
                        const project = await db.project.findFirst({ where: { id: input.projectId, createdById: user.id }, select: { id: true } });
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
