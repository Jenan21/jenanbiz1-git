import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { publicErrorMessage } from "@/lib/http/safe-error";
import { deleteUserFile, downloadUserFile, FileAssetError } from "@/services/files/file-asset-service";

export const runtime = "nodejs";

// A header value must be Latin-1, so non-ASCII names travel in the RFC 5987 `filename*` form with an ASCII fallback.
function contentDisposition(fileName: string) {
  const name = fileName.replace(/[\\/\r\n"]/g, "_");
  const fallback = name.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  const { fileId } = await params;
  try {
    const result = await downloadUserFile(user.id, fileId);
    if (!result) return NextResponse.json({ message: "File not found" }, { status: 404 });
    return new NextResponse(Buffer.from(result.bytes), {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": contentDisposition(result.asset.fileName),
        "content-security-policy": "default-src 'none'; sandbox",
        "content-type": result.contentType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof FileAssetError ? error.message : publicErrorMessage(error, "The file could not be retrieved");
    return NextResponse.json({ message }, { status: 422 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ message: "Invalid request origin" }, { status: 403 });
  const { fileId } = await params;
  return (await deleteUserFile(user.id, fileId))
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json({ message: "File not found" }, { status: 404 });
}