import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/**
 * Harness for the Spatial Engine's PostGIS tests. They are opt-in (RUN_SPATIAL_ENGINE_POSTGIS_TESTS=1) and only ever talk to a loopback
 * PostgreSQL that has PostGIS. Everything they create is a scratch database or role whose name starts with `se_`, and is dropped
 * afterwards; the real Map database is used only as a read-only template for a copy, never connected to for writing.
 */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const SCRATCH_NAME = /^se_[a-z0-9_]{1,50}$/;

export const postgisTestsEnabled = process.env.RUN_SPATIAL_ENGINE_POSTGIS_TESTS === "1" && Boolean(process.env.SPATIAL_ENGINE_TEST_ADMIN_URL);
export const realMapTemplate = process.env.SPATIAL_ENGINE_REAL_MAP_DB ?? "";

function adminBase(): URL {
  const url = new URL(process.env.SPATIAL_ENGINE_TEST_ADMIN_URL ?? "");
  if (!LOOPBACK.has(url.hostname)) throw new Error("The PostGIS engine tests only run against a loopback database");
  return url;
}

export const scratchName = (prefix = "se") => `${prefix}_${randomBytes(5).toString("hex")}`;
export function assertScratch(name: string) {
  if (!SCRATCH_NAME.test(name)) throw new Error(`Refusing to touch "${name}": scratch names are se_ followed by lower-case letters, digits and underscores`);
  return name;
}

/** A connection string for `database` on the test server, as the administrator or as another login. */
export function urlFor(database: string, credentials?: { user: string; password: string }): string {
  const url = adminBase();
  url.pathname = `/${database}`;
  if (credentials) { url.username = credentials.user; url.password = credentials.password; }
  return url.toString();
}

export async function withClient<T>(connectionString: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try { return await work(client); } finally { await client.end(); }
}
export const withAdmin = <T>(work: (client: Client) => Promise<T>, database = "postgres") => withClient(urlFor(database), work);

export async function createDatabase(name: string, template?: string): Promise<void> {
  assertScratch(name);
  await withAdmin((client) => client.query(`CREATE DATABASE "${name}"${template === undefined ? "" : ` TEMPLATE "${template}"`}`));
}
export async function dropDatabase(name: string): Promise<void> {
  assertScratch(name);
  await withAdmin((client) => client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
}
export async function dropRole(name: string): Promise<void> {
  assertScratch(name);
  await withAdmin((client) => client.query(`DROP ROLE IF EXISTS "${name}"`));
}

/** The Map's own migrations, in the order Prisma applies them (by folder name). They are read, never changed. */
export function mapMigrations(): Array<{ name: string; sql: string }> {
  const root = path.join(process.cwd(), "prisma", "jenan-map", "migrations");
  return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
    .map((name) => ({ name, sql: readFileSync(path.join(root, name, "migration.sql"), "utf8") }));
}

/** A scratch database with PostGIS and the Map's schema built by the Map's real migrations. */
export async function createMapDatabase(): Promise<string> {
  const name = scratchName();
  await createDatabase(name);
  await withClient(urlFor(name), async (client) => { for (const migration of mapMigrations()) await client.query(migration.sql); });
  return name;
}

/** A scratch database that has PostGIS and nothing else. */
export async function createPostgisOnlyDatabase(): Promise<string> {
  const name = scratchName();
  await createDatabase(name);
  await withClient(urlFor(name), (client) => client.query("CREATE EXTENSION IF NOT EXISTS postgis"));
  return name;
}

/** A scratch database without PostGIS. */
export async function createBareDatabase(): Promise<string> {
  const name = scratchName();
  await createDatabase(name);
  return name;
}

/** A scratch copy of a database, made with the server's own template mechanism, so the original is not written. */
export async function copyDatabase(source: string): Promise<string> {
  const name = scratchName("se_copy");
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { await createDatabase(name, source); return name; } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 1000)); }
  }
  throw lastError;
}
