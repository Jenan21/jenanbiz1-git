import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AcademyEngagementStatus } from "@/generated/prisma/client";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { listAcademyResourceEngagements, setAcademyResourceEngagement } from "@/services/academy/resource-engagement-service";

const idSchema = z.string().cuid();
const commandSchema = z.object({ resourceId: idSchema, status: z.nativeEnum(AcademyEngagementStatus), progressPercent: z.number().int().min(0).max(100).optional() });

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const resourceId = request.nextUrl.searchParams.get("resourceId");
  if (resourceId && !idSchema.safeParse(resourceId).success) return NextResponse.json({ success: false, message: "Valid resourceId required" }, { status: 400 });
  return NextResponse.json({ success: true, engagements: await listAcademyResourceEngagements(user.id, resourceId ? [resourceId] : undefined) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid academy engagement" }, { status: 400 });
  try {
    const engagement = await setAcademyResourceEngagement({ ...parsed.data, userId: user.id });
    return NextResponse.json({ success: true, engagement });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Academy engagement failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}