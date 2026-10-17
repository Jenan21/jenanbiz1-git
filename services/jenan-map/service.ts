import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { db, type DbExecutor } from "@/lib/db";
import { type Artifact, type MapCommand, type MapRuntime, type Release, type SavedLocation, MapError } from "./contracts";
import { downloadMetadata, openArtifact, storageRoot, storageState } from "./storage";

type SqlExecutor = Pick<DbExecutor, "$queryRaw" | "$executeRaw">;
const sql = Prisma.sql;
const productionArtifactKinds = ["geojson", "pmtiles", "style", "glyphs", "schema", "coverage"];

function hasProductionArtifacts(files: Artifact[]) {
  return productionArtifactKinds.every((kind) => files.some((file) =>
    file.kind === kind && (["schema", "coverage"].includes(kind) || file.publicSafe)));
}

function rethrowWriteError(error: unknown): never {
  if (error instanceof MapError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError &&
    (["P2034", "P2002"].includes(error.code) ||
      (error.code === "P2010" && ["40001", "40P01", "23505"].includes(String(error.meta?.code))))) {
    throw new MapError("CONCURRENT_CHANGE_RETRY");
  }
  throw error;
}

export async function runtime(executor: SqlExecutor = db, lock = false): Promise<MapRuntime> {
  const rows = lock
    ? await executor.$queryRaw<MapRuntime[]>(sql`SELECT * FROM jenan_map.runtime WHERE id = 1 FOR UPDATE`)
    : await executor.$queryRaw<MapRuntime[]>(sql`SELECT * FROM jenan_map.runtime WHERE id = 1`);
  if (!rows[0]) throw new MapError("MAP_NOT_CONFIGURED", 503);
  return rows[0];
}

export async function artifacts(releaseId: string, executor: SqlExecutor = db) {
  return executor.$queryRaw<Artifact[]>(sql`SELECT * FROM jenan_map.artifact WHERE "releaseId" = ${releaseId}::uuid ORDER BY "createdAt", id`);
}

async function releaseById(id: string, executor: SqlExecutor = db) {
  const [release] = await executor.$queryRaw<Release[]>(sql`SELECT * FROM jenan_map.release WHERE id = ${id}::uuid`);
  if (!release) throw new MapError("RELEASE_NOT_FOUND", 404);
  return release;
}

export async function publishedRelease(requestedId?: string) {
  const state = await runtime();
  if (state.status !== "enabled") throw new MapError(state.status === "maintenance" ? "MAP_MAINTENANCE" : "MAP_DISABLED", 503);
  if (!state.publishedReleaseId) throw new MapError("NO_PUBLISHED_RELEASE", 503);
  if (requestedId && requestedId !== state.publishedReleaseId) throw new MapError("RELEASE_NOT_PUBLISHED", 404);
  const release = await releaseById(state.publishedReleaseId);
  if (release.status !== "Published") throw new MapError("NO_PUBLISHED_RELEASE", 503);
  return release;
}

async function previewRelease(releaseId: string) {
  const release = await releaseById(releaseId);
  if (!["Ready", "Approved", "Published", "Archived"].includes(release.status)) throw new MapError("PREVIEW_NOT_READY");
  return release;
}

function publicArtifact(artifact: Artifact, admin = false) {
  const download = downloadMetadata(artifact);
  return {
    id: artifact.id, kind: artifact.kind, filename: download.filename, mime: download.mime,
    sha256: artifact.sha256, byteSize: artifact.byteSize.toString(),
    url: `/api/${admin ? "admin/" : ""}jenan-map/artifacts/${artifact.id}`,
  };
}

export async function manifest() {
  const state = await runtime();
  if (state.status !== "enabled") return { status: state.status, release: null, reason: state.status === "disabled" ? "MAP_DISABLED" : "MAP_MAINTENANCE", maintenanceMessage: state.maintenanceMessage ?? null };
  if (!state.publishedReleaseId) return { status: "unavailable", release: null, reason: "NO_PUBLISHED_RELEASE" };
  const release = await releaseById(state.publishedReleaseId);
  if (release.status !== "Published") return { status: "unavailable", release: null, reason: "NO_PUBLISHED_RELEASE" };
  storageRoot();
  const registered = await artifacts(release.id);
  if (!hasProductionArtifacts(registered)) throw new MapError("OWNED_BASEMAP_STYLE_GLYPHS_SCHEMA_COVERAGE_REQUIRED", 503);
  const files = registered.filter((item) => item.publicSafe);
  for (const file of files) await (await openArtifact(file)).close();
  return {
    status: state.status,
    release: {
      id: release.id, version: release.version, publishedAt: release.publishedAt,
      source: release.source, sourceDate: release.sourceDate, license: release.license,
      styleUrl: files.find((item) => item.kind === "style") ? `/api/jenan-map/artifacts/${files.find((item) => item.kind === "style")!.id}` : null,
      layers: files.filter((item) => item.kind === "geojson").map((item) => ({ id: item.id, label: item.filename, available: true, styleLayerIds: [] as string[], type: "geojson", url: `/api/jenan-map/artifacts/${item.id}` })),
      artifacts: files.map((item) => publicArtifact(item)),
    },
  };
}

export async function snapshot() {
  const state = await runtime();
  const releases = await db.$queryRaw<Release[]>(sql`SELECT * FROM jenan_map.release ORDER BY "createdAt" DESC LIMIT 100`);
  const audit = await db.$queryRaw(sql`SELECT * FROM jenan_map.audit ORDER BY "createdAt" DESC LIMIT 100`);
  const files = await db.$queryRaw<Artifact[]>(sql`SELECT * FROM jenan_map.artifact ORDER BY "createdAt" DESC LIMIT 500`);
  return {
    runtime: state, releases, audit,
    artifacts: files.map((file) => ({ ...publicArtifact(file, true), releaseId: file.releaseId, publicSafe: file.publicSafe })),
    storage: await storageState(),
    capabilities: ["create", "approve", "publish", "rollback", "archive", "runtime", "preview", "export", "artifact-download"],
    previewAvailable: true, exportAvailable: true,
    blockers: !state.publishedReleaseId ? ["NO_PUBLISHED_RELEASE", "IMPORT_AND_REVIEW_REQUIRED"] : [],
  };
}

async function audit(executor: SqlExecutor, actor: string, action: string, releaseId: string | null, metadata: Record<string, unknown>) {
  await executor.$executeRaw(sql`INSERT INTO jenan_map.audit (id,"actorId",action,"releaseId",metadata)
    VALUES (${randomUUID()}::uuid,${actor},${action},${releaseId}::uuid,${JSON.stringify(metadata)}::jsonb)`);
  await executor.$executeRaw(sql`INSERT INTO "AuditLog" (id,"actorId",action,"entityType","entityId",metadata)
    VALUES (${randomUUID()},${actor},${`jenan_map.${action}`} ,'JenanMapRelease',${releaseId},
      ${JSON.stringify({ ...metadata, result: "success" })}::jsonb)`);
}

async function verifyReady(releaseId: string, executor: SqlExecutor) {
  const [counts] = await executor.$queryRaw<{ boundaries: bigint; features: bigint }[]>(sql`
    SELECT (SELECT count(*) FROM jenan_map.boundary WHERE "releaseId" = ${releaseId}::uuid) AS boundaries,
      (SELECT count(*) FROM jenan_map.feature WHERE "releaseId" = ${releaseId}::uuid) AS features`);
  const files = await artifacts(releaseId, executor);
  if (!counts || counts.boundaries !== BigInt(1) || counts.features < BigInt(1) ||
      !hasProductionArtifacts(files)) {
    throw new MapError("RELEASE_NOT_READY");
  }
  for (const file of files) await (await openArtifact(file, true)).close();
}

export async function command(input: MapCommand, actor: string) {
  try {
    return await db.$transaction(async (tx) => {
      const state = await runtime(tx, true);
      if (input.action === "create") {
        if (new Date(input.sourceDate).getTime() > Date.now()) throw new MapError("SOURCE_DATE_IN_FUTURE", 400);
        const id = randomUUID();
        await tx.$executeRaw(sql`INSERT INTO jenan_map.release (id,version,source,"sourceDate",license,"createdBy")
          VALUES (${id}::uuid,${input.version},${input.source},${new Date(input.sourceDate)},${input.license},${actor})`);
        await audit(tx, actor, "create", id, { version: input.version });
        return { id, status: "Draft" };
      }
      if (input.action === "runtime") {
        if (state.revision !== input.expectedRevision) throw new MapError("STALE_REVISION");
        if (input.expectedPublishedReleaseId !== undefined && state.publishedReleaseId !== input.expectedPublishedReleaseId) throw new MapError("STALE_PUBLISHED_POINTER");
        if (input.status === "enabled") {
          if (!state.publishedReleaseId) throw new MapError("NO_PUBLISHED_RELEASE");
          const release = await releaseById(state.publishedReleaseId, tx);
          if (release.status !== "Published") throw new MapError("NO_PUBLISHED_RELEASE");
          await verifyReady(release.id, tx);
        }
        const maintenanceMessage = input.status === "maintenance" ? input.maintenanceMessage ?? "الخريطة قيد الصيانة مؤقتًا. يرجى المحاولة لاحقًا." : null;
        await tx.$executeRaw(sql`UPDATE jenan_map.runtime SET status = ${input.status}, "maintenanceMessage" = ${maintenanceMessage}, revision = revision + 1, "updatedAt" = now() WHERE id = 1`);
        await audit(tx, actor, "runtime", state.publishedReleaseId, { reason: input.reason, from: state.status, to: input.status, maintenanceMessage });
        return { status: input.status, revision: state.revision + 1 };
      }
      const release = await releaseById(input.releaseId, tx);
      if (input.action === "approve") {
        if (release.status !== "Ready") throw new MapError("RELEASE_NOT_READY");
        await verifyReady(release.id, tx);
        await tx.$executeRaw(sql`UPDATE jenan_map.release SET status = 'Approved', "reviewedBy" = ${actor}, "reviewedAt" = now(), "reviewNotes" = ${input.reason} WHERE id = ${release.id}::uuid`);
      } else if (input.action === "archive") {
        if (state.publishedReleaseId === release.id) throw new MapError("ACTIVE_RELEASE_CANNOT_BE_ARCHIVED");
        if (!["Approved", "Published"].includes(release.status)) throw new MapError("INVALID_TRANSITION");
        await tx.$executeRaw(sql`UPDATE jenan_map.release SET status = 'Archived' WHERE id = ${release.id}::uuid`);
      } else {
        if (input.confirmation !== (input.action === "publish" ? "PUBLISH" : "ROLLBACK")) throw new MapError("EXPLICIT_CONFIRMATION_REQUIRED", 400);
        if (state.revision !== input.expectedRevision) throw new MapError("STALE_REVISION");
        if (state.publishedReleaseId !== input.expectedPublishedReleaseId) throw new MapError("STALE_PUBLISHED_POINTER");
        if (input.action === "publish" ? release.status !== "Approved" : release.status !== "Archived" || !release.publishedAt) throw new MapError("INVALID_TRANSITION");
        if (!release.reviewedBy || !release.reviewedAt) throw new MapError("REVIEW_REQUIRED");
        await verifyReady(release.id, tx);
        if (state.publishedReleaseId) {
          await tx.$executeRaw(sql`UPDATE jenan_map.release SET status = 'Archived' WHERE id = ${state.publishedReleaseId}::uuid AND status = 'Published'`);
        }
        await tx.$executeRaw(sql`UPDATE jenan_map.release SET status = 'Published', "publishedAt" = COALESCE("publishedAt",now()) WHERE id = ${release.id}::uuid`);
        await tx.$executeRaw(sql`UPDATE jenan_map.runtime SET "publishedReleaseId" = ${release.id}::uuid, revision = revision + 1, "updatedAt" = now() WHERE id = 1`);
      }
      await audit(tx, actor, input.action, release.id, { reason: input.reason, previousReleaseId: state.publishedReleaseId });
      return { id: release.id, action: input.action, revision: state.revision + (["publish", "rollback"].includes(input.action) ? 1 : 0) };
    }, { isolationLevel: "Serializable", timeout: 60_000 });
  } catch (error) {
    rethrowWriteError(error);
  }
}

export async function validateLocation(latitude: number, longitude: number, releaseId?: string, adminPreview = false) {
  if (adminPreview && !releaseId) throw new MapError("PREVIEW_RELEASE_REQUIRED", 400);
  const release = adminPreview ? await previewRelease(releaseId!) : await publishedRelease(releaseId);
  const [result] = await db.$queryRaw<{ inside: boolean }[]>(sql`
    SELECT ST_Covers(geometry, ST_SetSRID(ST_MakePoint(${longitude},${latitude}),4326)) AS inside
    FROM jenan_map.boundary WHERE "releaseId" = ${release.id}::uuid`);
  if (!result) throw new MapError("AUTHORITATIVE_BOUNDARY_UNAVAILABLE", 503);
  if (!result.inside) throw new MapError("OUTSIDE_SAUDI_ARABIA", 422);
  return { valid: true, latitude, longitude, releaseId: release.id };
}

export async function search(input: { q: string; releaseId?: string; latitude?: number; longitude?: number; radiusMeters: number }, adminPreview = false) {
  if (adminPreview && !input.releaseId) throw new MapError("PREVIEW_RELEASE_REQUIRED", 400);
  const release = adminPreview ? await previewRelease(input.releaseId!) : await publishedRelease(input.releaseId);
  const [boundary] = await db.$queryRaw<{ id: string }[]>(sql`SELECT id FROM jenan_map.boundary WHERE "releaseId" = ${release.id}::uuid`);
  if (!boundary) throw new MapError("AUTHORITATIVE_BOUNDARY_UNAVAILABLE", 503);
  const near = input.latitude !== undefined && input.longitude !== undefined;
  if (near) await validateLocation(input.latitude!, input.longitude!, release.id, adminPreview);
  const proximity = near
    ? sql`AND ST_DWithin(f.geometry::geography, ST_SetSRID(ST_MakePoint(${input.longitude!}, ${input.latitude!}),4326)::geography, ${input.radiusMeters})`
    : sql``;
  const rows = await db.$queryRaw(sql`
    SELECT f.id, f.label, f.category, ST_Y(ST_PointOnSurface(f.geometry)) AS latitude,
      ST_X(ST_PointOnSurface(f.geometry)) AS longitude
    FROM jenan_map.feature f JOIN jenan_map.boundary b ON b."releaseId" = f."releaseId"
    WHERE f."releaseId" = ${release.id}::uuid
      AND f.search @@ plainto_tsquery('simple', ${input.q})
      AND ST_Covers(b.geometry, f.geometry) ${proximity}
    ORDER BY ts_rank(f.search,plainto_tsquery('simple',${input.q})) DESC, f.id LIMIT 20`);
  return { results: rows, releaseId: release.id };
}

export async function authorizedArtifact(id: string, admin: boolean) {
  const [artifact] = await db.$queryRaw<Artifact[]>(sql`SELECT * FROM jenan_map.artifact WHERE id = ${id}::uuid`);
  if (!artifact) throw new MapError("ARTIFACT_NOT_FOUND", 404);
  if (!admin) {
    await publishedRelease(artifact.releaseId);
    if (!artifact.publicSafe) throw new MapError("ARTIFACT_NOT_FOUND", 404);
  }
  return artifact;
}

export async function exportManifest(releaseId: string) {
  const release = await releaseById(releaseId);
  const files = await artifacts(releaseId);
  for (const file of files) await (await openArtifact(file, true)).close();
  return {
    format: "jenan-pro-map-portable-v1",
    release: { id: release.id, version: release.version, status: release.status, source: release.source, sourceDate: release.sourceDate, license: release.license, publishedAt: release.publishedAt },
    generatedAt: new Date().toISOString(),
    authorization: "Session-authenticated downloads have no independent link expiry; every request requires a current admin session. URLs are not bearer tokens.",
    artifacts: files.map((item) => publicArtifact(item, true)),
    portableGeojsonAvailable: files.some((item) => item.kind === "geojson"),
  };
}

export async function previewManifest(releaseId: string) {
  const release = await previewRelease(releaseId);
  const files = (await artifacts(release.id)).filter((file) => file.publicSafe);
  if (!files.some((file) => file.kind === "geojson")) throw new MapError("PREVIEW_DATA_UNAVAILABLE", 503);
  storageRoot();
  for (const file of files) await (await openArtifact(file)).close();
  return {
    status: "enabled", preview: true,
    release: {
      id: release.id, version: release.version, publishedAt: release.publishedAt,
      source: release.source, sourceDate: release.sourceDate, license: release.license,
      styleUrl: files.find((file) => file.kind === "style")
        ? publicArtifact(files.find((file) => file.kind === "style")!, true).url
        : null,
      layers: files.filter((file) => file.kind === "geojson").map((file) => ({ id: file.id, label: file.filename, available: true, styleLayerIds: [] as string[], type: "geojson", url: publicArtifact(file, true).url })),
      artifacts: files.map((file) => publicArtifact(file, true)),
    },
  };
}

export async function savedLocation(userId: string): Promise<SavedLocation | null> {
  const [location] = await db.$queryRaw<SavedLocation[]>(sql`
    SELECT latitude,longitude,country,region,city,district,"formattedAddress",source,"selectedAt","releaseId"
    FROM jenan_map.saved_location WHERE "userId" = ${userId}`);
  return location ?? null;
}

export async function saveLocation(input: { latitude: number; longitude: number; releaseId: string; source: SavedLocation["source"] }, userId: string) {
  try {
    return await db.$transaction(async (tx) => {
      const state = await runtime(tx, true);
      if (state.status !== "enabled") throw new MapError(state.status === "maintenance" ? "MAP_MAINTENANCE" : "MAP_DISABLED", 503);
      if (state.publishedReleaseId !== input.releaseId) throw new MapError("RELEASE_NOT_PUBLISHED", 409);
      const release = await releaseById(input.releaseId, tx);
      if (release.status !== "Published") throw new MapError("RELEASE_NOT_PUBLISHED", 409);
      const [boundary] = await tx.$queryRaw<{ inside: boolean }[]>(sql`
        SELECT ST_Covers(geometry,ST_SetSRID(ST_MakePoint(${input.longitude},${input.latitude}),4326)) AS inside
        FROM jenan_map.boundary WHERE "releaseId" = ${input.releaseId}::uuid`);
      if (!boundary) throw new MapError("AUTHORITATIVE_BOUNDARY_UNAVAILABLE", 503);
      if (!boundary.inside) throw new MapError("OUTSIDE_SAUDI_ARABIA", 422);
      // No authoritative administrative-address hierarchy is imported in v1.
      // Clear prior labels rather than retaining stale client-supplied addresses.
      const [location] = await tx.$queryRaw<SavedLocation[]>(sql`
        INSERT INTO jenan_map.saved_location ("userId","releaseId",latitude,longitude,country,region,city,district,"formattedAddress",source,"selectedAt")
        VALUES (${userId},${input.releaseId}::uuid,${input.latitude},${input.longitude},'SA',NULL,NULL,NULL,NULL,${input.source},now())
        ON CONFLICT ("userId") DO UPDATE SET
          "releaseId" = EXCLUDED."releaseId",latitude = EXCLUDED.latitude,longitude = EXCLUDED.longitude,
          country = 'SA',region = NULL,city = NULL,district = NULL,"formattedAddress" = NULL,
          source = EXCLUDED.source,"selectedAt" = now()
        RETURNING latitude,longitude,country,region,city,district,"formattedAddress",source,"selectedAt","releaseId"`);
      if (!location) throw new MapError("LOCATION_SAVE_FAILED", 503);
      await audit(tx, userId, "location.saved", input.releaseId, { source: input.source });
      return location;
    }, { isolationLevel: "Serializable" });
  } catch (error) { rethrowWriteError(error); }
}
