import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");

const password = randomBytes(32).toString("base64url");
const authSecret = randomBytes(48).toString("base64url");
const port = "54329";
const database = "jenanbiz";
const user = "jenanbiz_app";
const databaseUrl = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public`;

try {
  // "wx" creates the file only if it does not exist, so an existing .env is never overwritten and no check-then-write race exists.
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
} catch (error) {
  if (error && error.code === "EEXIST") {
    console.log("Local .env already exists; no changes made.");
  } else {
    throw error;
  }
}
