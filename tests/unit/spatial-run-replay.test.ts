import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DataCenterActor } from "@/services/data-center/contracts";
import { runSpatialAnalysisPersisted } from "@/services/analysis-engines/spatial/adapters/run-service";
import { replaySpatialAnalysis, SpatialReplayMismatch, SpatialReplayUnavailable } from "@/services/analysis-engines/spatial/adapters/replay-service";
import { FakeDataCenterPort, DC_SHA, DC_VERSION_ID, geoFeatures } from "./support/spatial-fake-dc-port";
import { FakeMapPort } from "./support/spatial-fake-map-port";
import { baseRequest } from "./support/spatial-request-fixtures";

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  saved: null as Record<string, unknown> | null,
  version: null as unknown,
  historyRead: null as Record<string, unknown> | null,
  historyFailure: null as "missing" | "hash" | null,
}));

vi.mock("@/lib/db", () => ({
  db: {
    analysisEngineRun: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.saved = data;
        const inputs = data.inputs as { create: Array<Record<string, unknown>> };
        state.row = {
          ...data,
          inputs: inputs.create.map((input) => ({ ...input, createdAt: data.createdAt })),
        };
      },
      findFirst: async ({ where }: { where: { runId: string; actorId?: string } }) => {
        if (!state.row || state.row.runId !== where.runId || (where.actorId !== undefined && state.row.actorId !== where.actorId)) return null;
        return state.row;
      },
    },
    dataCenterVersion: {
      findUnique: async () => state.version,
    },
  },
}));

vi.mock("@/services/analysis-engines/spatial/adapters/historical-data-center", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/analysis-engines/spatial/adapters/historical-data-center")>();
  return {
    ...original,
    readHistoricalDataCenterVersion: async (args: Record<string, unknown>) => {
      state.historyRead = args;
      if (state.historyFailure === "missing") throw new original.HistoricalVersionUnavailable();
      if (state.historyFailure === "hash") throw new original.HistoricalVersionIntegrityError(String(args.versionId));
      return { checksum: args.expectedChecksum, features: geoFeatures() };
    },
  };
});

const dataCenterActor: DataCenterActor = { id: "user-1", systemRole: "USER", kind: "HUMAN" };
const runOptions = () => ({
  environment: "test" as const,
  clock: () => new Date("2026-10-20T12:00:00.000Z"),
  newRunId: () => "spatial-run-0001",
  dataCenterPort: new FakeDataCenterPort(),
  actor: { kind: "USER" as const, id: "user-1" },
  dataCenterActor,
  dataCenterContext: { specialty: "health", missionContext: "site-selection" },
});

async function createPersistedRun() {
  state.version = {
    id: DC_VERSION_ID,
    itemId: "item-1",
    number: 3,
    title: "Riyadh hospitals",
    checksum: DC_SHA,
    evidenceStatus: "ESTIMATED",
    origin: "HUMAN",
    provenance: [],
    confidence: { score: 62 },
    specialties: ["health"],
    missionContexts: ["site-selection"],
    requiredPermission: null,
    sourcePublishedAt: new Date("2026-05-15T00:00:00.000Z"),
    expiresAt: null,
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: new Date("2026-06-01T08:00:00.000Z"),
    attribution: null,
    upstream: [],
    item: { sourceId: "source-1", typeKey: "geojson", status: "PUBLISHED", publishedVersion: 3 },
    qualityAssessments: [],
  };
  const request = baseRequest({
    data: { roles: { "poi:hospital": { source: "DATA_CENTER", versionId: DC_VERSION_ID } } },
  });
  return runSpatialAnalysisPersisted(new FakeMapPort(), request, runOptions());
}

describe("persisted spatial runs and exact historical replay", () => {
  beforeEach(() => {
    state.row = null;
    state.saved = null;
    state.version = null;
    state.historyRead = null;
    state.historyFailure = null;
  });

  it("persists run, exact version/hash, metadata provenance, and a run-linked usage intent", async () => {
    const result = await createPersistedRun();
    const saved = state.saved;
    expect(saved).not.toBeNull();
    expect(saved).toMatchObject({ runId: "spatial-run-0001", engineKey: "spatial", outputHash: result.determinism.outputHash });
    const inputs = (saved?.inputs as { create: Array<Record<string, unknown>> }).create;
    const dataCenterInput = inputs.find((entry) => entry.kind === "DATA_CENTER_VERSION");
    expect(dataCenterInput).toMatchObject({
      dataCenterVersionId: DC_VERSION_ID,
      dataCenterSourceId: "source-1",
      dataCenterTypeKey: "geojson",
      contentHash: DC_SHA,
      checksum: DC_SHA,
    });
    expect(dataCenterInput?.provenance).toMatchObject({
      contract: "jenan.analysis-engine.data-center-input-provenance/v1",
      reference: { version: { versionId: DC_VERSION_ID, checksum: { value: DC_SHA } }, source: { sourceId: "source-1" } },
      version: { specialties: ["health"], missionContexts: ["site-selection"] },
      publication: { publishedVersionAtRun: 3 },
    });
    expect(dataCenterInput?.usageIntent).toMatchObject({
      versionId: DC_VERSION_ID,
      checksum: DC_SHA,
      consumer: "analysis-engine:spatial",
      roles: ["poi:hospital"],
    });
    expect(state.historyRead).toBeNull();
  });

  it("persists an explicit failed run record when the engine rejects a request", async () => {
    await expect(runSpatialAnalysisPersisted(new FakeMapPort(), null, runOptions())).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(state.saved).toMatchObject({ status: "FAILED", errorCode: "INVALID_INPUT", inputs: { create: [] } });
  });

  it("replays the exact historical version and reproduces the recorded hashes without discovering a replacement", async () => {
    const original = await createPersistedRun();
    const replayed = await replaySpatialAnalysis(new FakeMapPort(), original.runId, dataCenterActor, {
      clock: () => new Date("2026-10-21T12:00:00.000Z"),
      newRunId: () => "spatial-run-replay",
    });
    expect(state.historyRead).toMatchObject({
      versionId: DC_VERSION_ID,
      expectedChecksum: DC_SHA,
      expectedSourceId: "source-1",
      expectedTypeKey: "geojson",
      context: { specialty: "health", missionContext: "site-selection" },
    });
    expect(replayed.determinism).toEqual(original.determinism);
    expect(replayed.runId).toBe("spatial-run-replay");
  });

  it("conceals both a missing run and another user's run with the same unavailable response", async () => {
    await createPersistedRun();
    const deniedActor = { ...dataCenterActor, id: "user-2" };
    const missing = await replaySpatialAnalysis(new FakeMapPort(), "missing-run", dataCenterActor, {
      clock: () => new Date("2026-10-21T12:00:00.000Z"), newRunId: () => "missing-replay",
    }).catch((error: unknown) => error);
    const denied = await replaySpatialAnalysis(new FakeMapPort(), "spatial-run-0001", deniedActor, {
      clock: () => new Date("2026-10-21T12:00:00.000Z"), newRunId: () => "denied-replay",
    }).catch((error: unknown) => error);
    expect(missing).toBeInstanceOf(SpatialReplayUnavailable);
    expect(denied).toBeInstanceOf(SpatialReplayUnavailable);
    expect((missing as Error).message).toBe((denied as Error).message);
  });

  it("fails explicitly when the historical content is missing or its expected hash no longer matches", async () => {
    const original = await createPersistedRun();
    state.historyFailure = "missing";
    await expect(replaySpatialAnalysis(new FakeMapPort(), original.runId, dataCenterActor, {
      clock: () => new Date("2026-10-21T12:00:00.000Z"), newRunId: () => "missing-content",
    })).rejects.toBeInstanceOf(SpatialReplayUnavailable);
    state.historyFailure = "hash";
    await expect(replaySpatialAnalysis(new FakeMapPort(), original.runId, dataCenterActor, {
      clock: () => new Date("2026-10-21T12:00:00.000Z"), newRunId: () => "hash-mismatch",
    })).rejects.toMatchObject({ constructor: SpatialReplayMismatch, mismatch: "INPUT_HASH" });
  });
});
