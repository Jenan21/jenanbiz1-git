import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { access, failure, json } from "@/services/jenan-map/http";
import { idSchema } from "@/services/jenan-map/contracts";
import { exportFeatures, FEATURE_EXPORT_FORMATS } from "@/services/jenan-map/export-features";
import { audit } from "@/services/jenan-map/service";
import { db } from "@/lib/db";

export const runtime = "nodejs";
const querySchema = z.object({ layerId: z.string().regex(/^[a-z][a-z-]{0,63}$/), format: z.enum(FEATURE_EXPORT_FORMATS).default("geojson") });

/** Exports one layer of a release as GeoJSON, JSON or CSV when the layer's licence allows redistribution. */
export async function GET(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  try {
    const auth = await access(request, true);
    if (auth.response) return auth.response;
    const { releaseId } = await context.params;
    if (!idSchema.safeParse(releaseId).success) return json({ error: "INVALID_RELEASE_ID" }, 400);
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) return json({ error: "INVALID_EXPORT_REQUEST" }, 400);
    const result = await exportFeatures({ releaseId, ...query.data });
    await db.$transaction((tx) => audit(tx, auth.user!.id, "export.features", releaseId, { layerId: query.data.layerId, format: query.data.format, count: result.count }));
    return new NextResponse(result.body, { headers: {
      "content-type": result.contentType, "cache-control": "private, no-store", "x-content-type-options": "nosniff",
      "content-disposition": `attachment; filename="jenan-pro-map-${query.data.layerId}.${query.data.format === "csv" ? "csv" : query.data.format === "json" ? "json" : "geojson"}"`,
    } });
  } catch (error) { return failure(error); }
}