import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { StudioDocumentKind } from "@/generated/prisma/client";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { createStudioDocument, listStudioActivity, listStudioDocuments, restoreStudioDocument, updateStudioDocument } from "@/services/studio/studio-document-service";

const contentSchema = z.record(z.string(), z.unknown());
const kindSchema = z.nativeEnum(StudioDocumentKind);
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), content: contentSchema, kind: kindSchema, title: z.string().trim().min(2).max(160) }),
  z.object({ action: z.literal("update"), content: contentSchema, documentId: z.string().cuid(), kind: kindSchema, title: z.string().trim().min(2).max(160) }),
  z.object({ action: z.literal("restore"), documentId: z.string().cuid(), version: z.number().int().positive() }),
]);

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  const kindValue = request.nextUrl.searchParams.get("kind");
  const kind = kindValue ? kindSchema.safeParse(kindValue) : null;
  if (kind && !kind.success) return NextResponse.json({ success: false, message: "Invalid document kind" }, { status: 400 });
  const [documents, activity] = await Promise.all([
    listStudioDocuments(user.id, kind?.data),
    listStudioActivity(user.id),
  ]);
  return NextResponse.json({ success: true, documents, activity });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = commandSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid Studio command" }, { status: 400 });
  try {
    const input = parsed.data;
    const document = input.action === "create"
      ? await createStudioDocument(input, user.id)
      : input.action === "update"
        ? await updateStudioDocument(input.documentId, input, user.id)
        : await restoreStudioDocument(input.documentId, input.version, user.id);
    return NextResponse.json({ success: true, document }, { status: input.action === "create" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Studio command failed";
    return NextResponse.json({ success: false, message }, { status: message.endsWith("not found") ? 404 : 409 });
  }
}