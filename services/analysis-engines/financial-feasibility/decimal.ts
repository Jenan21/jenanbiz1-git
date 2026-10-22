import Decimal from "decimal.js";
import { z } from "zod";

const Arithmetic = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN, toExpNeg: -100, toExpPos: 100 });
export const financialDecimalPolicy = {
  id: "financial-decimal-v1", version: "1.0.0", precision: 34, rounding: "HALF_EVEN",
  maxInputScale: 16, maxIntegerDigits: 18,
} as const;
export const financialDecimalSchema = z.string().max(36).regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,16})?$/, "A bounded plain base-10 decimal string is required");
export const financialResultDecimalSchema = z.string().max(100).regex(/^-?(0|[1-9]\d{0,17})(\.\d{1,64})?$/)
  .refine((value) => value.replace(/[-.]/g, "").replace(/^0+/, "").length <= 34, "At most 34 significant decimal digits");
function decimal(value: string) { return new Arithmetic(financialResultDecimalSchema.parse(value)); }
function bounded(value: Decimal): string {
  if (!value.isFinite() || value.abs().gte("1000000000000000000")) throw new RangeError("Financial decimal overflow");
  return financialResultDecimalSchema.parse(value.isZero() ? "0" : value.toFixed());
}
export function normalizeFinancialDecimal(value: string): string { financialDecimalSchema.parse(value); return bounded(decimal(value)); }
export function compareFinancialDecimals(left: string, right: string): number { return decimal(left).comparedTo(decimal(right)); }
export function addFinancialDecimals(left: string, right: string): string { return bounded(decimal(left).plus(decimal(right))); }
export function multiplyFinancialDecimals(left: string, right: string): string { return bounded(decimal(left).times(decimal(right))); }
export function divideFinancialDecimals(left: string, right: string): string {
  if (decimal(right).isZero()) throw new RangeError("Financial division by zero");
  return bounded(decimal(left).dividedBy(decimal(right)));
}
export function roundFinancialDecimal(value: string, places: number): string {
  if (!Number.isInteger(places) || places < 0 || places > 16) throw new RangeError("Financial reporting scale must be 0..16");
  return bounded(decimal(value).toDecimalPlaces(places));
}
