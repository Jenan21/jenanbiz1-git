import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pgBin = "C:\\Program Files\\PostgreSQL\\17\\bin";
const role = "jenan_queue_verify";
const dataDirectory = await mkdtemp(join(tmpdir(), "jenan-queue-migration-"));
const prismaCli = join(process.cwd(), "node_modules", "prisma", "build", "index.js");

function run(command, args, environment = process.env, options = {}) {
  const result = spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", env: environment, ...options });
  if (result.status !== 0) throw new Error(`${command} failed: ${String(result.stderr ?? result.stdout ?? result.error?.message ?? "").trim()}`);
}

const server = createServer();
await new Promise((resolve, reject) => { server.once("error", reject); server.listen({ host: "127.0.0.1", port: 0 }, resolve); });
const address = server.address();
await new Promise((resolve) => server.close(resolve));
if (!address || typeof address === "string") throw new Error("Unable to allocate a port");
const port = address.port;
const initdb = join(pgBin, "initdb.exe");
const pgCtl = join(pgBin, "pg_ctl.exe");
const createdb = join(pgBin, "createdb.exe");
let started = false;

try {
  run(initdb, ["-D", dataDirectory, "--username", role, "--auth", "trust", "--encoding", "UTF8", "--no-locale"]);
  run(pgCtl, ["-D", dataDirectory, "-o", `-h 127.0.0.1 -p ${port}`, "-w", "-t", "15", "start"], process.env, { stdio: "ignore" });
  started = true;
  run(createdb, ["-h", "127.0.0.1", "-p", String(port), "-U", role, "queue_migration"]);
  const before = new Set(await readdir("prisma/migrations"));
  run(process.execPath, [prismaCli, "migrate", "dev", "--create-only", "--name", "add_academy_queue_sandbox"], { ...process.env, DATABASE_URL: `postgresql://${role}@127.0.0.1:${port}/queue_migration?schema=public` });
  const created = (await readdir("prisma/migrations")).filter((entry) => !before.has(entry));
  if (created.length !== 1) throw new Error(`Expected one migration, found ${created.length}`);
  console.log(JSON.stringify({ migration: created[0] }));
} finally {
  if (started) spawnSync(pgCtl, ["-D", dataDirectory, "-w", "stop", "-m", "fast"], { stdio: "ignore" });
  await rm(dataDirectory, { recursive: true, force: true });
}