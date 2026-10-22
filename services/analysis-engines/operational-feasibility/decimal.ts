import Decimal from "decimal.js";
import { z } from "zod";

const Arithmetic = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN, toExpNeg: -100, toExpPos: 100 });
export const operationalDecimalPolicy = {
  id: "operational-decimal-v1", version: "1.0.0", precision: 34, rounding: "HALF_EVEN",
  maxIntegerDigits: 18, maxInputScale: 16, reportingScale: 6,
} as const;
export const operationalDecimalSchema = z.string().max(36).regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,16})?$/);
export const operationalResultDecimalSchema = z.string().max(100).regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,64})?$/)
  .refine((value) => value.replace(/[-.]/g, "").replace(/^0+/, "").length <= 34, "At most 34 significant decimal digits");
function decimal(value: string) { return new Arithmetic(operationalResultDecimalSchema.parse(value)); }
function bounded(value: Decimal) {
  if (!value.isFinite() || value.abs().gte("1000000000000000000")) throw new RangeError("Operational decimal overflow");
  return operationalResultDecimalSchema.parse(value.isZero() ? "0" : value.toFixed());
}
export function normalizeOperationalDecimal(value: string) { operationalDecimalSchema.parse(value); return bounded(decimal(value)); }
export function compareOperationalDecimals(left: string, right: string) { return decimal(left).comparedTo(decimal(right)); }
export function operationalWhole(value: string) { return decimal(value).isInteger(); }
export function convertOperationalTime(value: string, from: "MINUTE" | "HOUR", to: "MINUTE" | "HOUR") {
  if (!["MINUTE", "HOUR"].includes(from) || !["MINUTE", "HOUR"].includes(to)) throw new RangeError("Explicit minute/hour conversion only");
  const amount = decimal(value);
  if (amount.isNegative()) throw new RangeError("Operational time cannot be negative");
  return bounded(from === to ? amount : from === "HOUR" ? amount.times(60) : amount.dividedBy(60));
}
export function roundOperationalDecimal(value: string) {
  return bounded(decimal(value).toDecimalPlaces(operationalDecimalPolicy.reportingScale));
}
export function operationalArithmetic(operation: "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE" | "MIN" | "MAX", left: string, right: string) {
  const a = decimal(left); const b = decimal(right);
  if (operation === "DIVIDE" && b.isZero()) throw new RangeError("Operational zero denominator");
  return bounded(operation === "ADD" ? a.plus(b) : operation === "SUBTRACT" ? a.minus(b)
    : operation === "MULTIPLY" ? a.times(b) : operation === "DIVIDE" ? a.dividedBy(b)
      : operation === "MIN" ? Arithmetic.min(a, b) : Arithmetic.max(a, b));
}
export function wholeOperationalDecimal(value: string, direction: "UP" | "DOWN") {
  return bounded(decimal(value).toDecimalPlaces(0, direction === "UP" ? Decimal.ROUND_CEIL : Decimal.ROUND_FLOOR));
}
