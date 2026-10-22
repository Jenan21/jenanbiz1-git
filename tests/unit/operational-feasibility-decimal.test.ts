import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { compareOperationalDecimals, convertOperationalTime, normalizeOperationalDecimal, operationalWhole, roundOperationalDecimal } from "@/services/analysis-engines/operational-feasibility";

describe("Operational isolated deterministic decimal/time policy", () => {
  it.each(["0", "1", "999999999999999999", "0.0000000000000001", "-2.5"])("accepts bounded plain decimal %s", (value) => {
    expect(compareOperationalDecimals(normalizeOperationalDecimal(value), value)).toBe(0);
  });
  it.each(["NaN", "Infinity", "1e3", "01", "+1", ".5", "1.", "", "1000000000000000000", "0.00000000000000001", " 1", "1 "])("rejects noncanonical/overflow %s", (value) => {
    expect(() => normalizeOperationalDecimal(value)).toThrow();
  });
  it.each([["-0.000", "0"], ["1.2300", "1.23"], ["123.000", "123"]])("normalizes %s without binary conversion", (value, expected) => {
    expect(normalizeOperationalDecimal(value)).toBe(expected);
  });
  it.each([["1.2345665", "1.234566"], ["1.2345675", "1.234568"], ["-1.2345665", "-1.234566"], ["0.0000005", "0"]])("rounds %s HALF_EVEN", (value, expected) => {
    expect(roundOperationalDecimal(value)).toBe(expected);
  });
  it("isolates Decimal precision/rounding from the application global configuration", () => {
    const precision = Decimal.precision; const rounding = Decimal.rounding;
    try {
      Decimal.set({ precision: 3, rounding: Decimal.ROUND_UP });
      expect(convertOperationalTime("1.23456789", "HOUR", "MINUTE")).toBe("74.0740734");
      expect(roundOperationalDecimal("1.2345665")).toBe("1.234566");
    } finally { Decimal.set({ precision, rounding }); }
  });
  it.each([["2", "HOUR", "MINUTE", "120"], ["90", "MINUTE", "HOUR", "1.5"], ["0", "MINUTE", "HOUR", "0"], ["1", "HOUR", "HOUR", "1"]] as const)("converts explicit %s %s to %s", (value, from, to, expected) => {
    expect(convertOperationalTime(value, from, to)).toBe(expected);
  });
  it("rejects negative/overflow time, never assumes productive hours per day", () => {
    expect(() => convertOperationalTime("-1", "HOUR", "MINUTE")).toThrow();
    expect(() => convertOperationalTime("999999999999999999", "HOUR", "MINUTE")).toThrow(/overflow/);
  });
  it("does not lose integer precision beyond JavaScript's safe numeric range", () => {
    expect(compareOperationalDecimals("999999999999999998", "999999999999999999")).toBe(-1);
    expect(operationalWhole("1.0")).toBe(true); expect(operationalWhole("1.1")).toBe(false);
  });
  it("retains high precision time intermediates until the declared reporting rounding", () => {
    const hours = convertOperationalTime("1", "MINUTE", "HOUR");
    expect(hours).toBe("0.01666666666666666666666666666666667");
    expect(roundOperationalDecimal(hours)).toBe("0.016667");
    expect(() => normalizeOperationalDecimal(hours)).toThrow();
  });
});
