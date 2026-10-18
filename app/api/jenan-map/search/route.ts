import { NextRequest } from "next/server";
import { access, failure, json } from "@/services/jenan-map/http";
import { searchSchema } from "@/services/jenan-map/contracts";
import { search } from "@/services/jenan-map/service";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const auth = await access(request);
    if (auth.response) return auth.response;
    const parsed = searchSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return json({ error: "INVALID_SEARCH" }, 400);
    return json(await search(parsed.data));
  } catch (error) { return failure(error); }
}
