import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataCenterError, type DataCenterActor } from "@/services/data-center/contracts";
import type { DataCenterDiscoveryResult } from "@/services/data-center/discovery";
import type { DataCenterVersionContent } from "@/services/data-center/version-content";
import { DataCenterProviderError } from "@/services/analysis-engines/spatial/data-center-port";
import { DC_OTHER_VERSION_ID, DC_SHA, DC_VERSION_ID, geoFeatures, makeReference } from "./support/spatial-fake-dc-port";

// The two Data Center read services are replaced, so what is tested is the adapter's own work: the requests it makes, how it maps the
// answers, what it tells the engine about a refusal, and that it never touches the database itself.
const mocks = vi.hoisted(() => ({ discover: vi.fn(), read: vi.fn(), databaseAccess: [] as string[] }));
vi.mock("@/services/data-center/discovery", () => ({ discoverDataCenterVersions: mocks.discover }));
vi.mock("@/services/data-center/version-content", () => ({ readDataCenterVersionContent: mocks.read }));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get(_target, key) { mocks.databaseAccess.push(String(key)); throw new Error("the provider touched the database"); } }),
}));
import { createDataCenterProvider } from "@/services/analysis-engines/spatial/adapters/data-center-provider";

const NOW = new Date("2026-10-20T12:00:00.000Z");
const ASOF = "2026-06-01T00:00:00.000Z";
const actor: DataCenterActor = { id: "user-1", systemRole: "USER", kind: "HUMAN" };
const selected = makeReference();
const competing = makeReference({ version: { versionId: DC_OTHER_VERSION_ID, checksum: "0f9e8d7c".repeat(8) } });

const discoveryResult = (over: Partial<DataCenterDiscoveryResult> = {}): DataCenterDiscoveryResult => ({
  mode: "BY_TYPE", policy: "dc-version-selection-v1", asOf: ASOF, asOfExplicit: true, status: "FOUND", candidates: [], selected: null, unavailableVersionIds: [], notInForce: [], truncated: false, ...over,
});
const contentResult = (over: Partial<DataCenterVersionContent> = {}): DataCenterVersionContent => ({
  reference: selected, content: "{}", contentKind: "GEOJSON", features: geoFeatures(2), integrity: { algorithm: "SHA-256", checksum: DC_SHA, recomputed: true }, ...over,
});
const refusals: Array<[string, DataCenterError]> = [
  ["a version that is not there for this actor", new DataCenterError("PUBLISHED_VERSION_NOT_FOUND", 404)],
  ["a robot with no grant", new DataCenterError("EXPLICIT_ROBOT_GRANT_REQUIRED", 403)],
  ["a robot no longer assigned to its mission", new DataCenterError("ROBOT_MISSION_ASSIGNMENT_REQUIRED", 403)],
  ["a principal of an untrusted kind", new DataCenterError("TRUSTED_PRINCIPAL_KIND_REQUIRED", 403)],
  ["any other refusal of the access policy", new DataCenterError("SOMETHING_FORBIDDEN", 403)],
];
const failure = async (work: Promise<unknown>) => { try { await work; } catch (error) { return error; } throw new Error("expected the call to fail"); };

beforeEach(() => {
  mocks.discover.mockReset();
  mocks.read.mockReset();
  mocks.databaseAccess.length = 0;
});

describe("the Data Center provider: discovery", () => {
  it("asks the Data Center's discovery service for exactly the version named, as the actor, and nothing else", async () => {
    mocks.discover.mockResolvedValue(discoveryResult({ mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, candidates: [{ reference: selected }] }));
    const provider = createDataCenterProvider({ actor, now: NOW });
    await provider.discover({ kind: "EXACT", versionId: DC_VERSION_ID });
    expect(mocks.discover).toHaveBeenCalledTimes(1);
    expect(mocks.discover.mock.calls[0]).toEqual([{ versionIds: [DC_VERSION_ID] }, actor, { now: NOW }]);
    expect(mocks.discover.mock.calls[0]?.[1]).toBe(actor);
  });

  it("asks for a type as of an instant and a place verbatim, and states an instant or a place only when the request gave one", async () => {
    mocks.discover.mockResolvedValue(discoveryResult());
    const provider = createDataCenterProvider({ actor, now: NOW });
    const geography = { countryCodes: ["SA"], regionCodes: ["SA-01"], boundingBox: { west: 46, south: 24, east: 47, north: 25 } };
    await provider.discover({ kind: "BY_TYPE", typeKey: "geojson", asOf: ASOF, geography });
    await provider.discover({ kind: "BY_TYPE", typeKey: "geojson" });
    expect(mocks.discover.mock.calls[0]?.[0]).toEqual({ typeKeys: ["geojson"], asOf: ASOF, geography });
    expect(mocks.discover.mock.calls[1]?.[0]).toEqual({ typeKeys: ["geojson"] });
    expect(Object.keys(mocks.discover.mock.calls[1]?.[0] as object).sort()).toEqual(["typeKeys"]);
  });

  it("passes the specialty and mission context the provider was given, and only those", async () => {
    mocks.discover.mockResolvedValue(discoveryResult());
    await createDataCenterProvider({ actor, now: NOW, specialty: "demography", missionContext: "site-study" }).discover({ kind: "BY_TYPE", typeKey: "geojson" });
    await createDataCenterProvider({ actor, now: NOW, specialty: "demography" }).discover({ kind: "EXACT", versionId: DC_VERSION_ID });
    expect(mocks.discover.mock.calls[0]?.[0]).toEqual({ typeKeys: ["geojson"], specialty: "demography", missionContext: "site-study" });
    expect(mocks.discover.mock.calls[1]?.[0]).toEqual({ versionIds: [DC_VERSION_ID], specialty: "demography" });
  });

  it("returns the references the Data Center stated, the choice it made among the versions in force, and whether its listing was cut", async () => {
    mocks.discover.mockResolvedValue(discoveryResult({
      candidates: [{ reference: selected }, { reference: competing }], selected: { reference: selected }, truncated: true,
      notInForce: [{ versionId: "late", reason: "NOT_PUBLISHED_AT_AS_OF" }],
    }));
    const discovery = await createDataCenterProvider({ actor, now: NOW }).discover({ kind: "BY_TYPE", typeKey: "geojson", asOf: ASOF });
    expect(discovery).toEqual({
      mode: "BY_TYPE", policy: "dc-version-selection-v1", asOf: ASOF, asOfExplicit: true, status: "FOUND", selected, candidates: [selected, competing], truncated: true,
      notInForce: [{ versionId: "late", reason: "NOT_PUBLISHED_AT_AS_OF" }],
    });
  });

  it("returns an exact version as the selected one, because the caller chose it, and nothing when it is not available", async () => {
    const provider = createDataCenterProvider({ actor, now: NOW });
    mocks.discover.mockResolvedValueOnce(discoveryResult({ mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, candidates: [{ reference: selected }], selected: null }));
    expect(await provider.discover({ kind: "EXACT", versionId: DC_VERSION_ID })).toMatchObject({ mode: "EXACT", status: "FOUND", selected, candidates: [selected] });
    mocks.discover.mockResolvedValueOnce(discoveryResult({ mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, status: "NOT_AVAILABLE", unavailableVersionIds: [DC_VERSION_ID] }));
    expect(await provider.discover({ kind: "EXACT", versionId: DC_VERSION_ID })).toMatchObject({ mode: "EXACT", status: "NOT_AVAILABLE", selected: null, candidates: [] });
  });

  it.each(["FOUND", "NOT_AVAILABLE", "NO_COVERAGE", "NOT_IN_FORCE", "TOO_MANY_CANDIDATES"] as const)("relays the status %s as the Data Center stated it", async (status) => {
    mocks.discover.mockResolvedValue(discoveryResult({ status }));
    expect((await createDataCenterProvider({ actor, now: NOW }).discover({ kind: "BY_TYPE", typeKey: "geojson" })).status).toBe(status);
  });

  describe.each(refusals)("%s", (_name, refusal) => {
    it("is answered exactly as when nothing exists: not available, in the same shape, with nothing told about why", async () => {
      const provider = createDataCenterProvider({ actor, now: NOW });
      for (const selection of [
        { kind: "EXACT", versionId: DC_VERSION_ID }, { kind: "BY_TYPE", typeKey: "geojson", asOf: ASOF }, { kind: "BY_TYPE", typeKey: "geojson" },
      ] as const) {
        mocks.discover.mockResolvedValueOnce(selection.kind === "EXACT"
          ? discoveryResult({ mode: "EXACT", policy: "exact-version", asOf: null, asOfExplicit: false, status: "NOT_AVAILABLE", unavailableVersionIds: [DC_VERSION_ID] })
          : discoveryResult({ status: "NOT_AVAILABLE", asOf: selection.asOf ?? NOW.toISOString(), asOfExplicit: selection.asOf !== undefined }));
        const nothing = await provider.discover(selection);
        mocks.discover.mockRejectedValueOnce(refusal);
        const refused = await provider.discover(selection);
        expect(refused).toEqual(nothing);
        expect(refused).toMatchObject({ status: "NOT_AVAILABLE", selected: null, candidates: [] });
      }
    });

    it("is answered as not available when reading the content, identical to every other refusal", async () => {
      mocks.read.mockRejectedValue(refusal);
      expect(await createDataCenterProvider({ actor, now: NOW }).readContent({ versionId: DC_VERSION_ID, expectedChecksum: DC_SHA })).toEqual({ status: "NOT_AVAILABLE" });
    });
  });
});

describe("the Data Center provider: reading content", () => {
  it("reads exactly one version, requiring spatial content, pinned to the checksum it was given, and returns what the Data Center verified", async () => {
    mocks.read.mockResolvedValue(contentResult());
    const outcome = await createDataCenterProvider({ actor, now: NOW }).readContent({ versionId: DC_VERSION_ID, expectedChecksum: DC_SHA });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.read.mock.calls[0]).toEqual([{ versionId: DC_VERSION_ID, expectedChecksum: DC_SHA, require: "GEOJSON" }, actor, { now: NOW }]);
    expect(outcome).toEqual({ status: "OK", reference: selected, features: geoFeatures(2), checksum: DC_SHA });
  });

  it("does not pin a checksum nobody gave, and passes the specialty and mission context it was given", async () => {
    mocks.read.mockResolvedValue(contentResult());
    await createDataCenterProvider({ actor, now: NOW, specialty: "demography", missionContext: "site-study" }).readContent({ versionId: DC_VERSION_ID });
    expect(mocks.read.mock.calls[0]?.[0]).toEqual({ versionId: DC_VERSION_ID, require: "GEOJSON", specialty: "demography", missionContext: "site-study" });
  });

  it("returns the checksum the Data Center recomputed, not one it was asked about", async () => {
    mocks.read.mockResolvedValue(contentResult({ integrity: { algorithm: "SHA-256", checksum: "ab".repeat(32), recomputed: true } }));
    expect(await createDataCenterProvider({ actor, now: NOW }).readContent({ versionId: DC_VERSION_ID, expectedChecksum: DC_SHA })).toMatchObject({ checksum: "ab".repeat(32) });
  });

  it("does not treat content without validated features as spatial, whatever the Data Center called it", async () => {
    mocks.read.mockResolvedValue(contentResult({ contentKind: "OTHER", features: null }));
    expect(await createDataCenterProvider({ actor, now: NOW }).readContent({ versionId: DC_VERSION_ID })).toEqual({ status: "NOT_SPATIAL" });
  });

  it.each<[string, DataCenterError, unknown]>([
    ["a stored checksum that does not match the stored content", new DataCenterError("VERSION_CHECKSUM_MISMATCH", 500), { status: "INTEGRITY_FAILED" }],
    ["content that is not the content expected", new DataCenterError("EXPECTED_CHECKSUM_MISMATCH", 409), { status: "PIN_CONTENT_CHANGED" }],
    ["a version that is not spatial", new DataCenterError("CONTENT_NOT_SPATIAL", 422), { status: "NOT_SPATIAL" }],
    ["GeoJSON that is not valid", new DataCenterError("INVALID_GEOJSON", 422), { status: "CONTENT_INVALID", code: "INVALID_GEOJSON" }],
    ["a feature that is not valid", new DataCenterError("INVALID_GEOJSON_FEATURE", 422), { status: "CONTENT_INVALID", code: "INVALID_GEOJSON_FEATURE" }],
    ["coordinates out of range", new DataCenterError("INVALID_GEOJSON_COORDINATES", 422), { status: "CONTENT_INVALID", code: "INVALID_GEOJSON_COORDINATES" }],
    ["a coordinate system other than WGS84", new DataCenterError("GEOJSON_WGS84_REQUIRED", 422), { status: "CONTENT_INVALID", code: "GEOJSON_WGS84_REQUIRED" }],
    ["a structure beyond the limits", new DataCenterError("IMPORT_STRUCTURE_LIMIT", 422), { status: "CONTENT_INVALID", code: "IMPORT_STRUCTURE_LIMIT" }],
  ])("tells %s as its own outcome, never as an exception", async (_name, error, expected) => {
    mocks.read.mockRejectedValue(error);
    expect(await createDataCenterProvider({ actor, now: NOW }).readContent({ versionId: DC_VERSION_ID, expectedChecksum: DC_SHA })).toEqual(expected);
  });

  it("lets only a validator's code into an outcome: anything else becomes the generic code", async () => {
    for (const code of ["with spaces and <markup>", "lower_case", "X".repeat(65), ""]) {
      mocks.read.mockRejectedValueOnce(new DataCenterError(code, 422));
      expect(await createDataCenterProvider({ actor, now: NOW }).readContent({ versionId: DC_VERSION_ID })).toEqual({ status: "CONTENT_INVALID", code: "INVALID_GEOJSON" });
    }
  });
});

describe("the Data Center provider: when the Data Center cannot be asked", () => {
  const unreachable: Array<[string, unknown]> = [
    ["a Prisma initialization error", Object.assign(new Error("Can't reach database server at `10.0.0.5:5432`"), { name: "PrismaClientInitializationError" })],
    ["P1001", Object.assign(new Error("unreachable"), { code: "P1001" })],
    ["P1008", Object.assign(new Error("slow"), { code: "P1008" })],
    ["a pool timeout", Object.assign(new Error("Timed out fetching a new connection from the connection pool"), { code: "P2024" })],
    ["ECONNREFUSED", Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" })],
    ["a service unavailable answer of the Data Center", new DataCenterError("SEARCH_UNAVAILABLE", 503)],
    ["a message that says the operation timed out", new Error("The operation timed out")],
  ];
  const unknown: Array<[string, unknown]> = [
    ["an unexpected error", new Error("boom")],
    ["a request the Data Center found invalid", new DataCenterError("INVALID_DISCOVERY_REQUEST", 400)],
    ["a read request the Data Center found invalid", new DataCenterError("INVALID_VERSION_REQUEST", 400)],
    ["an unlisted failure of the Data Center", new DataCenterError("SOMETHING_ELSE", 500)],
    ["a thrown string", "boom"],
    ["a thrown null", null],
  ];

  it.each([...unreachable.map(([name, error]) => [name, error, "UNAVAILABLE"] as const), ...unknown.map(([name, error]) => [name, error, "UNKNOWN"] as const)])(
    "reports %s as the Data Center not being askable (%#), keeps the original only as the cause, and never copies its message",
    async (_name, error, kind) => {
      mocks.discover.mockRejectedValue(error);
      mocks.read.mockRejectedValue(error);
      const provider = createDataCenterProvider({ actor, now: NOW });
      const failures = [await failure(provider.discover({ kind: "BY_TYPE", typeKey: "geojson" })), await failure(provider.readContent({ versionId: DC_VERSION_ID }))];
      for (const raised of failures) {
        expect(raised).toBeInstanceOf(DataCenterProviderError);
        expect((raised as DataCenterProviderError).kind).toBe(kind);
        expect((raised as DataCenterProviderError).message).toBe(`The Data Center could not be asked (${kind})`);
        expect((raised as DataCenterProviderError).cause).toBe(error);
      }
    },
  );

  it("passes a provider error through unchanged", async () => {
    const original = new DataCenterProviderError("UNAVAILABLE");
    mocks.discover.mockRejectedValue(original);
    expect(await failure(createDataCenterProvider({ actor, now: NOW }).discover({ kind: "EXACT", versionId: DC_VERSION_ID }))).toBe(original);
  });
});

describe("the Data Center provider: what it never does", () => {
  it("never touches the database itself, whatever the Data Center answers", async () => {
    const provider = createDataCenterProvider({ actor, now: NOW });
    mocks.discover.mockResolvedValue(discoveryResult({ candidates: [{ reference: selected }], selected: { reference: selected } }));
    mocks.read.mockResolvedValue(contentResult());
    await provider.discover({ kind: "BY_TYPE", typeKey: "geojson" });
    await provider.readContent({ versionId: DC_VERSION_ID });
    for (const error of [new DataCenterError("PUBLISHED_VERSION_NOT_FOUND", 404), new DataCenterError("VERSION_CHECKSUM_MISMATCH", 500), new Error("boom")]) {
      mocks.discover.mockRejectedValueOnce(error);
      mocks.read.mockRejectedValueOnce(error);
      await provider.discover({ kind: "BY_TYPE", typeKey: "geojson" }).catch(() => undefined);
      await provider.readContent({ versionId: DC_VERSION_ID }).catch(() => undefined);
    }
    expect(mocks.databaseAccess).toEqual([]);
  });

  it("uses no Data Center service other than discovery and the exact read", async () => {
    mocks.discover.mockResolvedValue(discoveryResult());
    mocks.read.mockResolvedValue(contentResult());
    const provider = createDataCenterProvider({ actor, now: NOW });
    await provider.discover({ kind: "BY_TYPE", typeKey: "geojson" });
    await provider.readContent({ versionId: DC_VERSION_ID });
    expect(mocks.discover).toHaveBeenCalledTimes(1);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
});
