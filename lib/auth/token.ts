import { createHash, randomBytes } from "node:crypto";

export const DEFAULT_SESSION_SECONDS = 60 * 60 * 24;
export const REMEMBERED_SESSION_SECONDS = 60 * 60 * 24 * 30;

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
