import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { createFundingAssessment, listFundingAssessments } from "@/services/funding/funding-assessment-service";

const assessmentSchema = z.object({
  countryCode: z.enum(["SA", "US"]),
  organizationType: z.enum(["INDIVIDUAL", "ORGANIZATION"]),
  growthStage: z.enum(["IDEA", "EARLY", "OPERATING", "GROWING"]),
  requestedAmountMinor: z.number().int().positive().max(1_000_000_000),
  monthlyRevenueMinor: z.number().int().min(0).max(1_000_000_000),
  yearsOperating: z.number().int().min(0).max(100),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  return NextResponse.json({ success: true, assessments: await listFundingAssessments(user.id) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = assessmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid funding assessment" }, { status: 400 });
  try { return NextResponse.json({ success: true, assessment: await createFundingAssessment(parsed.data, user.id) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Funding assessment failed" }, { status: 500 }); }
}