import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

const options = {
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
} as const;

function bounded(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

/** Hashing is deliberately expensive (64 MB and a few tens of milliseconds of CPU each), so only a few run at once. */
const MAX_CONCURRENT = bounded(process.env.PASSWORD_HASH_CONCURRENCY, 4, 1, 32);
/** Beyond this many waiting callers the work is refused at once instead of queueing without limit. */
const MAX_WAITING = bounded(process.env.PASSWORD_HASH_QUEUE, 24, 0, 1_000);

/** Thrown when password hashing is saturated; the caller should answer 503 and ask the client to retry shortly. */
export class PasswordWorkBusyError extends Error {
  constructor() {
    super("Password processing is busy");
    this.name = "PasswordWorkBusyError";
  }
}

export function createPasswordWorkLimiter(concurrency: number, maxWaiting: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return {
    get active() {
      return active;
    },
    get waiting() {
      return waiting.length;
    },
    async run<T>(task: () => Promise<T>): Promise<T> {
      if (active < concurrency) {
        active += 1;
      } else {
        if (waiting.length >= maxWaiting) throw new PasswordWorkBusyError();
        // The finishing task hands its slot to the next in line, so `active` never drops while someone waits.
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      try {
        return await task();
      } finally {
        const next = waiting.shift();
        if (next) next();
        else active -= 1;
      }
    },
  };
}

// Without a bound, a flood of sign-in attempts from many addresses would queue unlimited hashing work: every request
// would wait behind it, memory would grow, and real members could not sign in. With it, the server stays responsive
// and refuses the excess quickly.
const limiter = createPasswordWorkLimiter(MAX_CONCURRENT, MAX_WAITING);

export function hashPassword(password: string) {
  return limiter.run(() => hash(password, options));
}

export function verifyPassword(passwordHash: string, password: string) {
  return limiter.run(() => verify(passwordHash, password));
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
