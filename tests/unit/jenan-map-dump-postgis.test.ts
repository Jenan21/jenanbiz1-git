import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { connectionEnvironment, dumpName, dumpPostgis, DumpError, DUMP_FORMAT } from "../../scripts/jenan-map/dump-postgis.mjs";

const dump = Buffer.from("PGDMP\u0001\u000e fake custom-format archive of the jenan_map schema");
const listing = `;
; Archive created at 2026-10-18 10:00:00 UTC
4; 2615 16385 SCHEMA - jenan_map jm
218; 1259 16488 TABLE jenan_map release jm
219; 1259 16500 TABLE jenan_map feature jm
4423; 0 16488 TABLE DATA jenan_map release jm
4424; 0 16500 TABLE DATA jenan_map feature jm
4425; 0 16510 TABLE DATA public User jm
`;
const databaseUrl = "postgresql://jm_user:p%40ss%2Fw0rd@db.internal:6543/jenan_pro?sslmode=require";
const now = new Date("2026-10-18T10:00:00.123Z");
const secret = "p@ss/w0rd";

type Call = { command: string; args: string[]; env: Record<string, string | undefined> };

function child(output: string | Buffer, code = 0) {
  const process = new EventEmitter() as EventEmitter & Record<string, unknown>;
  process.stdout = Readable.from([Buffer.from(output)]);
  process.stderr = new PassThrough();
  (process.stderr as PassThrough).end();
  process.stdin = new PassThrough();
  (process.stdin as PassThrough).resume();
  (process.stdout as Readable).once("end", () => setImmediate(() => process.emit("close", code)));
  return process;
}

function missing() {
  const process = new EventEmitter() as EventEmitter & Record<string, unknown>;
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.stdin = new PassThrough();
  setImmediate(() => { process.emit("error", new Error("spawn ENOENT")); (process.stdout as PassThrough).destroy(); });
  return process;
}

function tools(overrides: { dump?: () => unknown; restore?: () => unknown } = {}) {
  const calls: Call[] = [];
  const spawn = (command: string, args: string[], options: { env: Record<string, string | undefined> }) => {
    calls.push({ command, args, env: options.env });
    if (path.basename(command) === "pg_restore") return (overrides.restore ?? (() => child(listing)))();
    if (args[0] === "--version") return child("pg_dump (PostgreSQL) 17.2\n");
    return (overrides.dump ?? (() => child(dump)))();
  };
  return { calls, spawn: spawn as never };
}

let root: string;
const env = () => ({ DATABASE_URL: databaseUrl, JENAN_MAP_BACKUP_ROOT: root });

beforeEach(async () => { root = await mkdtemp(path.join(os.tmpdir(), "jm-dump-")); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe("PostgreSQL/PostGIS dump of the map schema", () => {
  it("names a dump by its UTC time", () => {
    expect(dumpName(now)).toBe("jenan-map-postgis-20261018T100000Z.dump");
  });

  it("derives connection settings for pg_dump from the database URL, decoding the password", () => {
    expect(connectionEnvironment(databaseUrl)).toEqual({
      PGHOST: "db.internal", PGPORT: "6543", PGDATABASE: "jenan_pro", PGUSER: "jm_user", PGPASSWORD: secret, PGSSLMODE: "require",
    });
    expect(connectionEnvironment("postgres://u:p@localhost/db")).toMatchObject({ PGPORT: "5432", PGHOST: "localhost" });
    expect(connectionEnvironment("postgres://u:p@localhost/db?sslmode=bogus")).not.toHaveProperty("PGSSLMODE");
    for (const bad of [undefined, "", "not a url", "mysql://u:p@h/db", "postgresql://u:p@h", "postgresql:///db"]) {
      expect(() => connectionEnvironment(bad), String(bad)).toThrow(expect.objectContaining({ code: "DATABASE_URL_INVALID" }));
    }
  });

  it("writes a verified dump with a manifest, passing credentials only through the environment", async () => {
    const { calls, spawn } = tools();
    const manifest = await dumpPostgis({ env: env(), spawn, now });
    const sha256 = createHash("sha256").update(dump).digest("hex");
    expect(manifest).toEqual({
      format: DUMP_FORMAT, createdAt: now.toISOString(), schema: "jenan_map", file: "jenan-map-postgis-20261018T100000Z.dump",
      bytes: dump.length, sha256, tool: "pg_dump (PostgreSQL) 17.2", tablesWithData: ["feature", "release"],
    });
    const written = path.join(await realpath(root), manifest.file);
    expect((await readFile(written)).equals(dump)).toBe(true);
    expect(JSON.parse(await readFile(`${written}.manifest.json`, "utf8"))).toEqual(manifest);
    if (process.platform !== "win32") expect((await stat(written)).mode & 0o777).toBe(0o600);

    expect(calls.map((call) => [call.command, call.args[0]])).toEqual([["pg_dump", "--format=custom"], ["pg_restore", "--list"], ["pg_dump", "--version"]]);
    expect(calls[0].args).toEqual(["--format=custom", "--schema=jenan_map", "--no-owner", "--no-privileges", "--compress=6"]);
    for (const call of calls) {
      expect(call.args.join(" ")).not.toContain(secret);
      expect(call.args.join(" ")).not.toContain("db.internal");
      expect(call.env).toMatchObject({ PGHOST: "db.internal", PGUSER: "jm_user", PGPASSWORD: secret, PGDATABASE: "jenan_pro", PGSSLMODE: "require" });
      expect(call.env.DATABASE_URL).toBeUndefined();
    }
  });

  it("uses the PostgreSQL tools named by the operator", async () => {
    const { calls, spawn } = tools();
    await dumpPostgis({ env: { ...env(), PG_DUMP_BIN: "/opt/pg17/bin/pg_dump", PG_RESTORE_BIN: "/opt/pg17/bin/pg_restore" }, spawn, now });
    expect(calls.map((call) => call.command)).toEqual(["/opt/pg17/bin/pg_dump", "/opt/pg17/bin/pg_restore", "/opt/pg17/bin/pg_dump"]);
  });

  it("refuses an unusable backup folder before running anything", async () => {
    const { calls, spawn } = tools();
    await expect(dumpPostgis({ env: { DATABASE_URL: databaseUrl }, spawn, now })).rejects.toMatchObject({ code: "BACKUP_ROOT_NOT_CONFIGURED" });
    await expect(dumpPostgis({ env: { ...env(), JENAN_MAP_BACKUP_ROOT: "relative/backups" }, spawn, now })).rejects.toMatchObject({ code: "BACKUP_ROOT_NOT_CONFIGURED" });
    await expect(dumpPostgis({ env: { ...env(), JENAN_MAP_BACKUP_ROOT: path.join(process.cwd(), "public", "backups") }, spawn, now })).rejects.toMatchObject({ code: "PRIVATE_BACKUP_ROOT_REQUIRED" });
    await expect(dumpPostgis({ env: { ...env(), DATABASE_URL: "nope" }, spawn, now })).rejects.toBeInstanceOf(DumpError);
    expect(calls).toHaveLength(0);
  });

  it("never writes over an earlier dump", async () => {
    await writeFile(path.join(root, dumpName(now)), "earlier");
    const { calls, spawn } = tools();
    await expect(dumpPostgis({ env: env(), spawn, now })).rejects.toMatchObject({ code: "DUMP_ALREADY_EXISTS" });
    expect(await readFile(path.join(root, dumpName(now)), "utf8")).toBe("earlier");
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["pg_dump fails", { dump: () => child("partial", 1) }, "PG_TOOL_FAILED"],
    ["pg_dump writes nothing", { dump: () => child("") }, "DUMP_EMPTY"],
    ["pg_restore cannot read the dump", { restore: () => child("", 1) }, "PG_TOOL_FAILED"],
    ["the dump lacks the map schema", { restore: () => child("4; 2615 16385 SCHEMA - public jm\n") }, "DUMP_UNREADABLE"],
    ["the dump holds no table data", { restore: () => child("4; 2615 16385 SCHEMA - jenan_map jm\n218; 1259 16488 TABLE jenan_map release jm\n") }, "DUMP_UNREADABLE"],
    ["pg_dump is not installed", { dump: missing }, "PG_TOOL_NOT_FOUND"],
  ])("leaves no dump behind when %s", async (_name, overrides, code) => {
    const { spawn } = tools(overrides as never);
    await expect(dumpPostgis({ env: env(), spawn, now })).rejects.toMatchObject({ code });
    expect(await readdir(root)).toEqual([]);
  });
});
