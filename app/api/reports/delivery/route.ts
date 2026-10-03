import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isReportRoute } from "@/lib/reports/report-routes";
import { requestReportEmail } from "@/services/reports/report-delivery-service";

const requestSchema = z.object({ projectId: z.string().cuid().optional(), recipient: z.string().email().max(320), reportPath: z.string().max(200), subject: z.string().trim().min(2).max(240) });

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isReportRoute(parsed.data.reportPath)) return NextResponse.json({ success: false, message: "Invalid report delivery request" }, { status: 400 });
  try {
    const delivery = await requestReportEmail({ ...parsed.data, reportPath: parsed.data.reportPath }, user.id);
    return NextResponse.json({ success: true, delivery, providerState: "AWAITING_APPROVED_PROVIDER" }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report delivery request failed";
    return NextResponse.json({ success: false, message }, { status: message.includes("live source") ? 409 : 404 });
  }
}