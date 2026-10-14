// Creates the one initial SUPER_ADMIN. It runs on the server only; there is no HTTP endpoint for it.
//
//   npm run auth:bootstrap-super-admin -- --email=owner@example.com
//
// The password is never read from a file or logged by this script. Either supply SUPER_ADMIN_PASSWORD through the
// environment, or leave it unset in an interactive terminal and a strong password is generated and printed once.
// A database that is not local needs a typed confirmation (or --yes in automation).
//
// Options:
//   --email=<address>    the administrator's address (or SUPER_ADMIN_EMAIL)
//   --name=<display>     the display name (or SUPER_ADMIN_DISPLAY_NAME)
//   --mark-verified      also record the address as verified; use it only when you own the inbox
//   --yes                skip the confirmation prompt (non-interactive runs)
//   --help               show this text
import { randomInt, randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { hash } from "@node-rs/argon2";
import { Pool } from "pg";

const argv = process.argv.slice(2);
const option = (name) => argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3).trim();
const flag = (name) => argv.includes(`--${name}`);

if (flag("help")) {
  console.log("Usage: npm run auth:bootstrap-super-admin -- --email=<address> [--name=<display name>] [--mark-verified] [--yes]");
  process.exit(0);
}

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) fail("DATABASE_URL must be supplied through the server environment");
const email = (option("email") ?? process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
const displayName = option("name") ?? (process.env.SUPER_ADMIN_DISPLAY_NAME?.trim() || "Platform Administrator");
const locale = process.env.SUPER_ADMIN_LOCALE === "ar" ? "ar" : "en";
const countryCode = (process.env.SUPER_ADMIN_COUNTRY_CODE?.trim() || "SA").toUpperCase();
const markVerified = flag("mark-verified");

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fail("Provide a valid address with --email=<address> (or SUPER_ADMIN_EMAIL).");
if (!/^[A-Z]{2}$/.test(countryCode)) fail("SUPER_ADMIN_COUNTRY_CODE must be ISO alpha-2");
if (displayName.length < 2 || displayName.length > 80) fail("The display name must contain 2 to 80 characters");

function generatePassword() {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%^&*-_=+?"];
  const all = sets.join("");
  const picked = sets.map((set) => set[randomInt(set.length)]);
  while (picked.length < 24) picked.push(all[randomInt(all.length)]);
  for (let index = picked.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [picked[index], picked[swap]] = [picked[swap], picked[index]];
  }
  return picked.join("");
}

let password = process.env.SUPER_ADMIN_PASSWORD ?? "";
let generated = false;
if (!password) {
  if (!process.stdout.isTTY) fail("Set SUPER_ADMIN_PASSWORD, or run this in an interactive terminal so a password can be generated and shown once.");
  password = generatePassword();
  generated = true;
}
if (password.length < 16 || password.length > 128) fail("The password must contain 16 to 128 characters");

let target;
try {
  const url = new URL(databaseUrl);
  target = { host: url.hostname, label: `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}` };
} catch {
  fail("DATABASE_URL is not a valid connection string");
}
const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.host);

console.log(`Database: ${target.label}`);
console.log(`Account:  ${email} (${displayName})${markVerified ? ", address marked verified" : ""}`);
if (!isLocal && !flag("yes")) {
  if (!process.stdin.isTTY) fail("This is not a local database. Re-run with --yes to confirm, or run it in an interactive terminal.");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const typed = (await prompt.question(`This is NOT a local database. Type the host name (${target.host}) to create the SUPER_ADMIN there: `)).trim();
  prompt.close();
  if (typed !== target.host) fail("Cancelled: the host name did not match.");
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

try {
  const passwordHash = await hash(password, {
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  });
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  await client.query("SELECT pg_advisory_xact_lock($1)", [7259202611]);
  const existingSuperAdmin = await client.query(`SELECT id FROM "User" WHERE "systemRole" = 'SUPER_ADMIN' LIMIT 1`);
  if (existingSuperAdmin.rowCount) throw new Error("Bootstrap refused: a SUPER_ADMIN already exists");
  const existingEmail = await client.query(`SELECT id FROM "User" WHERE email = $1 LIMIT 1`, [email]);
  if (existingEmail.rowCount) throw new Error("Bootstrap refused: the requested email already belongs to an account");

  const userId = randomUUID();
  await client.query(
    `INSERT INTO "User" (id, email, "passwordHash", status, "systemRole", "emailVerifiedAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, 'ACTIVE', 'SUPER_ADMIN', CASE WHEN $4::boolean THEN NOW() ELSE NULL END, NOW(), NOW())`,
    [userId, email, passwordHash, markVerified],
  );
  await client.query(
    `INSERT INTO "Profile" (id, "userId", "displayName", locale, language, "countryCode", timezone, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $4, $5, 'Asia/Riyadh', NOW(), NOW())`,
    [randomUUID(), userId, displayName, locale, countryCode],
  );
  await client.query(
    `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt") VALUES ($1, $2, 'super_admin.bootstrapped', 'User', $2, $3::jsonb, NOW())`,
    [randomUUID(), userId, JSON.stringify({ method: "server_cli", locale, countryCode, passwordGenerated: generated, emailMarkedVerified: markVerified })],
  );
  await client.query("COMMIT");
  console.log("Initial SUPER_ADMIN created and audited successfully.");
  if (generated) {
    console.log("\nSign-in password (shown once, saved nowhere):\n");
    console.log(`    ${password}\n`);
    console.log("Store it in a password manager now, sign in, and change it. Anyone who sees this screen can see it.");
  }
  if (!markVerified) console.log("The address is not verified yet; verify it after signing in once e-mail delivery is configured (npm run mail:check).");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(error instanceof Error ? error.message : "SUPER_ADMIN bootstrap failed");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
