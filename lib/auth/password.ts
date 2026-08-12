import { hash, verify } from "@node-rs/argon2";

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
