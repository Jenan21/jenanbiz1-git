import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { FileAssetError, listUserFiles, uploadUserFile } from "@/services/files/file-asset-service";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  return NextResponse.json({ files: await listUserFiles(user.id) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: "Authentication required" }, { status: 401 });
  if (!hasValidOrigin(request)) return NextResponse.json({ message: "Invalid request origin" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "Provide one file" }, { status: 400 });
  try {
    return NextResponse.json({ file: await uploadUserFile(user.id, file) }, { status: 201 });
  } catch (error) {
    const message = error instanceof FileAssetError ? error.message : "The file could not be stored";
    return NextResponse.json({ message }, { status: 422 });
  }
}