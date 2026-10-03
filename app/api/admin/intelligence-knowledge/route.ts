import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { type Prisma } from "@/generated/prisma/client";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import {
  compareKnowledgeVersions,
  createKnowledgeVersion,
  createVersionedKnowledge,
  getKnowledgeSnapshot,
  linkKnowledgeEvidence,
  reviewKnowledgeVersion,
  rollbackKnowledge,
} from "@/services/intelligence/knowledge-version-service";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), confidence: z.number().int().min(0).max(100).optional(), content: z.string().trim().min(2).max(100_000), missionId: z.string().cuid().optional(), references: z.array(z.record(z.string(), z.unknown())).max(100).optional(), source: z.string().trim().min(2).max(500), sourcePublishedAt: z.string().datetime().optional(), sourceUrl: z.string().url().max(1000).optional(), title: z.string().trim().min(2).max(240) }),
  z.object({ action: z.literal("createVersion"), changeSummary: z.string().trim().min(2).max(2000), confidence: z.number().int().min(0).max(100), content: z.string().trim().min(2).max(100_000), knowledgeId: z.string().cuid(), references: z.array(z.record(z.string(), z.unknown())).max(100).optional(), source: z.string().trim().min(2).max(500), sourcePublishedAt: z.string().datetime().optional(), sourceUrl: z.string().url().max(1000).optional(), title: z.string().trim().min(2).max(240) }),
  z.object({ action: z.literal("review"), knowledgeId: z.string().cuid(), notes: z.string().trim().min(3).max(4000), state: z.enum(["IN_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"]) }),
  z.object({ action: z.literal("rollback"), knowledgeId: z.string().cuid(), reason: z.string().trim().min(3).max(4000), targetVersion: z.number().int().min(1) }),
  z.object({ action: z.literal("linkEvidence"), evidenceId: z.string().cuid(), knowledgeId: z.string().cuid(), note: z.string().trim().max(2000).optional(), version: z.number().int().min(1).optional() }),
]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  const query = request.nextUrl.searchParams;
  const knowledgeId = query.get("knowledgeId");
  if (!knowledgeId || !z.string().cuid().safeParse(knowledgeId).success) return NextResponse.json({ success: false, message: "Valid knowledgeId is required" }, { status: 400 });
  if (query.has("from") || query.has("to")) {
    const from = Number(query.get("from"));
    const to = Number(query.get("to"));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) return NextResponse.json({ success: false, message: "Valid from/to versions are required" }, { status: 400 });
    try {
      return NextResponse.json({ success: true, diff: await compareKnowledgeVersions(knowledgeId, from, to) });
    } catch (error) {
      return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Knowledge diff failed" }, { status: 404 });
    }
  }
  const knowledge = await getKnowledgeSnapshot(knowledgeId);
  return knowledge ? NextResponse.json({ success: true, knowledge }) : NextResponse.json({ success: false, message: "Knowledge entry not found" }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid knowledge command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "create" ? await createVersionedKnowledge({ confidence: input.confidence, content: input.content, missionId: input.missionId, references: input.references as Prisma.InputJsonValue | undefined, source: input.source, sourcePublishedAt: input.sourcePublishedAt ? new Date(input.sourcePublishedAt) : undefined, sourceUrl: input.sourceUrl, title: input.title }, user.id)
      : input.action === "createVersion" ? await createKnowledgeVersion({ changeSummary: input.changeSummary, confidence: input.confidence, content: input.content, knowledgeId: input.knowledgeId, references: input.references as Prisma.InputJsonValue | undefined, source: input.source, sourcePublishedAt: input.sourcePublishedAt ? new Date(input.sourcePublishedAt) : undefined, sourceUrl: input.sourceUrl, title: input.title }, user.id)
      : input.action === "review" ? await reviewKnowledgeVersion(input, user.id)
      : input.action === "rollback" ? await rollbackKnowledge(input, user.id)
      : await linkKnowledgeEvidence(input, user.id);
    return NextResponse.json({ success: true, result }, { status: input.action === "create" || input.action === "createVersion" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge command failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}