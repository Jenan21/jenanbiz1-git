import { NextResponse } from "next/server";
import { listPlatformSocialLinks } from "@/services/platform/platform-social-link-service";

export async function GET() {
  return NextResponse.json(
    { links: await listPlatformSocialLinks() },
    { headers: { "cache-control": "public, max-age=300, s-maxage=300" } },
  );
}