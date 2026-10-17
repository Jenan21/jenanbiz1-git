import { NextRequest } from "next/server";
import { access, failure, json } from "@/services/jenan-map/http";
import { commandSchema } from "@/services/jenan-map/contracts";
import { command, snapshot } from "@/services/jenan-map/service";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const auth = await access(request, true);
    if (auth.response) return auth.response;
    return json(await snapshot());
  } catch {
    return json({ runtime: { status: "disabled", publishedReleaseId: null, revision: 0 }, releases: [], audit: [], blockers: ["MAP_NOT_PROVISIONED_OR_UNAVAILABLE"], available: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await access(request, true, true);
    if (auth.response) return auth.response;
    const parsed = commandSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "INVALID_COMMAND" }, 400);
    return json(await command(parsed.data, auth.user!.id), parsed.data.action === "create" ? 201 : 200);
  } catch (error) { return failure(error); }
}
