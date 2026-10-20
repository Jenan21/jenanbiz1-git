// Operator tool: a PostgreSQL/PostGIS dump of the `jenan_map` schema, the database half of a portable Jenan PRO Map. Artifact bytes (PMTiles, style,
// glyphs, sources) are not in the database; they travel in the full backup (Admin -> Export & Backup) or are read straight from the shared store.
//
//   DATABASE_URL=... JENAN_MAP_BACKUP_ROOT=/srv/jenan-map/backups node scripts/jenan-map/dump-postgis.mjs
//
// Credentials reach pg_dump through its environment, never its command line. The dump is verified by listing it with pg_restore before it is
// reported as made. Restoring is never done by this tool: load it into a scratch database, review it, then decide (see docs/jenan-map.md).
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, realpath, rm, stat, writeFile } from "node:fs/promises";
import { spawn as nodeSpawn } from "node:child_process";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { fileURLToPath } from "node:url";

export const DUMP_FORMAT = "jenan-pro-map-postgis-dump-v1";
export const DUMP_SCHEMA = "jenan_map";

export class DumpError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** Connection settings for pg_dump, from a postgres URL. Only PG* variables are produced, so nothing secret is ever a process argument. */
export function connectionEnvironment(databaseUrl) {
  let url;
  try { url = new URL(databaseUrl ?? ""); } catch { throw new DumpError("DATABASE_URL_INVALID"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new DumpError("DATABASE_URL_INVALID");
  const environment = {
    PGHOST: url.hostname, PGPORT: url.port || "5432", PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
  };
  const sslmode = url.searchParams.get("sslmode");
  if (sslmode && /^(disable|allow|prefer|require|verify-ca|verify-full)$/.test(sslmode)) environment.PGSSLMODE = sslmode;
  return environment;
}

/** The backup folder must be an absolute private directory outside `public/`, like the map backups. */
async function privateOutput(configured) {
  if (!configured || !path.isAbsolute(configured)) throw new DumpError("BACKUP_ROOT_NOT_CONFIGURED");
  const publicRoot = path.resolve(process.cwd(), "public");
  const resolved = path.resolve(configured);
  if (resolved === publicRoot || resolved.startsWith(publicRoot + path.sep)) throw new DumpError("PRIVATE_BACKUP_ROOT_REQUIRED");
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const real = await realpath(resolved);
  if (process.platform !== "win32" && ((await stat(real)).mode & 0o077) !== 0) throw new DumpError("PRIVATE_BACKUP_ROOT_REQUIRED");
  return real;
}

/** Runs one PostgreSQL tool to completion. `feed` writes to its stdin, `capture` consumes its stdout; a non-zero exit is a failure. */
async function run(spawn, command, args, environment, { feed, capture }) {
  const child = spawn(command, args, { env: environment, stdio: [feed ? "pipe" : "ignore", "pipe", "pipe"] });
  child.stderr.resume();
  const exited = new Promise((resolve) => {
    child.once("error", () => resolve({ missing: true }));
    child.once("close", (code) => resolve({ code }));
  });
  if (feed) feed(child);
  const [output, result] = await Promise.allSettled([capture(child), exited]);
  if (result.value?.missing) throw new DumpError("PG_TOOL_NOT_FOUND");
  if (output.status === "rejected" || result.value?.code !== 0) throw new DumpError("PG_TOOL_FAILED");
  return output.value;
}

const collect = (stream) => new Promise((resolve, reject) => {
  const parts = [];
  stream.on("data", (chunk) => parts.push(Buffer.from(chunk)));
  stream.once("end", () => resolve(Buffer.concat(parts).toString("utf8")));
  stream.once("error", reject);
});

const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function dumpName(now) {
  return `jenan-map-postgis-${now.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}.dump`;
}

/** Creates the dump and its manifest in the backup folder. Resolves to the manifest; rejects with a DumpError, leaving no partial dump behind. */
export async function dumpPostgis({ env = process.env, spawn = nodeSpawn, now = new Date() } = {}) {
  const connection = connectionEnvironment(env.DATABASE_URL);
  const folder = await privateOutput(env.JENAN_MAP_BACKUP_ROOT?.trim());
  const pgDump = env.PG_DUMP_BIN?.trim() || "pg_dump";
  const pgRestore = env.PG_RESTORE_BIN?.trim() || "pg_restore";
  const environment = { ...process.env, ...connection };
  delete environment.DATABASE_URL;

  const name = dumpName(now);
  const target = path.join(folder, name);
  // Exclusive creation: a dump is never written over an earlier one.
  const claimed = await open(target, "wx", 0o600).catch(() => { throw new DumpError("DUMP_ALREADY_EXISTS"); });
  await claimed.close();
  try {
    const hash = createHash("sha256");
    let bytes = 0;
    const measure = new Transform({ transform(chunk, _encoding, callback) { hash.update(chunk); bytes += chunk.length; callback(null, chunk); } });
    await run(spawn, pgDump, ["--format=custom", `--schema=${DUMP_SCHEMA}`, "--no-owner", "--no-privileges", "--compress=6"], environment, {
      capture: (child) => pipeline(child.stdout, measure, createWriteStream(target, { flags: "w", mode: 0o600 })),
    });
    if (bytes < 1) throw new DumpError("DUMP_EMPTY");

    // A dump that pg_restore cannot list is not a backup.
    const listing = await run(spawn, pgRestore, ["--list"], environment, {
      feed: (child) => { child.stdin.on("error", () => undefined); createReadStream(target).pipe(child.stdin); },
      capture: (child) => collect(child.stdout),
    });
    const tables = [...listing.matchAll(/^\d+; \d+ \d+ TABLE DATA (\S+) (\S+)(?: |$)/gm)].filter((match) => match[1] === DUMP_SCHEMA).map((match) => match[2]).sort(byCodeUnit);
    if (!new RegExp(`^\\d+; \\d+ \\d+ SCHEMA - ${DUMP_SCHEMA}(?: |$)`, "m").test(listing) || !tables.length) throw new DumpError("DUMP_UNREADABLE");

    const version = await run(spawn, pgDump, ["--version"], environment, { capture: (child) => collect(child.stdout) });
    const manifest = {
      format: DUMP_FORMAT, createdAt: now.toISOString(), schema: DUMP_SCHEMA, file: name, bytes, sha256: hash.digest("hex"),
      tool: version.trim(), tablesWithData: tables,
    };
    await writeFile(`${target}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    return manifest;
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  dumpPostgis().then((manifest) => {
    console.log(`Dump written: ${manifest.file} (${manifest.bytes} bytes, sha256 ${manifest.sha256}); ${manifest.tablesWithData.length} tables with data.`);
    console.log("Restore it only into a scratch database (pg_restore --no-owner --dbname <scratch> <file>), review it, and never straight into production.");
  }).catch((error) => {
    console.error(`Dump failed: ${error instanceof DumpError ? error.code : "UNEXPECTED_ERROR"}`);
    process.exitCode = 1;
  });
}
