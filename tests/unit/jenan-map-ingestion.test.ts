import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), user: vi.fn(), admin: vi.fn(), origin: vi.fn(), rate: vi.fn(), releaseLayers: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query, $executeRaw: mocks.execute, $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/authorization", () => ({ hasPlatformAdminAccess: mocks.admin }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: mocks.origin }));
vi.mock("@/lib/rate-limit/route-rate-limit", () => ({ enforceRouteRateLimit: mocks.rate }));
vi.mock("@/services/jenan-map/layers", async (original) => ({
  ...await original<typeof import("@/services/jenan-map/layers")>(), releaseManifestLayers: mocks.releaseLayers,
}));
import { importSchema, ingestArtifact, localImportStream, type ImportInput } from "@/services/jenan-map/ingestion";
import { servedStyle } from "@/services/jenan-map/service";
import { releaseAssetResponse } from "@/services/jenan-map/http";
import { POST } from "@/app/api/admin/jenan-map/releases/[releaseId]/artifacts/route";
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
it("streams an operator staged binary and refuses traversal and symlinks", async () => {
  await writeFile(path.join(staging, "owned.pmtiles"), fixture.bytes);
  await ingestArtifact(releaseId, metadata, await localImportStream("owned.pmtiles"), "admin");
  await expect(localImportStream("../owned.pmtiles")).rejects.toThrow("INVALID_STAGED_FILENAME");
  await symlink(path.join(staging, "owned.pmtiles"), path.join(staging, "link.pmtiles"));
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
