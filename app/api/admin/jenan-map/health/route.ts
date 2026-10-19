import { NextRequest } from "next/server";
import { z } from "zod";
import { MapError } from "@/services/jenan-map/contracts";
import { measureHealth, verifyPublishedRelease } from "@/services/jenan-map/health";
import { access, boundedBody, failure, json } from "@/services/jenan-map/http";

export const runtime = "nodejs";
// Reading every file of the published release back from storage takes as long as the files are big.
export const maxDuration = 300;

const commandSchema = z.object({ action: z.literal("verify-published") }).strict();

export async function GET(request: NextRequest) {
  try {
    const auth = await access(request, true);
    if (auth.response) return auth.response;
    return json(await measureHealth());
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await access(request, true, true);
    if (auth.response) return auth.response;
    let body: unknown;
    try { body = JSON.parse((await boundedBody(request, 1024)).toString("utf8")); } catch (error) {
      if (error instanceof MapError) throw error;
      return json({ error: "INVALID_HEALTH_COMMAND" }, 400);
    }
    if (!commandSchema.safeParse(body).success) return json({ error: "INVALID_HEALTH_COMMAND" }, 400);
    return json(await verifyPublishedRelease(auth.user!.id));
  } catch (error) { return failure(error); }
}
