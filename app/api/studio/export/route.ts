import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { StudioDocumentKind } from "@/generated/prisma/client";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { exportStudioDocument } from "@/services/studio/studio-export-service";

const exportKinds = [StudioDocumentKind.DOCS, StudioDocumentKind.SHEETS, StudioDocumentKind.PRESENTATION, StudioDocumentKind.LETTERHEAD] as const;
const schema = z.object({ content: z.record(z.string(), z.unknown()), kind: z.enum(exportKinds), title: z.string().trim().min(2).max(160) });

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid Studio export" }, { status: 400 });
  try {
    const exported = await exportStudioDocument(parsed.data, user.id);
    const safeTitle = parsed.data.title.replace(/[^A-Za-z0-9\u0600-\u06ff._-]+/g, "-").slice(0, 80) || "jenan-studio";
    return new NextResponse(new Uint8Array(exported.bytes), { headers: { "cache-control": "private, no-store", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeTitle}.${exported.extension}`)}`, "content-type": exported.mimeType } });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Studio export failed" }, { status: 409 });
  }
}