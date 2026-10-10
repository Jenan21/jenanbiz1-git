import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { PERSONALIZABLE_INTERFACE_PATHS } from "@/lib/account/interface-visibility";
import {
  getHiddenInterfacePaths,
  restoreAllInterfacePaths,
  updateHiddenInterfacePaths,
} from "@/services/account/interface-visibility-service";

const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set"),
    hidden: z.boolean(),
    paths: z.array(z.string().min(1).max(180)).min(1).max(PERSONALIZABLE_INTERFACE_PATHS.size),
  }),
  z.object({ action: z.literal("restoreAll") }),
]);

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  }
  const hiddenPaths = await getHiddenInterfacePaths(user.id);
  return NextResponse.json(
    { success: true, hiddenPaths },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "Authentication required" }, { status: 401 });
  }
  if (!hasValidOrigin(request)) {
    return NextResponse.json({ success: false, message: "Invalid request origin" }, { status: 403 });
  }
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid visibility preference request" }, { status: 400 });
  }
  if (parsed.data.action === "set") {
    const unknownPath = parsed.data.paths.find((path) => !PERSONALIZABLE_INTERFACE_PATHS.has(path));
    if (unknownPath) {
      return NextResponse.json({ success: false, message: "Unknown interface item" }, { status: 400 });
    }
  }
  const hiddenPaths = parsed.data.action === "restoreAll"
    ? await restoreAllInterfacePaths(user.id)
    : await updateHiddenInterfacePaths({
        hidden: parsed.data.hidden,
        paths: parsed.data.paths,
        userId: user.id,
      });
  return NextResponse.json({ success: true, hiddenPaths });
}
