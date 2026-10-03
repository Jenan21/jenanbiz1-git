import { NextRequest, NextResponse } from "next/server";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { extractPaletteFromBase64 } from "@/services/visual-dna/visual-dna.service";

export const runtime = "nodejs";

const maxImageBytes = 5 * 1024 * 1024;

function isSupportedImage(file: File, bytes: Uint8Array) {
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length >= 12 && new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP";
  return (file.type === "image/png" && png) || (file.type === "image/jpeg" && jpeg) || (file.type === "image/webp" && webp);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File) || image.size === 0 || image.size > maxImageBytes) return NextResponse.json({ success: false, message: "Invalid image request" }, { status: 400 });

  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!isSupportedImage(image, bytes)) return NextResponse.json({ success: false, message: "Use a valid PNG, JPEG, or WebP image" }, { status: 400 });
  const palette = await extractPaletteFromBase64(`data:${image.type};base64,${Buffer.from(bytes).toString("base64")}`);
  await db.auditLog.create({ data: { actorId: user.id, action: "software.design.palette.extracted", entityType: "SoftwareTool", metadata: { mimeType: image.type, sizeBytes: image.size, paletteSize: palette.length } } });
  return NextResponse.json({ success: true, palette }, { headers: { "cache-control": "no-store" } });
}