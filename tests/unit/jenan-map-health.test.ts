import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), access: vi.fn(), runtime: vi.fn(), artifacts: vi.fn(), audit: vi.fn(), storageState: vi.fn(), objectStore: vi.fn(), validate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query } }));
vi.mock("@/services/jenan-map/service", () => ({ runtime: mocks.runtime, artifacts: mocks.artifacts, audit: mocks.audit }));
vi.mock("@/services/jenan-map/validation", () => ({ validateReleaseArtifacts: mocks.validate }));
vi.mock("@/services/jenan-map/storage", () => ({
  storageState: mocks.storageState, objectStore: mocks.objectStore, safeStorageKey: (key: string) => key,
  storageRoot: () => path.resolve(".jenan-map-health-test"),
}));
vi.mock("@/services/jenan-map/http", () => ({
  access: mocks.access,
  boundedBody: async (request: NextRequest) => Buffer.from(await request.text()),
  json: (body: unknown, status = 200) => NextResponse.json(body, { status }),
  failure: (error: { status?: number }) => NextResponse.json({ error: "FAILED" }, { status: error.status ?? 503 }),
}));

import { MapError } from "@/services/jenan-map/contracts";
import { measureHealth, verifyPublishedRelease } from "@/services/jenan-map/health";
import { GET, POST } from "@/app/api/admin/jenan-map/health/route";

const root = path.resolve(".jenan-map-health-test");
const releaseId = "2c1b5f07-9581-4e3b-a0a3-9fc7ea08ead2";
const tiles = { id: "a1", kind: "pmtiles", filename: "saudi.pmtiles", storageKey: `${releaseId}/tiles.pmtiles`, byteSize: BigInt(2048) };
const schema = { id: "a2", kind: "schema", filename: "schema.json", storageKey: `${releaseId}/schema.json`, byteSize: BigInt(64) };
const source = { id: "a3", kind: "source", filename: "evidence.zip", storageKey: `${releaseId}/evidence.zip`, byteSize: BigInt(10) };

let verification: Record<string, unknown> | null = null;
let releaseStatus = "Published";

function database() {
  mocks.query.mockImplementation(async (query: { text: string }) => {
    if (/SELECT 1 AS ok/.test(query.text)) return [{ ok: 1 }];
    if (/PostGIS_Lib_Version/.test(query.text)) return [{ version: "3.5.2" }];
    if (/FROM jenan_map\.release WHERE id/.test(query.text)) return [{ id: releaseId, version: "v1", status: releaseStatus }];
    if (/FROM jenan_map\.feature/.test(query.text)) return [{ layerId: "places", features: 7 }, { layerId: "roads", features: 3 }];
    if (/FROM jenan_map\.boundary/.test(query.text)) return [{ authority: "geoBoundaries", source: "ADM0", coverage: null }];
    if (/FROM jenan_map\.audit/.test(query.text)) return verification ? [verification] : [];
    return [];
  });
}

beforeEach(async () => {
  vi.resetAllMocks();
  verification = null;
  releaseStatus = "Published";
  await mkdir(root, { recursive: true });
  await mkdir(path.join(root, releaseId), { recursive: true });
  await writeFile(path.join(root, tiles.storageKey), Buffer.alloc(2048));
  await writeFile(path.join(root, schema.storageKey), Buffer.alloc(64));
  database();
  mocks.runtime.mockResolvedValue({ status: "enabled", publishedReleaseId: releaseId, revision: 4, maintenanceMessage: null });
  mocks.artifacts.mockResolvedValue([tiles, schema, source]);
  mocks.storageState.mockResolvedValue({ status: "available", configured: true });
  mocks.objectStore.mockReturnValue(null);
  mocks.validate.mockResolvedValue({});
  mocks.audit.mockResolvedValue(undefined);
  mocks.access.mockResolvedValue({ user: { id: "session-administrator" } });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("measured health", () => {
  it("measures the database, PostGIS, storage, the published files and the layers, and is not 'ok' until the files were read back", async () => {
    const report = await measureHealth();
    expect(report).toMatchObject({
      status: "attention",
      database: { status: "ok" }, postgis: { status: "ok", version: "3.5.2" }, storage: { status: "ok", driver: "filesystem" },
      runtime: { status: "enabled", publishedReleaseId: releaseId, revision: 4 },
      published: {
        releaseId, version: "v1", consistent: true, verification: null, boundary: { authority: "geoBoundaries", source: "ADM0" },
        layers: [{ layerId: "places", features: 7 }, { layerId: "roads", features: 3 }],
      },
      notMeasured: ["browser-rendering", "cdn-and-caching", "performance-under-load"],
    });
    expect(report.database.latencyMs).toEqual(expect.any(Number));
    // The evidence archive is not served, so it is not part of what is checked.
    expect(report.published!.artifacts.map((file) => [file.kind, file.present, file.sizeMatches])).toEqual([["pmtiles", true, true], ["schema", true, true]]);
  });

  it("is ok once a deep verification of this release is on record", async () => {
    verification = { createdAt: new Date("2026-10-18T10:00:00Z"), actorId: "admin-1", metadata: { result: "verified", durationMs: 4000, bytes: 2112 } };
    const report = await measureHealth();
    expect(report.status).toBe("ok");
    expect(report.published!.verification).toEqual({ at: "2026-10-18T10:00:00.000Z", result: "verified", code: null, durationMs: 4000, bytes: 2112, by: "admin-1" });
  });

  it("fails when a published file is gone or has the wrong size, however the rest looks", async () => {
    verification = { createdAt: new Date(), actorId: "admin-1", metadata: { result: "verified", durationMs: 1, bytes: 1 } };
    await rm(path.join(root, schema.storageKey));
    let report = await measureHealth();
    expect(report.status).toBe("failed");
    expect(report.published!.artifacts.find((file) => file.kind === "schema")).toMatchObject({ present: false, sizeMatches: false });
    await writeFile(path.join(root, schema.storageKey), Buffer.alloc(65));
    report = await measureHealth();
    expect(report.status).toBe("failed");
    expect(report.published!.artifacts.find((file) => file.kind === "schema")).toMatchObject({ present: true, sizeMatches: false });
  });

  it("fails, and says so, when the database cannot be queried, instead of throwing or defaulting to healthy", async () => {
    mocks.query.mockRejectedValue(new Error("connection refused"));
    mocks.runtime.mockRejectedValue(new Error("connection refused"));
    const report = await measureHealth();
    expect(report).toMatchObject({ status: "failed", database: { status: "failed", latencyMs: null }, postgis: { status: "failed", version: null }, runtime: null, published: null });
  });

  it("fails when storage is not available and reports the object-store driver when one is configured", async () => {
    mocks.storageState.mockResolvedValue({ status: "unavailable", configured: true, driver: "s3" });
    expect(await measureHealth()).toMatchObject({ status: "failed", storage: { status: "failed", driver: "s3" } });
  });

  it("checks objects with a HEAD, not a read, when the shared object store is in use", async () => {
    const head = vi.fn(async (key: string) => (key === tiles.storageKey ? { size: 2048, sha256: null } : { size: 1, sha256: null }));
    mocks.objectStore.mockReturnValue({ head });
    mocks.storageState.mockResolvedValue({ status: "available", configured: true, driver: "s3" });
    const report = await measureHealth();
    expect(head).toHaveBeenCalledTimes(2);
    expect(report.storage.driver).toBe("s3");
    expect(report.published!.artifacts.map((file) => file.sizeMatches)).toEqual([true, false]);
    expect(report.status).toBe("failed");
  });

  it("fails when the production pointer leads to a release that is not published", async () => {
    releaseStatus = "Archived";
    const report = await measureHealth();
    expect(report.published!.consistent).toBe(false);
    expect(report.status).toBe("failed");
  });

  it("needs attention, not failure, while the map is in maintenance or has no published release", async () => {
    mocks.runtime.mockResolvedValue({ status: "maintenance", publishedReleaseId: releaseId, revision: 5, maintenanceMessage: "x" });
    expect((await measureHealth()).status).toBe("attention");
    mocks.runtime.mockResolvedValue({ status: "disabled", publishedReleaseId: null, revision: 6, maintenanceMessage: null });
    expect(await measureHealth()).toMatchObject({ status: "attention", published: null });
  });
});

describe("deep verification of the published release", () => {
  it("validates every stored artifact with forced verification against the recorded boundary, and audits the outcome", async () => {
    const result = await verifyPublishedRelease("admin-1");
    expect(result).toMatchObject({ releaseId, version: "v1", status: "verified", code: null, bytes: 2112 });
    expect(mocks.validate).toHaveBeenCalledWith([tiles, schema, source], true, { authority: "geoBoundaries", source: "ADM0", coverage: null });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), "admin-1", "health.verify", releaseId, expect.objectContaining({ result: "verified", code: null, bytes: 2112 }));
  });

  it("reports the code of the failing check instead of calling the release healthy, and still audits it", async () => {
    mocks.validate.mockRejectedValue(new MapError("ARTIFACT_INTEGRITY_FAILED", 503));
    expect(await verifyPublishedRelease("admin-1")).toMatchObject({ status: "failed", code: "ARTIFACT_INTEGRITY_FAILED" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), "admin-1", "health.verify", releaseId, expect.objectContaining({ result: "failed", code: "ARTIFACT_INTEGRITY_FAILED" }));
    mocks.validate.mockRejectedValue(new Error("disk on fire"));
    expect(await verifyPublishedRelease("admin-1")).toMatchObject({ status: "failed", code: "VERIFICATION_ERROR" });
  });

  it("shares one run between concurrent requests", async () => {
    let finish: () => void = () => undefined;
    mocks.validate.mockReturnValue(new Promise((resolve) => { finish = () => resolve({}); }));
    const first = verifyPublishedRelease("admin-1");
    const second = verifyPublishedRelease("admin-2");
    await vi.waitFor(() => expect(mocks.validate).toHaveBeenCalledTimes(1));
    finish();
    expect(await first).toBe(await second);
    expect(mocks.validate).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });

  it("refuses when nothing is published", async () => {
    mocks.runtime.mockResolvedValue({ status: "enabled", publishedReleaseId: null, revision: 1, maintenanceMessage: null });
    await expect(verifyPublishedRelease("admin-1")).rejects.toMatchObject({ code: "NO_PUBLISHED_RELEASE", status: 409 });
    expect(mocks.validate).not.toHaveBeenCalled();
  });
});

describe("the health route", () => {
  const url = "https://jenanpro.sa/api/admin/jenan-map/health";
  const post = (body: string) => new NextRequest(url, { method: "POST", headers: { "content-type": "application/json" }, body });

  it("denies read and verification before measuring or reading anything", async () => {
    mocks.access.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });
    expect((await GET(new NextRequest(url))).status).toBe(403);
    expect((await POST(post('{"action":"verify-published"}'))).status).toBe(403);
    expect(mocks.runtime).not.toHaveBeenCalled();
    expect(mocks.validate).not.toHaveBeenCalled();
  });

  it("measures on read for administrators; the verification also needs a same-origin request", async () => {
    expect((await GET(new NextRequest(url))).status).toBe(200);
    expect(mocks.access).toHaveBeenLastCalledWith(expect.any(NextRequest), true);
    expect((await POST(post('{"action":"verify-published"}'))).status).toBe(200);
    expect(mocks.access).toHaveBeenLastCalledWith(expect.any(NextRequest), true, true);
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), "session-administrator", "health.verify", releaseId, expect.anything());
  });

  it.each(["", "not json", "{}", '{"action":"approve"}', '{"action":"verify-published","releaseId":"x"}', "[]"])("accepts only the one command, not %j", async (body) => {
    expect((await POST(post(body))).status).toBe(400);
    expect(mocks.validate).not.toHaveBeenCalled();
  });

  it("answers a refused verification with its own status, never a success", async () => {
    mocks.runtime.mockResolvedValue({ status: "enabled", publishedReleaseId: null, revision: 1, maintenanceMessage: null });
    expect((await POST(post('{"action":"verify-published"}'))).status).toBe(409);
  });
});
