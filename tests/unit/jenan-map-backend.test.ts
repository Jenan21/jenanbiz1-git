import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), user: vi.fn(), admin: vi.fn(),
  origin: vi.fn(), rate: vi.fn(), openArtifact: vi.fn(), storageRoot: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query, $executeRaw: mocks.execute, $transaction: mocks.transaction } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/authorization", () => ({ hasPlatformAdminAccess: mocks.admin }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: mocks.origin }));
vi.mock("@/lib/rate-limit/route-rate-limit", () => ({ enforceRouteRateLimit: mocks.rate }));

import { byteRange, downloadMetadata, openArtifact, safeStorageKey, storageRoot } from "@/services/jenan-map/storage";
import { commandSchema, locationSchema, savedLocationSchema, searchSchema, type Artifact } from "@/services/jenan-map/contracts";
import { command, exportManifest, manifest, previewManifest, publishedRelease, saveLocation, savedLocation, search, snapshot, validateLocation } from "@/services/jenan-map/service";
import { GET as publicManifest } from "@/app/api/jenan-map/route";
import { GET as adminSnapshot, POST as adminCommand } from "@/app/api/admin/jenan-map/route";
import { GET as publicArtifact } from "@/app/api/jenan-map/artifacts/[artifactId]/route";
import { GET as adminArtifact } from "@/app/api/admin/jenan-map/artifacts/[artifactId]/route";
import { GET as adminExport } from "@/app/api/admin/jenan-map/export/route";
import { GET as adminPreview } from "@/app/api/admin/jenan-map/preview/route";
import { GET as adminSearch } from "@/app/api/admin/jenan-map/search/route";
import { POST as adminValidate } from "@/app/api/admin/jenan-map/validate/route";
import { GET as adminReleaseExport } from "@/app/api/admin/jenan-map/releases/[releaseId]/export/route";
import { GET as getSavedLocation, PUT as putSavedLocation } from "@/app/api/jenan-map/location/route";
import { POST as validateEndpoint } from "@/app/api/jenan-map/validate/route";
import { GET as searchEndpoint } from "@/app/api/jenan-map/search/route";

const releaseId = "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1";
const artifactId = "2c1b5f07-9581-4e3b-a0a3-9fc7ea08ead2";
const otherId = "3c1b5f07-9581-4e3b-a0a3-9fc7ea08ead3";
const state = { status: "enabled", publishedReleaseId: releaseId, revision: 4 };
const release = { id: releaseId, version: "v1", status: "Published", publishedAt: new Date(), reviewedBy: "admin", reviewedAt: new Date() };
const root = path.resolve(".jenan-map-backend-test");
const bytes = Buffer.from('{"type":"FeatureCollection","features":[]}');
const checksum = createHash("sha256").update(bytes).digest("hex");
const artifact: Artifact = { id: artifactId, releaseId, kind: "geojson", storageKey: `${releaseId}/${checksum}.geojson`, filename: "places.geojson", mime: "application/geo+json", byteSize: BigInt(bytes.length), sha256: checksum, publicSafe: true };
const readyArtifacts: Artifact[] = [
  artifact,
  { ...artifact, id: otherId, kind: "style", storageKey: `${releaseId}/${checksum}.json`, filename: "style.json", mime: "application/json" },
  { ...artifact, id: "4c1b5f07-9581-4e3b-a0a3-9fc7ea08ead4", kind: "pmtiles", storageKey: `${releaseId}/${checksum}.pmtiles`, filename: "basemap.pmtiles", mime: "application/vnd.pmtiles" },
  { ...artifact, id: "5c1b5f07-9581-4e3b-a0a3-9fc7ea08ead5", kind: "glyphs", filename: "glyphs.bin" },
  { ...artifact, id: "6c1b5f07-9581-4e3b-a0a3-9fc7ea08ead6", kind: "schema", filename: "schema.json", publicSafe: false },
  { ...artifact, id: "7c1b5f07-9581-4e3b-a0a3-9fc7ea08ead7", kind: "coverage", filename: "coverage.json", publicSafe: false },
];
async function writeReadyFixtures() {
  await mkdir(path.join(root, releaseId), { recursive: true });
  for (const file of readyArtifacts) await writeFile(path.join(root, file.storageKey), bytes);
}
const request = (url = "/api/jenan-map") => new NextRequest(`http://localhost${url}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "user", systemRole: "ADMIN" });
  mocks.admin.mockReturnValue(true);
  mocks.origin.mockReturnValue(true);
  mocks.rate.mockResolvedValue(null);
  mocks.transaction.mockImplementation(async (callback) => callback({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
  process.env.JENAN_MAP_STORAGE_ROOT = root;
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  delete process.env.JENAN_MAP_STORAGE_ROOT;
});

describe("Jenan Map strict inputs and byte ranges", () => {
  it("rejects swapped/out-of-range/nonfinite or untyped coordinates", () => {
    expect(locationSchema.safeParse({ latitude: "24", longitude: 46 }).success).toBe(false);
    expect(locationSchema.safeParse({ latitude: 91, longitude: 46 }).success).toBe(false);
    expect(locationSchema.safeParse({ latitude: NaN, longitude: 46 }).success).toBe(false);
    expect(locationSchema.safeParse({ latitude: 24, longitude: 46, bypass: true }).success).toBe(false);
  });
  it("bounds search radius in meters and requires paired coordinates", () => {
    expect(searchSchema.safeParse({ q: "الرياض", latitude: 24 }).success).toBe(false);
    expect(searchSchema.safeParse({ q: "الرياض", radiusMeters: 50_001 }).success).toBe(false);
    expect(searchSchema.parse({ q: "الرياض" }).radiusMeters).toBe(10_000);
  });
  it("requires explicit confirmations and rejects arbitrary commands", () => {
    expect(commandSchema.safeParse({ action: "delete", releaseId }).success).toBe(false);
    expect(commandSchema.safeParse({ action: "publish", releaseId, expectedRevision: 0, reason: "Review passed", confirmation: "yes" }).success).toBe(false);
  });
  it("supports bounded, suffix and open ranges, rejects multiple/invalid ranges", () => {
    expect(byteRange(null, 100)).toBeNull();
    expect(byteRange("bytes=5-9", 100)).toEqual({ start: 5, end: 9 });
    expect(byteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(byteRange("bytes=95-", 100)).toEqual({ start: 95, end: 99 });
    expect(byteRange("bytes=95-200", 100)).toEqual({ start: 95, end: 99 });
    for (const value of ["bytes=100-", "bytes=-0", "bytes=9-1", "bytes=0-2,5-9", "bytes=-", "items=0-2"]) {
      expect(() => byteRange(value, 100)).toThrow();
    }
  });
});

describe("private immutable storage", () => {
  it("requires configured private storage and rejects traversal", () => {
    delete process.env.JENAN_MAP_STORAGE_ROOT;
    expect(() => storageRoot()).toThrow("PRIVATE_STORAGE_NOT_CONFIGURED");
    process.env.JENAN_MAP_STORAGE_ROOT = path.resolve("public/maps");
    expect(() => storageRoot()).toThrow("PRIVATE_STORAGE_REQUIRED");
    expect(() => safeStorageKey("../../secret")).toThrow();
  });
  it("retains portable glyph/image extensions and sanitizes download headers", () => {
    expect(downloadMetadata({ ...artifact, filename: "glyphs.pbf", mime: "application/x-protobuf" })).toEqual({ filename: "glyphs.pbf", mime: "application/x-protobuf" });
    expect(downloadMetadata({ ...artifact, filename: "sprite.png", mime: "image/png" })).toEqual({ filename: "sprite.png", mime: "image/png" });
    expect(downloadMetadata({ ...artifact, filename: "../../bad\r\n.html", mime: "text/html" })).toEqual({ filename: "bad__.geojson", mime: "application/geo+json" });
  });
  it("checks file size and SHA-256 before streaming", async () => {
    await mkdir(path.join(root, releaseId), { recursive: true });
    await writeFile(path.join(root, artifact.storageKey), bytes);
    await (await openArtifact(artifact)).close();
    await writeFile(path.join(root, artifact.storageKey), Buffer.alloc(bytes.length, "x"));
    await expect(openArtifact(artifact)).rejects.toThrow("ARTIFACT_INTEGRITY_FAILED");
  });
  it("refuses final symlinks", async () => {
    await mkdir(path.join(root, releaseId), { recursive: true });
    const original = path.join(root, "original");
    await writeFile(original, bytes);
    await symlink(original, path.join(root, artifact.storageKey));
    await expect(openArtifact(artifact)).rejects.toThrow();
  });
  it("keeps hot range reads bounded while permitting forced publication/export checks", async () => {
    await mkdir(path.join(root, releaseId), { recursive: true });
    await writeFile(path.join(root, artifact.storageKey), bytes);
    const first = await openArtifact(artifact);
    const stream = vi.spyOn(Object.getPrototypeOf(first), "createReadStream");
    await first.close();
    try {
      await (await openArtifact(artifact)).close();
      expect(stream).not.toHaveBeenCalled();
      await (await openArtifact(artifact, true)).close();
      expect(stream).toHaveBeenCalledTimes(1);
    } finally { stream.mockRestore(); }
  });
});

describe("publication and owned spatial queries", () => {
  it("reports a truthful no-release state and never creates sample data", async () => {
    mocks.query.mockResolvedValueOnce([{ ...state, publishedReleaseId: null }]);
    expect(await manifest()).toEqual({ status: "unavailable", release: null, reason: "NO_PUBLISHED_RELEASE" });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("omits private source artifacts and storage keys from public manifests", async () => {
    await writeReadyFixtures();
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release])
      .mockResolvedValueOnce([...readyArtifacts, { ...artifact, id: otherId, kind: "source", publicSafe: false }]);
    const value = await manifest();
    expect(value.release?.artifacts).toHaveLength(4);
    expect(JSON.stringify(value)).not.toContain("storageKey");
    expect(JSON.stringify(value)).not.toContain("source.bin");
  });
  it("rejects access to retired release IDs", async () => {
    mocks.query.mockResolvedValueOnce([state]);
    await expect(publishedRelease(otherId)).rejects.toThrow("RELEASE_NOT_PUBLISHED");
  });
  it("fails closed without authoritative boundary even for Saudi-looking coordinates", async () => {
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release]).mockResolvedValueOnce([]);
    await expect(validateLocation(24.7, 46.7)).rejects.toThrow("AUTHORITATIVE_BOUNDARY_UNAVAILABLE");
  });
  it("validates exact geometry rather than a bounding rectangle", async () => {
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release]).mockResolvedValueOnce([{ inside: false }]);
    await expect(validateLocation(24.7, 46.7)).rejects.toMatchObject({ status: 422 });
    expect(mocks.query.mock.calls[2][0].text).toContain("ST_Covers");
    expect(mocks.query.mock.calls[2][0].text).not.toContain("BETWEEN");
  });
  it("uses parameterized indexed PostGIS geography distances in meters", async () => {
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release]).mockResolvedValueOnce([{ id: "boundary" }])
      .mockResolvedValueOnce([state]).mockResolvedValueOnce([release]).mockResolvedValueOnce([{ inside: true }]).mockResolvedValueOnce([]);
    const q = "x'); DROP TABLE release; --";
    await search({ q, latitude: 24, longitude: 46, radiusMeters: 1234 });
    const query = mocks.query.mock.calls.at(-1)![0];
    expect(query.text).toContain("ST_DWithin");
    expect(query.text).toContain("::geography");
    expect(query.text).toContain("f.search @@");
    expect(query.text).not.toContain(q);
    expect(query.values).toContain(q);
    expect(query.values).toContain(1234);
  });
  it("rejects stale publish and mismatched rollback confirmations transactionally", async () => {
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([{ ...release, status: "Approved" }]);
    await expect(command({ action: "publish", releaseId, expectedRevision: 3, expectedPublishedReleaseId: releaseId, confirmation: "PUBLISH", reason: "Reviewed and confirmed" }, "admin")).rejects.toThrow("STALE_REVISION");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.transaction.mock.calls[0][1]).toMatchObject({ isolationLevel: "Serializable" });
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([{ ...release, status: "Archived" }]);
    await expect(command({ action: "rollback", releaseId, expectedRevision: 4, expectedPublishedReleaseId: releaseId, confirmation: "PUBLISH", reason: "Rollback confirmed" }, "admin")).rejects.toThrow("EXPLICIT_CONFIRMATION_REQUIRED");
  });
  it("maps raw PostgreSQL serialization/deadlock failures to safe retry conflicts", async () => {
    for (const code of ["40001", "40P01", "23505"]) {
      mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("raw conflict", { code: "P2010", clientVersion: "7.10.0", meta: { code } }));
      await expect(command({ action: "publish", releaseId, expectedRevision: 4, expectedPublishedReleaseId: releaseId, confirmation: "PUBLISH", reason: "Reviewed release confirmed" }, "admin")).rejects.toMatchObject({ code: "CONCURRENT_CHANGE_RETRY", status: 409 });
    }
    mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("adapter conflict", {
      code: "P2010", clientVersion: "7.10.0", meta: { driverAdapterError: { cause: { originalCode: "40001" } } },
    }));
    await expect(command({ action: "publish", releaseId, expectedRevision: 4, expectedPublishedReleaseId: releaseId, confirmation: "PUBLISH", reason: "Reviewed release confirmed" }, "admin")).rejects.toMatchObject({ code: "CONCURRENT_CHANGE_RETRY", status: 409 });
  });
  it("requires both the expected pointer and revision before publication", async () => {
    expect(commandSchema.safeParse({ action: "publish", releaseId, expectedRevision: 4, confirmation: "PUBLISH", reason: "Release confirmed" }).success).toBe(false);
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([{ ...release, status: "Approved" }]);
    await expect(command({ action: "publish", releaseId, expectedRevision: 4, expectedPublishedReleaseId: null, confirmation: "PUBLISH", reason: "Release confirmed" }, "admin")).rejects.toThrow("STALE_PUBLISHED_POINTER");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("cannot enable before any release exists or archive the active release", async () => {
    mocks.query.mockResolvedValueOnce([{ ...state, publishedReleaseId: null }]);
    await expect(command({ action: "runtime", status: "enabled", expectedRevision: 4, reason: "Enable the service", confirmation: "CHANGE RUNTIME" }, "admin")).rejects.toThrow("NO_PUBLISHED_RELEASE");
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release]);
    await expect(command({ action: "archive", releaseId, reason: "Archive this release", confirmation: "ARCHIVE" }, "admin")).rejects.toThrow("ACTIVE_RELEASE_CANNOT_BE_ARCHIVED");
  });
  it("stores runtime changes and audit in the same serializable transaction", async () => {
    mocks.query.mockResolvedValueOnce([state]);
    const maintenanceMessage = "الخريطة قيد الصيانة، يرجى المحاولة لاحقًا";
    await command({ action: "runtime", status: "maintenance", maintenanceMessage, expectedRevision: 4, reason: "Planned maintenance", confirmation: "CHANGE RUNTIME" }, "admin");
    expect(mocks.execute.mock.calls[0][0].text).toContain("UPDATE jenan_map.runtime");
    expect(mocks.execute.mock.calls[0][0].values).toContain(maintenanceMessage);
    expect(mocks.execute.mock.calls[1][0].text).toContain("INSERT INTO jenan_map.audit");
    expect(mocks.execute.mock.calls[1][0].values).toContain("admin");
  });
  it("publishes verified retained artifacts, archives old pointer and audits atomically", async () => {
    await writeReadyFixtures();
    mocks.query.mockResolvedValueOnce([{ ...state, publishedReleaseId: otherId }])
      .mockResolvedValueOnce([{ ...release, status: "Approved" }])
      .mockResolvedValueOnce([{ boundaries: BigInt(1), features: BigInt(1) }])
      .mockResolvedValueOnce(readyArtifacts);
    const result = await command({ action: "publish", releaseId, expectedRevision: 4, expectedPublishedReleaseId: otherId, reason: "Release review approved", confirmation: "PUBLISH" }, "admin");
    expect(result).toMatchObject({ action: "publish", revision: 5 });
    const statements = mocks.execute.mock.calls.map(([query]) => query.text);
    expect(statements[0]).toContain("status = 'Archived'");
    expect(statements[1]).toContain("status = 'Published'");
    expect(statements[2]).toContain('"publishedReleaseId"');
    expect(statements[3]).toContain("INSERT INTO jenan_map.audit");
    expect(statements.join(" ")).not.toMatch(/\bDELETE\b/);
  });
  it("restores only a previously published archived release without deleting artifacts", async () => {
    await writeReadyFixtures();
    mocks.query.mockResolvedValueOnce([{ ...state, publishedReleaseId: otherId }])
      .mockResolvedValueOnce([{ ...release, status: "Archived" }])
      .mockResolvedValueOnce([{ boundaries: BigInt(1), features: BigInt(1) }])
      .mockResolvedValueOnce(readyArtifacts);
    expect(await command({ action: "rollback", releaseId, expectedRevision: 4, expectedPublishedReleaseId: otherId, reason: "Restore reviewed release", confirmation: "ROLLBACK" }, "admin")).toMatchObject({ action: "rollback", revision: 5 });
    const statements = mocks.execute.mock.calls.map(([query]) => query.text).join(" ");
    expect(statements).toContain('COALESCE("publishedAt",now())');
    expect(statements).not.toMatch(/\bDELETE\b/);
  });
  it("does not approve a release without verified authoritative data", async () => {
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([{ ...release, status: "Ready" }])
      .mockResolvedValueOnce([{ boundaries: BigInt(0), features: BigInt(1) }]).mockResolvedValueOnce([artifact]);
    await expect(command({ action: "approve", releaseId, reason: "Human review confirmed", confirmation: "APPROVE" }, "admin")).rejects.toThrow("RELEASE_NOT_READY");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("exports private artifacts only in the admin portable manifest with checksums", async () => {
    await writeReadyFixtures();
    mocks.query.mockResolvedValueOnce([release]).mockResolvedValueOnce([artifact, { ...artifact, id: otherId, publicSafe: false, kind: "source" }]);
    const value = await exportManifest(releaseId);
    expect(value.artifacts).toHaveLength(2);
    expect(value.artifacts[0].url).toContain("/api/admin/jenan-map/");
    expect(value.artifacts[0].sha256).toBe(checksum);
    expect(value.portableGeojsonAvailable).toBe(true);
    expect(value).not.toHaveProperty("expiresAt");
    expect(value.artifacts[0].url).not.toContain("expires=");
    expect(value.release).not.toHaveProperty("reviewedBy");
    expect(value.authorization).toContain("no independent link expiry");
  });
  it("previews reviewed build candidates through exclusively admin artifact endpoints", async () => {
    await mkdir(path.join(root, releaseId), { recursive: true });
    await writeFile(path.join(root, artifact.storageKey), bytes);
    mocks.query.mockResolvedValueOnce([{ ...release, status: "Ready" }]).mockResolvedValueOnce([artifact]);
    const result = await previewManifest(releaseId);
    expect(result.preview).toBe(true);
    expect(result.release.layers[0].url).toContain("/api/admin/jenan-map/artifacts/");
    mocks.query.mockResolvedValueOnce([{ ...release, status: "Processing" }]);
    await expect(previewManifest(releaseId)).rejects.toThrow("PREVIEW_NOT_READY");
  });
  it("does not advertise enabled map data when retained files are missing", async () => {
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release]).mockResolvedValueOnce([artifact]);
    await expect(manifest()).rejects.toThrow();
  });
  it("exposes only safe admin artifact metadata and honest storage/capabilities", async () => {
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release]).mockResolvedValueOnce([]).mockResolvedValueOnce([artifact]);
    const result = await snapshot();
    expect(result.artifacts[0]).toMatchObject({ releaseId, publicSafe: true, byteSize: String(bytes.length), url: `/api/admin/jenan-map/artifacts/${artifactId}` });
    expect(JSON.stringify(result.artifacts)).not.toContain("storageKey");
    expect(result.storage).toEqual({ status: "unavailable", configured: true });
    expect(result.capabilities).toContain("rollback");
    expect(result.previewAvailable).toBe(true);
    expect(result.exportAvailable).toBe(true);
  });
  it("validates admin preview geometry against the pinned unpublished release", async () => {
    mocks.query.mockResolvedValueOnce([{ ...release, status: "Ready" }]).mockResolvedValueOnce([{ inside: true }]);
    expect(await validateLocation(24, 46, releaseId, true)).toEqual({ valid: true, latitude: 24, longitude: 46, releaseId });
    expect(mocks.query.mock.calls[0][0].text).toContain("FROM jenan_map.release");
    expect(mocks.query.mock.calls.some(([query]) => query.text.includes("jenan_map.runtime"))).toBe(false);
    await expect(validateLocation(24, 46, undefined, true)).rejects.toThrow("PREVIEW_RELEASE_REQUIRED");
  });
});

describe("API authorization, origin and byte serving", () => {
  it("requires authentication on all public and admin endpoints", async () => {
    mocks.user.mockResolvedValue(null);
    const context = { params: Promise.resolve({ artifactId }) };
    const responses = await Promise.all([
      publicManifest(request()), searchEndpoint(request("/api/jenan-map/search?q=Riyadh")),
      validateEndpoint(request()), adminSnapshot(request()), adminCommand(request()),
      publicArtifact(request(), context), adminArtifact(request(), context), adminExport(request()), adminPreview(request()), adminSearch(request()), adminValidate(request()), adminReleaseExport(request(), { params: Promise.resolve({ releaseId }) }), getSavedLocation(request()), putSavedLocation(request()),
    ]);
    expect(responses.map((response) => response.status)).toEqual(Array(14).fill(401));
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("requires admin on snapshots, exports, artifacts and commands", async () => {
    mocks.admin.mockReturnValue(false);
    const context = { params: Promise.resolve({ artifactId }) };
    const responses = await Promise.all([adminSnapshot(request()), adminCommand(request()), adminExport(request()), adminArtifact(request(), context), adminPreview(request()), adminSearch(request()), adminValidate(request()), adminReleaseExport(request(), { params: Promise.resolve({ releaseId }) })]);
    expect(responses.map((response) => response.status)).toEqual(Array(8).fill(403));
  });
  it("enforces origin before every mutation", async () => {
    mocks.origin.mockReturnValue(false);
    expect((await adminCommand(request())).status).toBe(403);
    expect((await validateEndpoint(request())).status).toBe(403);
    expect((await adminValidate(request())).status).toBe(403);
    expect((await putSavedLocation(request())).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("honors shared authenticated rate limits", async () => {
    mocks.rate.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await searchEndpoint(request())).status).toBe(429);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("shows blocked state when schema has not been provisioned", async () => {
    mocks.query.mockRejectedValue(new Error("schema missing"));
    expect(await (await publicManifest(request())).json()).toMatchObject({ status: "unavailable", release: null });
    expect(await (await adminSnapshot(request())).json()).toMatchObject({ available: false, blockers: ["MAP_NOT_PROVISIONED_OR_UNAVAILABLE"] });
  });
  it("streams authenticated byte ranges with checksum and private cache headers", async () => {
    await mkdir(path.join(root, releaseId), { recursive: true });
    await writeFile(path.join(root, artifact.storageKey), bytes);
    mocks.query.mockResolvedValueOnce([artifact]).mockResolvedValueOnce([state]).mockResolvedValueOnce([release]);
    const response = await publicArtifact(new NextRequest("http://localhost/api/jenan-map/artifacts/" + artifactId, { headers: { range: "bytes=0-9" } }), { params: Promise.resolve({ artifactId }) });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes 0-9/${bytes.length}`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-checksum-sha256")).toBe(checksum);
    expect(await response.text()).toBe(bytes.subarray(0, 10).toString());
  });
  it("refuses nonpublic artifacts and never treats export URLs as bearer credentials", async () => {
    mocks.query.mockResolvedValueOnce([{ ...artifact, publicSafe: false }]).mockResolvedValueOnce([state]).mockResolvedValueOnce([release]);
    expect((await publicArtifact(request(), { params: Promise.resolve({ artifactId }) })).status).toBe(404);
    mocks.admin.mockReturnValue(false);
    expect((await adminArtifact(request("/api/admin/jenan-map/artifacts/" + artifactId), { params: Promise.resolve({ artifactId }) })).status).toBe(403);
  });
});

describe("owned saved map location", () => {
  const input = { latitude: 24.7, longitude: 46.7, releaseId, source: "map" as const };
  const location = { ...input, country: "SA", region: null, city: null, district: null, formattedAddress: null, selectedAt: new Date("2026-10-17T13:00:00Z") };

  it("rejects client ownership, addresses, timestamps and unpinned writes", () => {
    expect(savedLocationSchema.safeParse(input).success).toBe(true);
    for (const extra of [{ userId: "another-user" }, { city: "invented" }, { selectedAt: new Date().toISOString() }]) {
      expect(savedLocationSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    }
    expect(savedLocationSchema.safeParse({ latitude: 24, longitude: 46, source: "map" }).success).toBe(false);
  });
  it("loads only session-owned locations, including an honest empty state", async () => {
    mocks.query.mockResolvedValueOnce([]);
    expect(await savedLocation("session-user")).toBeNull();
    expect(mocks.query.mock.calls[0][0].values).toEqual(["session-user"]);
    mocks.query.mockResolvedValueOnce([location]);
    const response = await getSavedLocation(request("/api/jenan-map/location?userId=another-user"));
    expect(await response.json()).toMatchObject({ location: { latitude: input.latitude, country: "SA", city: null } });
    expect(mocks.query.mock.calls[1][0].values).toEqual(["user"]);
  });
  it("saves fresh server-only addresses/timestamp and audit atomically against the pinned Saudi boundary", async () => {
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release])
      .mockResolvedValueOnce([{ inside: true }]).mockResolvedValueOnce([location]);
    expect(await saveLocation(input, "session-user")).toEqual(location);
    const write = mocks.query.mock.calls[3][0];
    expect(write.text).toContain('ON CONFLICT ("userId") DO UPDATE');
    expect(write.text).toContain('"selectedAt" = now()');
    expect(write.text).toContain('"formattedAddress" = NULL');
    expect(write.values).toContain("session-user");
    expect(write.values).not.toContain("another-user");
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "Serializable" });
    expect(mocks.execute.mock.calls[0][0].text).toContain("jenan_map.audit");
    expect(mocks.execute.mock.calls[1][0].text).toContain('"AuditLog"');
  });
  it("never persists outside-country, missing-boundary or stale release selections", async () => {
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release]).mockResolvedValueOnce([{ inside: false }]);
    await expect(saveLocation(input, "user")).rejects.toMatchObject({ code: "OUTSIDE_SAUDI_ARABIA", status: 422 });
    mocks.query.mockResolvedValueOnce([state]).mockResolvedValueOnce([release]).mockResolvedValueOnce([]);
    await expect(saveLocation(input, "user")).rejects.toMatchObject({ code: "AUTHORITATIVE_BOUNDARY_UNAVAILABLE", status: 503 });
    mocks.query.mockResolvedValueOnce([{ ...state, publishedReleaseId: otherId }]);
    await expect(saveLocation(input, "user")).rejects.toMatchObject({ code: "RELEASE_NOT_PUBLISHED", status: 409 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("PUT rejects spoofed user/address data before database writes", async () => {
    const response = await putSavedLocation(new NextRequest("http://localhost/api/jenan-map/location", {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, userId: "another-user", city: "invented" }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe("offline import safety", () => {
  it("accepts only fixed CLI flags/local manifest names and strips private properties", async () => {
    const scriptPath = "../../scripts/jenan-map/build.mjs";
    const { parseArguments, normalizeFeatures } = await import(scriptPath);
    expect(() => parseArguments(["--release", releaseId, "--manifest", "https://remote/data.json"])).toThrow();
    expect(() => parseArguments(["--release", releaseId, "--manifest", "../data.json"])).toThrow();
    expect(parseArguments(["--release", releaseId, "--manifest", "import.json"])).toEqual({ releaseId, manifest: "import.json" });
    const value = normalizeFeatures({ type: "FeatureCollection", features: [{ type: "Feature", properties: { label: "الرياض", privateContact: "secret", category: "city" }, geometry: { type: "Point", coordinates: [46.7, 24.7] } }] });
    expect(value.features[0].properties).toEqual({ label: "الرياض", category: "city" });
    expect(() => normalizeFeatures({ type: "FeatureCollection", features: [] })).toThrow();
  });
});
