import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { createRobotInformationRequest, listPublicRobots, listRobotInformationRequests, recommendPublicRobots } from "@/services/robotics/public-robotics-service";

const requestSchema = z.object({ action: z.literal("requestInformation"), robotId: z.string().cuid(), task: z.string().trim().min(10).max(2000), sector: z.string().trim().max(160).optional(), location: z.string().trim().max(160).optional(), environment: z.string().trim().max(160).optional(), budgetMinor: z.number().int().positive().max(2_000_000_000).optional() });

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const filters = { query: request.nextUrl.searchParams.get("query") ?? undefined, sector: request.nextUrl.searchParams.get("sector") ?? undefined, location: request.nextUrl.searchParams.get("location") ?? undefined, environment: request.nextUrl.searchParams.get("environment") ?? undefined };
  const budget = Number(request.nextUrl.searchParams.get("budgetMinor") ?? 0) || undefined;
  const [robots, recommendations, requests] = await Promise.all([listPublicRobots(filters), recommendPublicRobots(filters, budget), listRobotInformationRequests(user.id)]);
  return NextResponse.json({ success: true, robots, recommendations, requests, executionAvailableToUser: false, pricingSourceConnected: false });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid robotics request" }, { status: 400 });
  try {
    return NextResponse.json({ success: true, result: await createRobotInformationRequest(parsed.data, user.id) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Robotics request failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}