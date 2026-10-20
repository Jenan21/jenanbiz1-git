import { describe, expect, it } from "vitest";
import { buildOpeningBatch, openReadOnlySession, readOnlySessionConfigSchema } from "@/services/analysis-engines/spatial/adapters/read-only-session";
import { MapReadError } from "@/services/analysis-engines/spatial/map-read-error";
import { FakePool, pgError, readerConfig } from "./support/spatial-fake-pool";

const resolved = readOnlySessionConfigSchema.parse(readerConfig);

describe("read-only session: configuration", () => {
  it("has bounded defaults: a dedicated connection with time limits that a caller cannot remove", () => {
    expect(resolved).toMatchObject({
      placement: "DEDICATED_CONNECTION", statementTimeoutMs: 5000, lockTimeoutMs: 1000, idleInTransactionTimeoutMs: 10_000, connectionTimeoutMs: 3000, poolMax: 4, postgisSchema: "public",
    });
  });

  it.each([
    [{ statementTimeoutMs: 99 }], [{ statementTimeoutMs: 60_001 }], [{ statementTimeoutMs: 0 }], [{ statementTimeoutMs: 1.5 }], [{ lockTimeoutMs: 10_001 }], [{ poolMax: 0 }], [{ poolMax: 21 }],
    [{ connectionTimeoutMs: 30_001 }], [{ placement: "SHARED" }], [{ postgisSchema: "public; DROP TABLE x" }], [{ postgisSchema: "Public" }], [{ postgisSchema: "" }],
    [{ applicationName: "bad name" }], [{ connectionString: "" }], [{ unknownOption: true }],
  ])("rejects the configuration %j", (override) => {
    expect(readOnlySessionConfigSchema.safeParse({ ...readerConfig, ...override }).success).toBe(false);
  });

  it("names the offending fields in its error and never the values, least of all the connection string", () => {
    const failure = (() => { try { openReadOnlySession({ connectionString: "postgresql://reader:secret-password@db.internal.example/jenan", statementTimeoutMs: 5 }, new FakePool()); return null; } catch (error) { return error as Error; } })();
    expect(failure).toBeInstanceOf(RangeError);
    expect(failure?.message).toBe("Invalid Map reader configuration: statementTimeoutMs");
    expect(failure?.message).not.toMatch(/secret|internal/);
    expect(() => openReadOnlySession({ connectionString: "" }, new FakePool())).toThrow("connectionString");
  });
});

describe("read-only session: the opening batch", () => {
  it("opens a read-only snapshot with its time limits and a search path of pg_catalog and the PostGIS schema, and takes the snapshot", () => {
    expect(buildOpeningBatch(resolved)).toBe([
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SET LOCAL statement_timeout = 5000", "SET LOCAL lock_timeout = 1000", "SET LOCAL idle_in_transaction_session_timeout = 10000",
      'SET LOCAL search_path = pg_catalog, "public"', "SELECT 1",
    ].join("; "));
    const custom = readOnlySessionConfigSchema.parse({ ...readerConfig, statementTimeoutMs: 250, lockTimeoutMs: 400, postgisSchema: "postgis" });
    expect(buildOpeningBatch(custom)).toContain("statement_timeout = 250");
    expect(buildOpeningBatch(custom)).toContain("lock_timeout = 400");
    expect(buildOpeningBatch(custom)).toContain('search_path = pg_catalog, "postgis"');
  });

  it("only uses SET LOCAL, so nothing outlives the transaction, and never asks for read-write", () => {
    const batch = buildOpeningBatch(resolved);
    expect(batch).not.toMatch(/\bSET\s+(?!LOCAL)/i);
    expect(batch).not.toMatch(/READ WRITE|set_config|COMMIT/i);
    expect(batch.split(";").filter((statement) => /\bSET\b/i.test(statement) && !/SET LOCAL/i.test(statement))).toEqual([]);
  });
});

describe("read-only session: running work", () => {
  it("runs the opening batch first and always ends with ROLLBACK, returning a healthy connection to the pool", async () => {
    const pool = new FakePool({ runtime: [{ status: "enabled" }] });
    const session = openReadOnlySession(readerConfig, pool);
    const rows = await session.run((query) => query("SELECT 1 AS \"one\""));
    expect(rows).toEqual([]);
    expect(pool.calls.map((call) => call.text)).toEqual([buildOpeningBatch(resolved), "SELECT 1 AS \"one\"", "ROLLBACK"]);
    expect(pool.released).toEqual([false]);
    expect(pool.connects).toBe(1);
  });

  it("passes parameters as a copy and returns the rows the server sent", async () => {
    const pool = new FakePool();
    pool.onOther = (text) => (text.startsWith("SELECT 2") ? [{ two: 2 }] : undefined);
    const session = openReadOnlySession(readerConfig, pool);
    const parameters = ["a", 1];
    const rows = await session.run((query) => query("SELECT 2", parameters));
    expect(rows).toEqual([{ two: 2 }]);
    expect(pool.calls[1]?.values).toEqual(["a", 1]);
    expect(pool.calls[1]?.values).not.toBe(parameters);
  });

  it("turns a server error into its kind, still rolls back, and keeps the connection (the server is fine, the statement failed)", async () => {
    const pool = new FakePool();
    pool.onOther = (text) => (text === "SELECT slow" ? pgError("57014", "canceling statement due to statement timeout") : undefined);
    const session = openReadOnlySession(readerConfig, pool);
    const failure = await session.run((query) => query("SELECT slow")).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MapReadError);
    expect((failure as MapReadError).kind).toBe("TIMEOUT");
    expect(pool.calls.at(-1)?.text).toBe("ROLLBACK");
    expect(pool.released).toEqual([false]);
  });

  it("destroys a connection whose state is uncertain: a driver failure that no server reported", async () => {
    const pool = new FakePool();
    pool.onOther = (text) => (text === "SELECT stalled" ? new Error("Query read timeout") : undefined);
    const session = openReadOnlySession(readerConfig, pool);
    const failure = await session.run((query) => query("SELECT stalled")).catch((error: unknown) => error);
    expect((failure as MapReadError).kind).toBe("TIMEOUT");
    expect(pool.released).toEqual([true]);
  });

  it("destroys the connection when ROLLBACK itself fails, and still returns the work's result", async () => {
    const pool = new FakePool();
    pool.onOther = (text) => (text === "ROLLBACK" ? new Error("Connection terminated unexpectedly") : undefined);
    const session = openReadOnlySession(readerConfig, pool);
    await expect(session.run(async () => "done")).resolves.toBe("done");
    expect(pool.released).toEqual([true]);
  });

  it("maps a failure of the opening batch (for example a role that may not connect) and releases the connection", async () => {
    const pool = new FakePool();
    pool.onOther = (text) => (text.startsWith("BEGIN") ? pgError("42501", "permission denied") : undefined);
    const session = openReadOnlySession(readerConfig, pool);
    const failure = await session.run(async () => "never").catch((error: unknown) => error);
    expect((failure as MapReadError).kind).toBe("PERMISSION_DENIED");
    expect(pool.released).toHaveLength(1);
  });

  it("maps a failure to connect at all", async () => {
    const pool = new FakePool();
    pool.connectError = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), { code: "ECONNREFUSED" });
    const session = openReadOnlySession(readerConfig, pool);
    const failure = await session.run(async () => "never").catch((error: unknown) => error);
    expect((failure as MapReadError).kind).toBe("UNREACHABLE");
    expect(pool.calls).toEqual([]);
  });

  it("lets the adapter's own MapReadError through unchanged and keeps the connection", async () => {
    const pool = new FakePool();
    const own = new MapReadError("SCHEMA_MISMATCH");
    const failure = await openReadOnlySession(readerConfig, pool).run(async () => { throw own; }).catch((error: unknown) => error);
    expect(failure).toBe(own);
    expect(pool.released).toEqual([false]);
  });

  it("a rogue attempt to leave read-only mode is the server's to refuse, and is reported as a read-only violation", async () => {
    const pool = new FakePool();
    pool.onOther = (text) => (text.startsWith("SET TRANSACTION READ WRITE") ? pgError("25001", "transaction read-write mode must be set before any query") : undefined);
    const failure = await openReadOnlySession(readerConfig, pool).run((query) => query("SET TRANSACTION READ WRITE")).catch((error: unknown) => error);
    expect((failure as MapReadError).kind).toBe("READ_ONLY_VIOLATION");
  });

  it("closes its pool once, and refuses work afterwards", async () => {
    const pool = new FakePool();
    const session = openReadOnlySession(readerConfig, pool);
    await session.close();
    await session.close();
    expect(pool.ended).toBe(1);
    const failure = await session.run(async () => "never").catch((error: unknown) => error);
    expect((failure as MapReadError).kind).toBe("UNKNOWN");
    expect(pool.connects).toBe(0);
  });

  it("serves several calls on separate snapshots", async () => {
    const pool = new FakePool();
    const session = openReadOnlySession(readerConfig, pool);
    await Promise.all([session.run(async () => 1), session.run(async () => 2), session.run(async () => 3)]);
    expect(pool.connects).toBe(3);
    expect(pool.calls.filter((call) => call.text === "ROLLBACK")).toHaveLength(3);
    expect(pool.released).toEqual([false, false, false]);
  });
});
