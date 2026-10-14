import { NextRequest, NextResponse } from "next/server";
import { hasValidOrigin } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { publicErrorMessage } from "@/lib/http/safe-error";
import { enforceRouteRateLimit } from "@/lib/rate-limit/route-rate-limit";
import { sniffImageType } from "@/services/files/content-sniffing";
import { exceedsDeclaredBodyLimit } from "@/services/files/request-limits";
import { extractPaletteFromBase64 } from "@/services/visual-dna/visual-dna.service";

export const runtime = "nodejs";

const maxImageBytes = 5 * 1024 * 1024;
const supportedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  const limited = await enforceRouteRateLimit(request, { scope: "software:design", limit: 20, windowMs: 60_000, userId: user.id });
  if (limited) return limited;
  if (exceedsDeclaredBodyLimit(request, maxImageBytes + 1024 * 1024)) return NextResponse.json({ success: false, message: "Invalid image request" }, { status: 413 });

  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File) || image.size === 0 || image.size > maxImageBytes) return NextResponse.json({ success: false, message: "Invalid image request" }, { status: 400 });

  const bytes = new Uint8Array(await image.arrayBuffer());
  // The type is read from the bytes, and a declared type that disagrees with them is refused.
  const mimeType = sniffImageType(bytes);
  if (!mimeType || !supportedImageTypes.has(mimeType) || image.type !== mimeType) return NextResponse.json({ success: false, message: "Use a valid PNG, JPEG, or WebP image" }, { status: 400 });
  try {
    const palette = await extractPaletteFromBase64(`data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`);
    await db.auditLog.create({ data: { actorId: user.id, action: "software.design.palette.extracted", entityType: "SoftwareTool", metadata: { mimeType, sizeBytes: image.size, paletteSize: palette.length } } });
    return NextResponse.json({ success: true, palette }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, message: publicErrorMessage(error, "The palette could not be extracted") }, { status: 422 });
  }
}