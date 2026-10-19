import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), user: vi.fn(), admin: vi.fn(), origin: vi.fn(), rate: vi.fn(), releaseLayers: vi.fn(), bindLayers: vi.fn(), readyLayers: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query, $executeRaw: mocks.execute, $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/authorization", () => ({ hasPlatformAdminAccess: mocks.admin }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: mocks.origin }));
vi.mock("@/lib/rate-limit/route-rate-limit", () => ({ enforceRouteRateLimit: mocks.rate }));
vi.mock("@/services/jenan-map/layers", async (original) => ({
  ...await original<typeof import("@/services/jenan-map/layers")>(), releaseManifestLayers: mocks.releaseLayers, bindReleaseLayers: mocks.bindLayers, releaseMapLayers: mocks.readyLayers,
}));
import { importSchema, ingestArtifact, localImportStream, type ImportInput } from "@/services/jenan-map/ingestion";
import { servedStyle } from "@/services/jenan-map/service";
import { access, MAP_ASSET_REQUESTS_PER_MINUTE, releaseAssetResponse } from "@/services/jenan-map/http";
import { POST } from "@/app/api/admin/jenan-map/releases/[releaseId]/artifacts/route";
import { ingestLayerBindings, bindLayersSchema } from "@/services/jenan-map/layer-ingestion";
import { POST as bindLayers } from "@/app/api/admin/jenan-map/releases/[releaseId]/layers/route";
import { fixtureReleaseId as releaseId, readyFixtureFiles } from "./jenan-map-artifact-fixtures";
const root = path.resolve(".jenan-map-ingestion-test"), staging = path.resolve(".jenan-map-staging-test");
const fixture = readyFixtureFiles()[2];
const metadata: ImportInput = { kind: "pmtiles", filename: "basemap.pmtiles", sha256: fixture.artifact.sha256, byteSize: fixture.bytes.length, publicSafe: true, exportAllowed: true, exportLicense: "Fixture license: export permitted", confirmation: "IMPORT OWNED MAP ARTIFACT" };
beforeEach(async () => {
  vi.resetAllMocks();
  await mkdir(root, { mode: 0o700 }); await mkdir(staging, { mode: 0o700 });
  process.env.JENAN_MAP_STORAGE_ROOT = root; process.env.JENAN_MAP_STAGING_ROOT = staging;
  mocks.query.mockResolvedValue([{ status: "Draft" }]);
  mocks.transaction.mockImplementation(async (fn) => fn({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
  mocks.user.mockResolvedValue({ id: "admin", systemRole: "ADMIN" }); mocks.admin.mockReturnValue(true); mocks.origin.mockReturnValue(true); mocks.rate.mockResolvedValue(null);
  mocks.releaseLayers.mockResolvedValue([]);
});
afterEach(async () => {
  delete process.env.JENAN_MAP_STORAGE_ROOT; delete process.env.JENAN_MAP_STAGING_ROOT;
  await rm(root, { recursive: true, force: true }); await rm(staging, { recursive: true, force: true });
});
const context = () => ({ params: Promise.resolve({ releaseId }) });
it("imports actual multipart binary bytes, immutable storage and both audit records", async () => {
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata)); form.set("file", new File([fixture.bytes], "basemap.pmtiles"));
  const response = await POST(new NextRequest("http://localhost/api/admin/jenan-map/releases/" + releaseId + "/artifacts", { method: "POST", body: form }), context());
  expect(response.status).toBe(201);
  expect(await readdir(path.join(root, releaseId))).toEqual([path.basename(fixture.artifact.storageKey)]);
  expect(mocks.execute.mock.calls.map(([q]) => q.text).join(" ")).toContain('INSERT INTO "AuditLog"');
});
it("streams an operator staged binary and refuses traversal and symlinks", async (context) => {
  await writeFile(path.join(staging, "owned.pmtiles"), fixture.bytes);
  await ingestArtifact(releaseId, metadata, await localImportStream("owned.pmtiles"), "admin");
  await expect(localImportStream("../owned.pmtiles")).rejects.toThrow("INVALID_STAGED_FILENAME");
  // Windows lets only elevated accounts create symlinks; without that there is nothing to refuse.
  try { await symlink(path.join(staging, "owned.pmtiles"), path.join(staging, "link.pmtiles")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") return context.skip(); throw error; }
  await expect(localImportStream("link.pmtiles")).rejects.toThrow();
});
it("cleans pending files but retains immutable bytes after transaction failure, permitting a checksum-verified retry", async () => {
  mocks.execute.mockRejectedValueOnce(new Error("database write failed"));
  await expect(ingestArtifact(releaseId, metadata, Readable.from([fixture.bytes]), "admin")).rejects.toThrow("database write failed");
  expect(await readdir(path.join(root, releaseId))).toEqual([path.basename(fixture.artifact.storageKey)]);
  await expect(ingestArtifact(releaseId, metadata, Readable.from([fixture.bytes]), "admin")).resolves.toMatchObject({ reviewRequired: true });
});
it.each(["Approved", "Published", "Archived", "Processing"])("does not attach new bytes to a %s release", async (status) => {
  mocks.query.mockResolvedValue([{ status }]);
  await expect(ingestArtifact(releaseId, metadata, Readable.from([fixture.bytes]), "admin")).rejects.toThrow("IMPORT_REQUIRES_UNREVIEWED_RELEASE");
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("refuses wrong checksums and over-limit content before registration", async () => {
  await expect(ingestArtifact(releaseId, { ...metadata, sha256: "a".repeat(64) }, Readable.from([fixture.bytes]), "admin")).rejects.toThrow("IMPORT_CHECKSUM_OR_SIZE_MISMATCH");
  await expect(ingestArtifact(releaseId, { ...metadata, byteSize: 1 }, Readable.from([fixture.bytes]), "admin")).rejects.toThrow("IMPORT_SIZE_MISMATCH");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("rejects upload before reading a body when admin/origin checks fail", async () => {
  mocks.admin.mockReturnValue(false);
  expect((await POST(new NextRequest("http://localhost", { method: "POST" }), context())).status).toBe(403);
  mocks.admin.mockReturnValue(true); mocks.origin.mockReturnValue(false);
  expect((await POST(new NextRequest("http://localhost", { method: "POST" }), context())).status).toBe(403);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("caps staged JSON input at 16 KiB while reading instead of trusting Content-Length", async () => {
  const response = await POST(new NextRequest("http://localhost", {
    method: "POST", headers: { "content-type": "application/json", "content-length": "1" },
    body: JSON.stringify({ oversized: "x".repeat(16 * 1024) }),
  }), context());
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: "IMPORT_JSON_TOO_LARGE" });
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("rejects noncandidate releases without consuming binary streams or HTTP bodies", async () => {
  mocks.query.mockResolvedValue([{ status: "Published" }]);
  let consumed = false;
  async function* stream() { consumed = true; yield fixture.bytes; }
  await expect(ingestArtifact(releaseId, metadata, stream(), "admin")).rejects.toThrow("IMPORT_REQUIRES_UNREVIEWED_RELEASE");
  expect(consumed).toBe(false);
  const request = new NextRequest("http://localhost", { method: "POST", body: JSON.stringify({ unused: true }) });
  expect((await POST(request, context())).status).toBe(409);
  expect(request.bodyUsed).toBe(false);
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("rechecks candidate status transactionally after consuming verified bytes", async () => {
  mocks.query.mockResolvedValueOnce([{ status: "Draft" }]).mockResolvedValueOnce([{ status: "Approved" }]);
  await expect(ingestArtifact(releaseId, metadata, Readable.from([fixture.bytes]), "admin")).rejects.toThrow("IMPORT_REQUIRES_UNREVIEWED_RELEASE");
  expect(mocks.transaction).toHaveBeenCalledOnce();
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("requires a license attestation for export and prevents evidence becoming public", () => {
  expect(importSchema.safeParse({ ...metadata, exportLicense: undefined }).success).toBe(false);
  expect(importSchema.safeParse({ ...metadata, kind: "coverage", filename: "coverage.json" }).success).toBe(false);
});
it("rewrites only release-pinned style references for private preview", async () => {
  const style = readyFixtureFiles()[1];
  await mkdir(path.join(root, releaseId));
  await writeFile(path.join(root, style.artifact.storageKey), style.bytes);
  const output = await servedStyle(style.artifact, true);
  expect(output.glyphs).toContain(`/api/admin/jenan-map/releases/${releaseId}/glyphs/`);
  expect(output.sources.basemap.url).toContain(`pmtiles:///api/admin/jenan-map/releases/${releaseId}/pmtiles/`);
});
it("public asset delivery refuses an unpublished release and preview refuses non-admin", async () => {
  mocks.query.mockResolvedValueOnce([{ status: "enabled", publishedReleaseId: "2c1b5f07-9581-4e3b-a0a3-9fc7ea08ead2" }]);
  expect((await releaseAssetResponse(new NextRequest("http://localhost"), releaseId, ["glyphs", "Noto", "0-255.pbf"], false)).status).toBe(404);
  mocks.admin.mockReturnValue(false);
  expect((await releaseAssetResponse(new NextRequest("http://localhost"), releaseId, ["glyphs", "Noto", "0-255.pbf"], true)).status).toBe(403);
});
it.each([false, true])("serves exact release-pinned glyph bytes with private caching (preview=%s)", async (admin) => {
  const glyph = readyFixtureFiles()[3];
  await mkdir(path.join(root, releaseId)); await writeFile(path.join(root, glyph.artifact.storageKey), glyph.bytes);
  if (admin) mocks.query.mockResolvedValueOnce([{ status: "Ready" }]).mockResolvedValueOnce([glyph.artifact]);
  else mocks.query.mockResolvedValueOnce([{ status: "enabled", publishedReleaseId: releaseId }])
    .mockResolvedValueOnce([{ status: "Published" }]).mockResolvedValueOnce([glyph.artifact]);
  const response = await releaseAssetResponse(new NextRequest("http://localhost"), releaseId, ["glyphs", "Noto", "0-255.pbf"], admin);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-type")).toBe("application/x-protobuf");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(glyph.bytes);
});
it.each([[false, 403], [true, 200]])("a release asset download needs the artifact's export permission (exportAllowed=%s -> %s)", async (exportAllowed, status) => {
  const glyph = readyFixtureFiles()[3];
  await mkdir(path.join(root, releaseId)); await writeFile(path.join(root, glyph.artifact.storageKey), glyph.bytes);
  mocks.query.mockResolvedValueOnce([{ status: "Ready" }]).mockResolvedValueOnce([{ ...glyph.artifact, exportAllowed }]);
  const response = await releaseAssetResponse(new NextRequest("http://localhost/?download=1"), releaseId, ["glyphs", "Noto", "0-255.pbf"], true);
  expect(response.status).toBe(status);
  if (status === 403) expect(await response.json()).toMatchObject({ error: "EXPORT_LICENSE_PERMISSION_REQUIRED" });
  else expect(response.headers.get("content-disposition")).toContain("attachment");
});
it.each([
  ["a published map", false, "http://localhost/", "jenan-map:assets", MAP_ASSET_REQUESTS_PER_MINUTE],
  ["an administrator's preview", true, "http://localhost/", "jenan-map:assets", MAP_ASSET_REQUESTS_PER_MINUTE],
  ["an export download", true, "http://localhost/?download=1", "jenan-map:admin", 60],
])("painting %s spends the asset budget, but an export keeps the tight one", async (_name, admin, url, scope, limit) => {
  const glyph = readyFixtureFiles()[3];
  await mkdir(path.join(root, releaseId)); await writeFile(path.join(root, glyph.artifact.storageKey), glyph.bytes);
  if (admin) mocks.query.mockResolvedValueOnce([{ status: "Ready" }]).mockResolvedValueOnce([{ ...glyph.artifact, exportAllowed: true }]);
  else mocks.query.mockResolvedValueOnce([{ status: "enabled", publishedReleaseId: releaseId }])
    .mockResolvedValueOnce([{ status: "Published" }]).mockResolvedValueOnce([glyph.artifact]);
  expect((await releaseAssetResponse(new NextRequest(url), releaseId, ["glyphs", "Noto", "0-255.pbf"], admin)).status).toBe(200);
  expect(mocks.rate).toHaveBeenCalledWith(expect.anything(), { userId: "admin", scope, limit, windowMs: 60_000 });
});
it("keeps the small budgets that guard searches, saves and administrator actions", async () => {
  await access(new NextRequest("http://localhost/"));
  await access(new NextRequest("http://localhost/"), true);
  expect(mocks.rate.mock.calls.map(([, policy]) => [policy.scope, policy.limit])).toEqual([["jenan-map:read", 180], ["jenan-map:admin", 60]]);
  // One screen of map is dozens of ranged reads; the asset budget has to hold many screens a minute.
  expect(MAP_ASSET_REQUESTS_PER_MINUTE).toBeGreaterThanOrEqual(1000);
});
it("an inline (non-download) asset request does not need export permission", async () => {
  const glyph = readyFixtureFiles()[3];
  await mkdir(path.join(root, releaseId)); await writeFile(path.join(root, glyph.artifact.storageKey), glyph.bytes);
  mocks.query.mockResolvedValueOnce([{ status: "Ready" }]).mockResolvedValueOnce([{ ...glyph.artifact, exportAllowed: false }]);
  const response = await releaseAssetResponse(new NextRequest("http://localhost/"), releaseId, ["glyphs", "Noto", "0-255.pbf"], true);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toContain("inline");
});
it("derives layer binding style IDs from retained bytes under the candidate lock and audits", async () => {
  const style = readyFixtureFiles()[1];
  await mkdir(path.join(root, releaseId)); await writeFile(path.join(root, style.artifact.storageKey), style.bytes);
  mocks.query.mockResolvedValueOnce([{ status: "Ready" }]).mockResolvedValueOnce([style.artifact]);
  mocks.readyLayers.mockResolvedValue([{ id: "base", styleLayerIds: ["places"] }]);
  const input = bindLayersSchema.parse({ layers: [{ id: "base", styleLayerIds: ["places"], searchCategories: ["place"], visibility: "public" }], confirmation: "BIND MAP LAYERS" });
  const output = await ingestLayerBindings(releaseId, input, "admin");
  expect(output.reviewRequired).toBe(true);
  expect(mocks.bindLayers).toHaveBeenCalledWith(expect.anything(), releaseId, input.layers, ["places"]);
  expect(mocks.query.mock.calls[0][0].text).toContain("FOR UPDATE");
  expect(mocks.execute.mock.calls.map(([q]) => q.text).join(" ")).toContain('INSERT INTO "AuditLog"');
});
it("rejects implicit public visibility and client-invented actual style IDs in the binding endpoint", async () => {
  const input = { layers: [{ id: "base", styleLayerIds: ["places"] }], confirmation: "BIND MAP LAYERS", actualStyleIds: ["places"] };
  const response = await bindLayers(new NextRequest("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }), context());
  expect(response.status).toBe(400);
  expect(mocks.bindLayers).not.toHaveBeenCalled();
});
it("does not label layers encoded in a public basemap as private", async () => {
  const style = readyFixtureFiles()[1];
  mocks.query.mockResolvedValueOnce([{ status: "Ready" }]).mockResolvedValueOnce([style.artifact]);
  const input = bindLayersSchema.parse({ layers: [{ id: "base", styleLayerIds: ["places"], visibility: "internal" }], confirmation: "BIND MAP LAYERS" });
  await expect(ingestLayerBindings(releaseId, input, "admin")).rejects.toThrow("INTERNAL_LAYER_IN_PUBLIC_STYLE");
});
it("does not finalize a public style containing unbound layers", async () => {
  const style = readyFixtureFiles()[1];
  await mkdir(path.join(root, releaseId)); await writeFile(path.join(root, style.artifact.storageKey), style.bytes);
  mocks.query.mockResolvedValueOnce([{ status: "Ready" }]).mockResolvedValueOnce([style.artifact]);
  const input = bindLayersSchema.parse({ layers: [{ id: "base", styleLayerIds: ["unrelated"], visibility: "public" }], confirmation: "BIND MAP LAYERS" });
  await expect(ingestLayerBindings(releaseId, input, "admin")).rejects.toThrow("UNBOUND_PUBLIC_STYLE_LAYER");
  expect(mocks.bindLayers).not.toHaveBeenCalled();
});
it("hides globally unavailable bound style IDs in the delivered style", async () => {
  const style = readyFixtureFiles()[1];
  await mkdir(path.join(root, releaseId)); await writeFile(path.join(root, style.artifact.storageKey), style.bytes);
  mocks.releaseLayers.mockResolvedValue([{ id: "base", available: false, styleLayerIds: ["places"] }]);
  expect((await servedStyle(style.artifact, false)).layers[0].layout.visibility).toBe("none");
});
