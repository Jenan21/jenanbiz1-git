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
export function subtractFinancialDecimals(left: string, right: string): string { return bounded(decimal(left).minus(decimal(right))); }
export function multiplyFinancialDecimals(left: string, right: string): string { return bounded(decimal(left).times(decimal(right))); }
export function divideFinancialDecimals(left: string, right: string): string {
  if (decimal(right).isZero()) throw new RangeError("Financial division by zero");
  return bounded(decimal(left).dividedBy(decimal(right)));
}
export function financialIntegerPower(value: string, exponent: number): string {
  if (!Number.isSafeInteger(exponent) || exponent < 0 || exponent > 120) throw new RangeError("Financial power requires a bounded nonnegative integer");
  return bounded(decimal(value).pow(exponent));
}
export function ceilFinancialDecimal(value: string): string { return bounded(decimal(value).ceil()); }
export function financialAbsolute(value: string): string { return bounded(decimal(value).abs()); }
export function financialSign(value: string): number { return decimal(value).comparedTo(0); }
export function financialNpv(cashFlows: readonly string[], rate: string): string {
  if (decimal(rate).lte(-1)) throw new RangeError("Financial discount rate must be greater than -1");
  return bounded(cashFlows.reduce((total, amount, period) =>
    total.plus(decimal(amount).dividedBy(decimal("1").plus(rate).pow(period))), decimal("0")));
}
export function solveFinancialIrrBisection(
  cashFlows: readonly string[], lowerRate: string, upperRate: string, maxIterations: number,
  rateTolerance: string, normalizedResidualTolerance: string,
) {
  let lower = decimal(lowerRate); let upper = decimal(upperRate);
  if (lower.lte(-1) || upper.lte(lower) || !Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 256) {
    throw new RangeError("Invalid bounded financial IRR solver policy");
  }
  const scale = Arithmetic.max(cashFlows.reduce((total, amount) => total.plus(decimal(amount).abs()), decimal("0")), decimal("1"));
  const residual = (rate: Decimal) => decimal(financialNpv(cashFlows, bounded(rate)));
  let lowValue = residual(lower); let highValue = residual(upper);
  if (lowValue.isZero()) return { status: "COMPUTED" as const, rate: bounded(lower), iterations: 0 };
  if (highValue.isZero()) return { status: "COMPUTED" as const, rate: bounded(upper), iterations: 0 };
  if (lowValue.isPositive() === highValue.isPositive()) return { status: "NOT_BRACKETED" as const, rate: null, iterations: 0 };
  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const middle = lower.plus(upper).dividedBy("2");
    const middleValue = residual(middle);
    if (middleValue.isZero()) {
      return { status: "COMPUTED" as const, rate: bounded(middle), iterations: iteration };
    }
    if (middleValue.isPositive() === lowValue.isPositive()) {
      lower = middle; lowValue = middleValue;
    } else {
      upper = middle; highValue = middleValue;
    }
    if (upper.minus(lower).lte(rateTolerance)) {
      const finalRate = lower.plus(upper).dividedBy("2");
      const finalValue = residual(finalRate);
      if (finalValue.abs().dividedBy(scale).lte(normalizedResidualTolerance)) {
        return { status: "COMPUTED" as const, rate: bounded(finalRate), iterations: iteration };
      }
      return { status: "NONCONVERGENT" as const, rate: null, iterations: iteration };
    }
  }
  return { status: "NONCONVERGENT" as const, rate: null, iterations: maxIterations };
}
export function roundFinancialDecimal(value: string, places: number): string {
  if (!Number.isInteger(places) || places < 0 || places > 16) throw new RangeError("Financial reporting scale must be 0..16");
  return bounded(decimal(value).toDecimalPlaces(places));
}
