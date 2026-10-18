import { NextRequest } from "next/server";
import { access, failure, json } from "@/services/jenan-map/http";
import { commandSchema } from "@/services/jenan-map/contracts";
import { command, overviewFacts, preverifyCommand, snapshot } from "@/services/jenan-map/service";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const auth = await access(request, true);
    if (auth.response) return auth.response;
    const current = await snapshot();
    return json({ ...current, facts: await overviewFacts(current.runtime.publishedReleaseId) });
  } catch {
    return json({ runtime: { status: "disabled", maintenanceMessage: null, publishedReleaseId: null, revision: 0 }, releases: [], audit: [], artifacts: [], storage: { status: "unknown", configured: Boolean(process.env.JENAN_MAP_STORAGE_ROOT?.trim()) || process.env.JENAN_MAP_STORAGE_DRIVER?.trim() === "s3" }, capabilities: [], previewAvailable: false, exportAvailable: false, blockers: ["MAP_NOT_PROVISIONED_OR_UNAVAILABLE"], available: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await access(request, true, true);
    if (auth.response) return auth.response;
    const parsed = commandSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "INVALID_COMMAND" }, 400);
    // Verifying stored archives can take minutes on shared storage; it happens before the command's transaction, never inside it.
    const verified = await preverifyCommand(parsed.data);
    return json(await command(parsed.data, auth.user!.id, verified), parsed.data.action === "create" ? 201 : 200);
  } catch (error) { return failure(error); }
}
