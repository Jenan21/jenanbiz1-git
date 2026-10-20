import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/auth/request";
import { enforceRouteRateLimit } from "@/lib/rate-limit/route-rate-limit";
import { getPlatformMetrics } from "@/lib/admin/data-center-platform-metrics";
import { commandSchema, DataCenterError, layers, type DataCenterActor } from "@/services/data-center/contracts";
import { isDataCenterAdmin } from "@/services/data-center/policy";
import { dispatchDataCenterCommand, getDataCenterItem, getDataCenterOverview, listDataCenterArea } from "@/services/data-center/service";
import { dataCenterImportCapabilities, DATA_CENTER_UPLOAD_LIMIT, downloadDataCenterOriginal, ingestDataCenterFile } from "@/services/data-center/imports";
import { approveAcademyDataCenterRelease, dataCenterSemanticStatus, exportDataCenter, importAcademyDataCenterSource, recordDataCenterUsage, requestAcademyDataCenterRelease, retrieveDataCenterContext, retrieveDataCenterGeoContext } from "@/services/data-center/retrieval";

const noStore = { "cache-control": "private, no-store" };
export function dataCenterJson(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: noStore }); }
export function dataCenterFailure(error: unknown) {
  if (error instanceof DataCenterError) return dataCenterJson({ success: false, message: error.code }, error.status);
  if (error instanceof z.ZodError) return dataCenterJson({ success: false, message: "INVALID_DATA_CENTER_INPUT" }, 400);
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") return dataCenterJson({ success: false, message: "ALREADY_EXISTS" }, 409);
  return dataCenterJson({ success: false, message: "DATA_CENTER_UNAVAILABLE" }, 503);
}
export async function authenticateDataCenter(request: NextRequest, options: { admin?: boolean; write?: boolean } = {}) {
  const user = await getCurrentUser();
  if (!user) throw new DataCenterError("AUTHENTICATION_REQUIRED", 401);
  const actor: DataCenterActor = { id: user.id, systemRole: user.systemRole, kind: "HUMAN" };
  if (options.admin && !isDataCenterAdmin(actor)) throw new DataCenterError("ADMIN_REQUIRED", 403);
  if (options.write && !hasValidOrigin(request)) throw new DataCenterError("INVALID_ORIGIN", 403);
  const limited = await enforceRouteRateLimit(request, { scope: options.write ? "data-center:write" : "data-center:read", limit: options.write ? 30 : 90, windowMs: 60_000, userId: actor.id });
  return { actor, limited };
}
export async function readDataCenterBody(request: NextRequest, max = 1024 * 1024) {
  if (Number(request.headers.get("content-length")) > max) throw new DataCenterError("BODY_TOO_LARGE", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DataCenterError("BODY_REQUIRED");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.length;
      if (total > max) { await reader.cancel(); throw new DataCenterError("BODY_TOO_LARGE", 413); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function adminDataCenterGet(request: NextRequest) {
  try {
    const { actor, limited } = await authenticateDataCenter(request, { admin: true });
    if (limited) return limited;
    const params = request.nextUrl.searchParams;
    if (params.get("itemId")) return dataCenterJson({ success: true, item: await getDataCenterItem(params.get("itemId")!, actor) });
    const area = params.get("area") ?? "overview";
    if (area === "platform") return dataCenterJson({ success: true, platform: await getPlatformMetrics() });
    if (area === "overview") return dataCenterJson({ success: true, dataCenter: await getDataCenterOverview(actor), capabilities: { imports: dataCenterImportCapabilities(), semantic: dataCenterSemanticStatus() } });
    const options = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1), limit: z.coerce.number().int().min(1).max(100).default(20),
      query: z.string().max(200).optional(), status: z.string().max(30).optional(), sourceId: z.string().max(128).optional(), layer: z.enum(layers).optional() }).parse(Object.fromEntries([...params].filter(([k]) => k !== "area")));
    return dataCenterJson({ success: true, ...await listDataCenterArea(area, actor, options) });
  } catch (error) { return dataCenterFailure(error); }
}
export async function adminDataCenterPost(request: NextRequest) {
  try {
    const { actor, limited } = await authenticateDataCenter(request, { admin: true, write: true });
    if (limited) return limited;
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const bytes = await readDataCenterBody(request, DATA_CENTER_UPLOAD_LIMIT + 64 * 1024);
      const form = await new Response(new Uint8Array(bytes), { headers: { "content-type": request.headers.get("content-type")! } }).formData();
      if (form.get("action") !== "import-file") throw new DataCenterError("INVALID_IMPORT_ACTION");
      const file = form.get("file");
      if (!(file instanceof File)) throw new DataCenterError("FILE_REQUIRED");
      const fields = z.object({ sourceId: z.string().min(1).max(128), title: z.string().min(1).max(240), typeKey: z.string().min(1).max(80), layer: z.enum(layers) }).parse(Object.fromEntries(["sourceId", "title", "typeKey", "layer"].map((key) => [key, form.get(key)])));
      return dataCenterJson({ success: true, result: await ingestDataCenterFile(fields, file, actor) }, 201);
    }
    let body: unknown;
    try { body = JSON.parse((await readDataCenterBody(request)).toString("utf8")); } catch (error) { if (error instanceof DataCenterError) throw error; throw new DataCenterError("INVALID_JSON"); }
    const command = commandSchema.parse(body);
    const { action, ...input } = command;
    const result = action === "record-usage" ? await recordDataCenterUsage(input as Extract<typeof command, { action: "record-usage" }>, actor)
      : action === "request-academy-release" ? await requestAcademyDataCenterRelease(input as Extract<typeof command, { action: "request-academy-release" }>, actor)
      : action === "approve-academy-release" ? await approveAcademyDataCenterRelease(input as Extract<typeof command, { action: "approve-academy-release" }>, actor)
      : action === "import-academy-source" ? await importAcademyDataCenterSource(input as Extract<typeof command, { action: "import-academy-source" }>, actor)
      : await dispatchDataCenterCommand(command, actor);
    return dataCenterJson({ success: true, result }, action.startsWith("create") || action === "register-type" ? 201 : 200);
  } catch (error) { return dataCenterFailure(error); }
}
const retrievalQuerySchema = z.object({
  query: z.string().max(500).optional(), mode: z.enum(["keyword", "semantic"]).default("keyword"),
  organizationId: z.string().max(128).optional(), specialty: z.string().max(80).optional(), missionContext: z.string().max(80).optional(),
  typeKey: z.string().max(80).optional(), layer: z.enum(layers).optional(), limit: z.coerce.number().int().min(1).max(100).default(20),
  categoryKey: z.string().max(80).optional(), departmentKey: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).max(100).default(1),
});
export async function dataCenterContextGet(request: NextRequest) {
  try {
    const { actor, limited } = await authenticateDataCenter(request);
    if (limited) return limited;
    const input = retrievalQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return dataCenterJson({ success: true, ...await retrieveDataCenterContext(input, actor) });
  } catch (error) { return dataCenterFailure(error); }
}
export async function dataCenterExportGet(request: NextRequest) {
  try {
    const { actor, limited } = await authenticateDataCenter(request);
    if (limited) return limited;
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const format = z.enum(["json", "csv"]).parse(params.format ?? "json");
    delete params.format;
    const result = await exportDataCenter({ ...retrievalQuerySchema.parse(params), format }, actor);
    return new NextResponse(result.body, { headers: { ...noStore, "content-type": result.mimeType, "content-disposition": `attachment; filename="jenan-pro-data-center.${format}"`, "x-content-type-options": "nosniff" } });
  } catch (error) { return dataCenterFailure(error); }
}
export async function dataCenterGeoGet(request: NextRequest) {
  try {
    const { actor, limited } = await authenticateDataCenter(request);
    if (limited) return limited;
    const input = retrievalQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    return dataCenterJson({ success: true, ...await retrieveDataCenterGeoContext(input, actor) });
  } catch (error) { return dataCenterFailure(error); }
}
export async function dataCenterOriginalGet(request: NextRequest, importId: string) {
  try {
    const { actor, limited } = await authenticateDataCenter(request, { admin: true });
    if (limited) return limited;
    const result = await downloadDataCenterOriginal(importId, actor);
    return new NextResponse(new Uint8Array(result.bytes), { headers: { ...noStore, "content-type": "application/octet-stream", "x-content-type-options": "nosniff", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}` } });
  } catch (error) { return dataCenterFailure(error); }
}
export async function dataCenterUsagePost(request: NextRequest) {
  try {
    const { actor, limited } = await authenticateDataCenter(request, { write: true });
    if (limited) return limited;
    let body: unknown;
    try { body = JSON.parse((await readDataCenterBody(request, 8192)).toString("utf8")); } catch { throw new DataCenterError("INVALID_JSON"); }
    const command = commandSchema.parse({ ...(body as object), action: "record-usage" });
    if (command.action !== "record-usage") throw new DataCenterError("INVALID_COMMAND");
    return dataCenterJson({ success: true, result: await recordDataCenterUsage({ versionId: command.versionId, consumer: command.consumer, purpose: command.purpose, missionId: command.missionId, specialty: command.specialty, missionContext: command.missionContext }, actor) }, 201);
  } catch (error) { return dataCenterFailure(error); }
}
