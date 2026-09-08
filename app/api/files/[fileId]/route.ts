import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { deleteUserFile, downloadUserFile, FileAssetError } from "@/services/files/file-asset-service";

export const runtime = "nodejs";

function attachmentName(fileName: string) {
  return fileName.replace(/[\\/\r\n"]/g, "_");
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  const { fileId } = await params;
  try {
    const result = await downloadUserFile(user.id, fileId);
    if (!result) return NextResponse.json({ message: "File not found" }, { status: 404 });
    return new NextResponse(result.bytes, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="${attachmentName(result.asset.fileName)}"`,
        "content-type": result.asset.mimeType,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof FileAssetError ? error.message : "The file could not be retrieved";
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