import { createHash } from "node:crypto";

/**
 * Canonical JSON and hashing for reproducible analysis runs.
 *
 * The encoding follows the JSON Canonicalization Scheme (RFC 8785) for the values the engines produce: object keys are
 * sorted by UTF-16 code unit, no whitespace is emitted, strings and numbers use the ECMAScript JSON serialization.
 * It is deliberately stricter than JSON.stringify so that two equal results can never hash differently, or two different
 * results hash alike, because of silent coercion:
 *  - `undefined` object members are omitted (they do not exist in JSON), but `undefined` inside an array is rejected;
 *  - NaN, Infinity, BigInt, functions, symbols, Map, Set and class instances are rejected;
 *  - a Date is encoded as its ISO 8601 UTC string and an invalid Date is rejected.
 */
export class CanonicalizationError extends Error {
  constructor(public readonly path: string, public readonly reason: string) {
    super(`Cannot canonicalize ${path}: ${reason}`);
    this.name = "CanonicalizationError";
  }
}

function encode(value: unknown, path: string): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean": return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new CanonicalizationError(path, "number is not finite");
      return JSON.stringify(value);
    case "string": return JSON.stringify(value);
    case "object": {
      if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) throw new CanonicalizationError(path, "invalid Date");
        return JSON.stringify(value.toISOString());
      }
      if (Array.isArray(value)) {
        return `[${value.map((entry, index) => {
          if (entry === undefined) throw new CanonicalizationError(`${path}[${index}]`, "undefined inside an array");
          return encode(entry, `${path}[${index}]`);
        }).join(",")}]`;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) throw new CanonicalizationError(path, "not a plain object");
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(record[key], `${path}.${key}`)}`).join(",")}}`;
    }
    default: throw new CanonicalizationError(path, `unsupported type ${typeof value}`);
  }
}

export function canonicalize(value: unknown): string {
  return encode(value, "$");
}
export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
/** SHA-256 (lower-case hex) of the canonical encoding. */
export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalize(value));
}
/** Shallow copy without the listed top-level keys, used to hash the deterministic part of a result. */
export function omitKeys<T extends Record<string, unknown>>(value: T, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
}

/**
 * The single rounding rule for reported measurements: half away from zero on the decimal digits, with -0 normalized to 0.
 * Measurements are rounded once, before they are stored or hashed, so a harmless difference in the last binary digit of a
 * computed double cannot change an output hash.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) throw new RangeError("roundTo requires a finite number");
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12) throw new RangeError("roundTo decimals must be an integer from 0 to 12");
  const magnitude = Math.abs(value);
  const digits = String(magnitude);
  // Shifting the decimal point in the shortest round-trip text avoids binary artefacts (1.005 stays 1.005). Exponent notation
  // only occurs for extreme magnitudes, where the plain form is exact enough.
  const rounded = digits.includes("e")
    ? Math.round(magnitude * 10 ** decimals) / 10 ** decimals
    : Number(`${Math.round(Number(`${digits}e${decimals}`))}e-${decimals}`);
  return value < 0 && rounded !== 0 ? -rounded : rounded;
}

/** Locale-independent ordering (UTF-16 code units, the same order canonical JSON uses for keys). */
export function compareText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}
