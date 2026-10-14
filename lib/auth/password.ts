import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

const options = {
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

export function hashPassword(password: string) {
  return hash(password, options);
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password);
}

let dummyHash: Promise<string> | undefined;

/**
 * A hash nobody knows the password of. Paths that find no account verify against it so that "no such account" costs
 * the same time as "wrong secret" and the difference cannot be measured from outside.
 */
export function getDummyPasswordHash() {
  dummyHash ??= hashPassword(randomBytes(32).toString("base64url"));
  return dummyHash;
}
