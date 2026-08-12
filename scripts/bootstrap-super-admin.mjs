import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { Pool } from "pg";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} must be supplied through the server environment`);
  return value;
};

const databaseUrl = required("DATABASE_URL");
const email = required("SUPER_ADMIN_EMAIL").toLowerCase();
const password = required("SUPER_ADMIN_PASSWORD");
const displayName =
  process.env.SUPER_ADMIN_DISPLAY_NAME?.trim() || "Platform Administrator";
const locale = process.env.SUPER_ADMIN_LOCALE === "ar" ? "ar" : "en";
const countryCode = (
  process.env.SUPER_ADMIN_COUNTRY_CODE?.trim() || "SA"
).toUpperCase();

if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254)
  throw new Error("SUPER_ADMIN_EMAIL is invalid");
if (password.length < 16 || password.length > 128)
  throw new Error("SUPER_ADMIN_PASSWORD must contain 16 to 128 characters");
if (!/^[A-Z]{2}$/.test(countryCode))
  throw new Error("SUPER_ADMIN_COUNTRY_CODE must be ISO alpha-2");

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
  const existingSuperAdmin = await client.query(
    `SELECT id FROM "User" WHERE "systemRole" = 'SUPER_ADMIN' LIMIT 1`,
  );
  if (existingSuperAdmin.rowCount) {
    throw new Error("Bootstrap refused: a SUPER_ADMIN already exists");
  }
  const existingEmail = await client.query(
    `SELECT id FROM "User" WHERE email = $1 LIMIT 1`,
    [email],
  );
  if (existingEmail.rowCount) {
    throw new Error(
      "Bootstrap refused: the requested email already belongs to an account",
    );
  }

  const userId = randomUUID();
  await client.query(
    `INSERT INTO "User" (id, email, "passwordHash", status, "systemRole", "createdAt", "updatedAt") VALUES ($1, $2, $3, 'ACTIVE', 'SUPER_ADMIN', NOW(), NOW())`,
    [userId, email, passwordHash],
  );
  await client.query(
    `INSERT INTO "Profile" (id, "userId", "displayName", locale, language, "countryCode", timezone, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $4, $5, 'Asia/Riyadh', NOW(), NOW())`,
    [randomUUID(), userId, displayName, locale, countryCode],
  );
  await client.query(
    `INSERT INTO "AuditLog" (id, "actorId", action, "entityType", "entityId", metadata, "createdAt") VALUES ($1, $2, 'super_admin.bootstrapped', 'User', $2, $3::jsonb, NOW())`,
    [
      randomUUID(),
      userId,
      JSON.stringify({ method: "server_cli", locale, countryCode }),
    ],
  );
  await client.query("COMMIT");
  console.log("Initial SUPER_ADMIN created and audited successfully.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(
    error instanceof Error ? error.message : "SUPER_ADMIN bootstrap failed",
  );
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
