import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { completeOnboarding } from "@/services/account/onboarding-service";

const interestValues = ["PROJECTS", "ACADEMY", "MARKET", "SOFTWARE", "TALENT", "MARKETING", "ROBOTICS"] as const;
const onboardingSchema = z.object({
  accountType: z.enum(["INDIVIDUAL", "ORGANIZATION"]),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  city: z.string().trim().min(2).max(120),
  interests: z.array(z.enum(interestValues)).min(1).max(interestValues.length),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = onboardingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid onboarding data", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  return NextResponse.json({ success: true, profile: await completeOnboarding(parsed.data, user.id) });
}