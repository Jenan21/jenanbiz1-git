import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { Pool } from "pg";
import { e2eIdentity } from "./test-identities";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for E2E");

export function createE2EDb() {
  return new Pool({ connectionString, max: 2, allowExitOnIdle: true });
}

export async function queryE2E<Row extends Record<string, unknown>>(
  text: string,
  values: unknown[],
) {
  const pool = createE2EDb();
  try {
    return await pool.query<Row>(text, values);
  } finally {
    await pool.end();
  }
}
export async function cleanE2EIdentities() {
  const e2eDb = createE2EDb();
  const client = await e2eDb.connect();
  try {
    await client.query("BEGIN");
    const users = await client.query<{ id: string }>(
      "SELECT id FROM \"User\" WHERE email LIKE 'e2e.user.%@example.test' OR email LIKE 'e2e.admin.%@example.test'",
    );
    const ids = users.rows.map(({ id }) => id);
    if (ids.length) {
      await client.query(
        'DELETE FROM "AuditLog" WHERE "actorId" = ANY($1::text[]) OR ("entityType" = \'User\' AND "entityId" = ANY($1::text[]))',
        [ids],
      );
      await client.query('DELETE FROM "User" WHERE id = ANY($1::text[])', [
        ids,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await e2eDb.end();
  }
}

export async function seedE2EAdmin() {
  const userId = randomUUID();
  const profileId = randomUUID();
  const passwordHash = await hash(e2eIdentity.admin.password, {
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
    outputLen: 32,
  });
  const e2eDb = createE2EDb();
  const client = await e2eDb.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      'INSERT INTO "User" (id, email, "passwordHash", status, "systemRole", "createdAt", "updatedAt") VALUES ($1, $2, $3, \'ACTIVE\', \'ADMIN\', NOW(), NOW())',
      [userId, e2eIdentity.admin.email, passwordHash],
    );
    await client.query(
      'INSERT INTO "Profile" (id, "userId", "displayName", locale, language, "countryCode", timezone, "createdAt", "updatedAt") VALUES ($1, $2, $3, \'en\', \'en\', \'SA\', \'Asia/Riyadh\', NOW(), NOW())',
      [profileId, userId, e2eIdentity.admin.displayName],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await e2eDb.end();
  }
}
