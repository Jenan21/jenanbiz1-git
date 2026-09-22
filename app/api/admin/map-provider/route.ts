import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";

const configurationSchema = z.object({
  providerLabel: z.string().trim().min(2).max(160),
  status: z.enum(["DRAFT", "APPROVED", "SUSPENDED"]),
  contractReference: z.string().trim().max(500).optional(),
  operationalOwner: z.string().trim().max(160).optional(),
});

function environmentReadiness() {
  return {
    tileUrlConfigured: Boolean(process.env.NEXT_PUBLIC_MAP_TILE_URL?.trim()),
    attributionConfigured: Boolean(process.env.NEXT_PUBLIC_MAP_ATTRIBUTION?.trim()),
    providerLabelConfigured: Boolean(process.env.NEXT_PUBLIC_MAP_PROVIDER_LABEL?.trim()),
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  const review = await db.mapProviderReview.findUnique({ where: { key: "project-map" } });
  return NextResponse.json({
    success: true,
    environment: environmentReadiness(),
    review: review && {
      providerLabel: review.providerLabel,
      status: review.status,
      contractReference: review.contractReference,
      operationalOwner: review.operationalOwner,
      reviewedAt: review.reviewedAt?.toISOString() ?? null,
    },
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = configurationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid map provider configuration" }, { status: 400 });

  const input = parsed.data;
  const review = await db.mapProviderReview.upsert({
    where: { key: "project-map" },
    create: { key: "project-map", ...input, reviewedById: user.id, reviewedAt: new Date() },
    update: { ...input, reviewedById: user.id, reviewedAt: new Date() },
  });
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "map_provider.review.updated",
      entityType: "MapProviderReview",
      entityId: review.id,
      metadata: { status: review.status, providerLabel: review.providerLabel },
    },
  });
  return NextResponse.json({
    success: true,
    review: {
      providerLabel: review.providerLabel,
      status: review.status,
      contractReference: review.contractReference,
      operationalOwner: review.operationalOwner,
      reviewedAt: review.reviewedAt?.toISOString() ?? null,
    },
  });
}