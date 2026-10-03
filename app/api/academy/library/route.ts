import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AcademyResourceApprovalState, AcademyResourceKind, type Prisma } from "@/generated/prisma/client";
import { hasPlatformAdminAccess } from "@/lib/auth/authorization";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import {
  addAcademyResourceAttachment,
  createAcademyExamQuestion,
  createAcademyResource,
  createAcademyResourceVersion,
  listAcademyResources,
  reviewAcademyResource,
} from "@/services/academy/content-library-service";

const referenceSchema = z.object({
  title: z.string().trim().min(2).max(240),
  url: z.string().url().max(1000).optional(),
  source: z.string().trim().max(240).optional(),
  publishedAt: z.string().datetime().optional(),
});
const contentSchema = z.record(z.string(), z.unknown());
const optionalDate = z.string().datetime().optional();
const academyRecordIdSchema = z.string().trim().min(1).max(191).regex(/^[A-Za-z0-9_-]+$/);

const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("createResource"), academyId: z.string().cuid().optional(), authorName: z.string().trim().min(2).max(200).optional(), category: z.string().trim().max(120).optional(), content: contentSchema, courseId: z.string().cuid().optional(), kind: z.nativeEnum(AcademyResourceKind), language: z.string().trim().min(2).max(12).optional(), references: z.array(referenceSchema).max(100).optional(), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160), sourceName: z.string().trim().max(240).optional(), sourcePublishedAt: optionalDate, sourceUrl: z.string().url().max(1000).optional(), summary: z.string().trim().max(4000).optional(), title: z.string().trim().min(2).max(240),
  }),
  z.object({
    action: z.literal("createVersion"), authorName: z.string().trim().min(2).max(200).optional(), changeSummary: z.string().trim().min(2).max(2000), content: contentSchema, references: z.array(referenceSchema).max(100).optional(), resourceId: z.string().cuid(), sourceName: z.string().trim().max(240).optional(), sourcePublishedAt: optionalDate, sourceUrl: z.string().url().max(1000).optional(), summary: z.string().trim().max(4000).optional(), title: z.string().trim().min(2).max(240),
  }),
  z.object({ action: z.literal("reviewResource"), resourceId: z.string().cuid(), approvalState: z.enum(["IN_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"]) }),
  z.object({ action: z.literal("createExamQuestion"), examId: academyRecordIdSchema, prompt: z.string().trim().min(2).max(2000), explanation: z.string().trim().max(4000).optional(), points: z.number().int().min(1).max(100).optional(), options: z.array(z.object({ label: z.string().trim().min(1).max(1000), isCorrect: z.boolean() })).min(2).max(12) }),
  z.object({
    action: z.literal("addAttachment"), checksum: z.string().trim().max(160).optional(), externalUrl: z.string().url().max(1000).optional(), fileName: z.string().trim().max(240).optional(), mimeType: z.string().trim().max(160).optional(), resourceId: z.string().cuid(), sizeBytes: z.number().int().nonnegative().optional(), sourceName: z.string().trim().max(240).optional(), sourceUrl: z.string().url().max(1000).optional(), storageKey: z.string().trim().max(500).optional(), title: z.string().trim().min(2).max(240), versionId: z.string().cuid().optional(),
  }),
]);

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item)) as T;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const query = request.nextUrl.searchParams;
  const kind = z.nativeEnum(AcademyResourceKind).safeParse(query.get("kind") ?? undefined);
  const state = z.nativeEnum(AcademyResourceApprovalState).safeParse(query.get("state") ?? undefined);
  const admin = hasPlatformAdminAccess(user.systemRole);
  if (query.has("kind") && !kind.success) return NextResponse.json({ success: false, message: "Invalid academy resource kind" }, { status: 400 });
  if (query.has("state") && (!admin || !state.success)) return NextResponse.json({ success: false, message: "Invalid academy resource state" }, { status: 400 });
  const resources = await listAcademyResources({
    approvalState: admin && state.success ? state.data : AcademyResourceApprovalState.APPROVED,
    category: query.get("category")?.trim() || undefined,
    kind: kind.success ? kind.data : undefined,
    query: query.get("query")?.trim().slice(0, 160) || undefined,
  });
  return NextResponse.json({ success: true, resources: serialize(resources) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformAdminAccess(user.systemRole)) return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid academy library command" }, { status: 400 });
  try {
    const input = parsed.data;
    const result = input.action === "createResource"
      ? await createAcademyResource({ ...input, content: input.content as Prisma.InputJsonValue, sourcePublishedAt: input.sourcePublishedAt ? new Date(input.sourcePublishedAt) : undefined }, user.id)
      : input.action === "createVersion"
        ? await createAcademyResourceVersion({ ...input, content: input.content as Prisma.InputJsonValue, sourcePublishedAt: input.sourcePublishedAt ? new Date(input.sourcePublishedAt) : undefined }, user.id)
        : input.action === "reviewResource"
          ? await reviewAcademyResource(input.resourceId, input.approvalState, user.id)
          : input.action === "createExamQuestion"
            ? await createAcademyExamQuestion(input, user.id)
            : await addAcademyResourceAttachment({ ...input, sizeBytes: input.sizeBytes === undefined ? undefined : BigInt(input.sizeBytes) }, user.id);
    return NextResponse.json({ success: true, result: serialize(result) }, { status: input.action === "createResource" || input.action === "createVersion" || input.action === "createExamQuestion" || input.action === "addAttachment" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Academy library command failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}