import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");

if (existsSync(envPath)) {
  console.log("Local .env already exists; no changes made.");
  process.exit(0);
}

const password = randomBytes(32).toString("base64url");
const authSecret = randomBytes(48).toString("base64url");
const port = "54329";
const database = "jenanbiz";
const user = "jenanbiz_app";
const databaseUrl = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public`;

writeFileSync(
  envPath,
  [
    `DATABASE_URL=${databaseUrl}`,
    `POSTGRES_DB=${database}`,
    `POSTGRES_USER=${user}`,
    `POSTGRES_PASSWORD=${password}`,
    `POSTGRES_PORT=${port}`,
    "NEXT_PUBLIC_APP_URL=http://localhost:3000",
    `AUTH_SECRET=${authSecret}`,
    "",
  ].join("\n"),
  { encoding: "utf8", mode: 0o600, flag: "wx" },
);

console.log("Created local .env with generated credentials.");
