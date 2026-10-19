import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { MapError, type Artifact } from "./contracts";
import { artifacts, audit, runtime } from "./service";
import { objectStore, safeStorageKey, storageRoot, storageState } from "./storage";
import { validateReleaseArtifacts } from "./validation";

const sql = Prisma.sql;

type Measured = { status: "ok" | "failed"; latencyMs: number | null };

export type HealthReport = {
  measuredAt: string;
  /** `ok` only when every measured check passed and the published release was fully verified; never inferred from a missing measurement. */
  status: "ok" | "attention" | "failed";
  database: Measured;
  postgis: Measured & { version: string | null };
  storage: Measured & { driver: "filesystem" | "s3" };
  runtime: { status: "enabled" | "maintenance" | "disabled"; publishedReleaseId: string | null; revision: number } | null;
  published: null | {
    releaseId: string;
    version: string;
    status: string;
    /** The release the runtime points at must itself be marked Published. */
    consistent: boolean;
    artifacts: Array<{ kind: string; filename: string; byteSize: number; present: boolean; sizeMatches: boolean }>;
    layers: Array<{ layerId: string; features: number }>;
    boundary: { authority: string; source: string } | null;
    verification: null | { at: string; result: "verified" | "failed"; code: string | null; durationMs: number; bytes: number; by: string };
  };
  /** What a server cannot know about its own map: it is shown as unmeasured, never as healthy. */
  notMeasured: string[];
};

export type DeepVerification = { releaseId: string; version: string; status: "verified" | "failed"; code: string | null; durationMs: number; bytes: number; checkedAt: string };

async function timed<T>(work: () => Promise<T>): Promise<{ value: T | null; latencyMs: number; failed: boolean }> {
  const started = performance.now();
  try {
    const value = await work();
    return { value, latencyMs: Math.round(performance.now() - started), failed: false };
  } catch {
    return { value: null, latencyMs: Math.round(performance.now() - started), failed: true };
  }
}

/** Is the stored object there, with the size the database recorded? A stat or a HEAD: no byte is read, so this is cheap enough for every refresh. */
async function artifactPresence(artifact: Artifact) {
  const expected = Number(artifact.byteSize);
  try {
    const store = objectStore();
    if (store) {
      const found = await store.head(safeStorageKey(artifact.storageKey));
      return { present: Boolean(found), sizeMatches: found?.size === expected };
    }
    const target = path.join(await realpath(storageRoot()), safeStorageKey(artifact.storageKey));
    const info = await stat(target);
    return { present: info.isFile(), sizeMatches: info.isFile() && info.size === expected };
  } catch {
    return { present: false, sizeMatches: false };
  }
}

async function lastVerification(releaseId: string): Promise<NonNullable<HealthReport["published"]>["verification"]> {
  const [row] = await db.$queryRaw<{ createdAt: Date; actorId: string; metadata: { result?: string; code?: string | null; durationMs?: number; bytes?: number } }[]>(sql`
    SELECT "createdAt", "actorId", metadata FROM jenan_map.audit
    WHERE action = 'health.verify' AND "releaseId" = ${releaseId}::uuid ORDER BY "createdAt" DESC LIMIT 1`);
  if (!row) return null;
  return {
    at: row.createdAt.toISOString(), result: row.metadata.result === "verified" ? "verified" : "failed", code: row.metadata.code ?? null,
    durationMs: Number(row.metadata.durationMs ?? 0), bytes: Number(row.metadata.bytes ?? 0), by: row.actorId,
  };
}

async function publishedFacts(releaseId: string): Promise<HealthReport["published"]> {
  const [release] = await db.$queryRaw<{ id: string; version: string; status: string }[]>(sql`SELECT id, version, status FROM jenan_map.release WHERE id = ${releaseId}::uuid`);
  if (!release) return null;
  const files = await artifacts(releaseId);
  const presence = await Promise.all(files.filter((file) => file.kind !== "source").map(async (file) => ({
    kind: file.kind, filename: file.filename, byteSize: Number(file.byteSize), ...(await artifactPresence(file)),
  })));
  const layers = await db.$queryRaw<{ layerId: string; features: number }[]>(sql`
    SELECT COALESCE("layerId", 'unassigned') AS "layerId", count(*)::int AS features FROM jenan_map.feature
    WHERE "releaseId" = ${releaseId}::uuid GROUP BY 1 ORDER BY 1`);
  const [boundary] = await db.$queryRaw<{ authority: string; source: string }[]>(sql`SELECT authority, source FROM jenan_map.boundary WHERE "releaseId" = ${releaseId}::uuid`);
  return {
    releaseId, version: release.version, status: release.status, consistent: release.status === "Published",
    artifacts: presence, layers, boundary: boundary ?? null, verification: await lastVerification(releaseId),
  };
}

/**
 * Measures the map's own dependencies right now: the database and its latency, PostGIS, the storage driver, the published release's
 * files (present, right size) and per-layer feature counts. Each check that cannot be taken is reported as failed, never skipped.
 */
export async function measureHealth(): Promise<HealthReport> {
  const database = await timed(() => db.$queryRaw<{ ok: number }[]>(sql`SELECT 1 AS ok`));
  const postgis = await timed(async () => (await db.$queryRaw<{ version: string }[]>(sql`SELECT PostGIS_Lib_Version() AS version`))[0]?.version ?? null);
  const storage = await timed(() => storageState());
  const state = (await timed(() => runtime())).value;
  const published = state?.publishedReleaseId ? (await timed(() => publishedFacts(state.publishedReleaseId!))).value : null;

  const storageOk = !storage.failed && storage.value?.status === "available";
  const filesOk = !published || published.artifacts.every((file) => file.present && file.sizeMatches);
  const failed = database.failed || postgis.failed || !postgis.value || !storageOk || !state || !filesOk ||
    Boolean(state.publishedReleaseId && (!published || !published.consistent));
  const attention = !failed && (state?.status !== "enabled" || !published || published.verification?.result !== "verified");
  return {
    measuredAt: new Date().toISOString(),
    status: failed ? "failed" : attention ? "attention" : "ok",
    database: { status: database.failed ? "failed" : "ok", latencyMs: database.failed ? null : database.latencyMs },
    postgis: { status: postgis.failed || !postgis.value ? "failed" : "ok", latencyMs: postgis.failed ? null : postgis.latencyMs, version: postgis.value },
    storage: { status: storageOk ? "ok" : "failed", latencyMs: storage.failed ? null : storage.latencyMs, driver: storage.value && "driver" in storage.value && storage.value.driver === "s3" ? "s3" : "filesystem" },
    runtime: state ? { status: state.status, publishedReleaseId: state.publishedReleaseId, revision: state.revision } : null,
    published,
    notMeasured: ["browser-rendering", "cdn-and-caching", "performance-under-load"],
  };
}

let inFlight: Promise<DeepVerification> | null = null;

/**
 * Reads every file of the published release back from storage and runs the same checks that approval and publishing run: checksums,
 * the PMTiles container, the style, the glyph and sprite references, the Saudi coverage evidence. It takes as long as the files are big,
 * so concurrent requests share one run, and every run is recorded in the audit log.
 */
export function verifyPublishedRelease(actor: string): Promise<DeepVerification> {
  inFlight ??= runDeepVerification(actor).finally(() => { inFlight = null; });
  return inFlight;
}

async function runDeepVerification(actor: string): Promise<DeepVerification> {
  const state = await runtime();
  if (!state.publishedReleaseId) throw new MapError("NO_PUBLISHED_RELEASE", 409);
  const releaseId = state.publishedReleaseId;
  const [release] = await db.$queryRaw<{ version: string }[]>(sql`SELECT version FROM jenan_map.release WHERE id = ${releaseId}::uuid`);
  if (!release) throw new MapError("RELEASE_NOT_FOUND", 404);
  const files = await artifacts(releaseId);
  const [boundary] = await db.$queryRaw<{ authority: string; source: string; coverage: Record<string, unknown> | null }[]>(sql`
    SELECT authority, source, coverage FROM jenan_map.boundary WHERE "releaseId" = ${releaseId}::uuid`);
  const bytes = files.filter((file) => file.kind !== "source").reduce((total, file) => total + Number(file.byteSize), 0);
  const started = performance.now();
  let code: string | null = null;
  try {
    if (!boundary) throw new MapError("RELEASE_NOT_READY");
    await validateReleaseArtifacts(files, true, boundary);
  } catch (error) {
    code = error instanceof MapError ? error.code : "VERIFICATION_ERROR";
  }
  const result: DeepVerification = {
    releaseId, version: release.version, status: code ? "failed" : "verified", code,
    durationMs: Math.round(performance.now() - started), bytes, checkedAt: new Date().toISOString(),
  };
  await audit(db, actor, "health.verify", releaseId, { result: result.status, code, durationMs: result.durationMs, bytes });
  return result;
}
