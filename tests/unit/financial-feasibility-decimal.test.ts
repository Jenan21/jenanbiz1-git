import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  addFinancialDecimals, compareFinancialDecimals, divideFinancialDecimals, financialDecimalSchema,
  multiplyFinancialDecimals, normalizeFinancialDecimal, roundFinancialDecimal, roundFinancialMoney,
} from "@/services/analysis-engines/financial-feasibility";

describe("Financial M1 decimal semantics", () => {
  it.each([
    ["0", "0"], ["-0", "0"], ["-0.000", "0"], ["1.2300", "1.23"], ["0.1000000000000000", "0.1"],
    ["999999999999999999.9999999999999999", "999999999999999999.9999999999999999"],
  ])("normalizes %s exactly", (raw, expected) => expect(normalizeFinancialDecimal(raw)).toBe(expected));
  it.each(["", " ", "+1", "01", ".1", "1.", "1e3", "NaN", "Infinity", "0x10", "1000000000000000000", "0.00000000000000001", "1,000"])("rejects noncanonical/out-of-bound input %s", (raw) => expect(financialDecimalSchema.safeParse(raw).success).toBe(false));
  it.each([0, 1.2, null, true, {}, []])("never coerces non-string %j", (value) => expect(financialDecimalSchema.safeParse(value).success).toBe(false));
  it("adds and multiplies exactly in decimal, not binary floating point", () => {
    expect(addFinancialDecimals("0.1", "0.2")).toBe("0.3");
    expect(multiplyFinancialDecimals("19.99", "3")).toBe("59.97");
    expect(addFinancialDecimals("9007199254740993", "1")).toBe("9007199254740994");
    expect(compareFinancialDecimals("-0", "0")).toBe(0);
  });
  it.each([["1.005", 2, "1"], ["1.015", 2, "1.02"], ["-1.005", 2, "-1"], ["-1.015", 2, "-1.02"], ["2.5", 0, "2"], ["3.5", 0, "4"]])("uses HALF_EVEN %s at %s", (value, places, expected) => {
    expect(roundFinancialDecimal(String(value), Number(places))).toBe(expected);
  });
  it("retains 34-digit intermediates and rounds only the reported value", () => {
    const third = divideFinancialDecimals("1", "3");
    expect(third).toBe("0.3333333333333333333333333333333333");
    expect(roundFinancialDecimal(third, 2)).toBe("0.33");
    expect(addFinancialDecimals(third, third)).toBe("0.6666666666666666666666666666666666");
  });
  it.each([["SAR", "1.23"], ["JPY", "1"], ["KWD", "1.234"]] as const)("reports %s at explicit currency minor units", (currency, expected) => {
    expect(roundFinancialMoney("1.2345", currency)).toBe(expected);
  });
  it("does not modify or depend on another consumer's global Decimal settings", () => {
    const previous = { precision: Decimal.precision, rounding: Decimal.rounding };
    try {
      Decimal.set({ precision: 3, rounding: Decimal.ROUND_UP });
      expect(divideFinancialDecimals("1", "3")).toBe("0.3333333333333333333333333333333333");
      expect(roundFinancialDecimal("1.005", 2)).toBe("1");
    } finally { Decimal.set(previous); }
  });
  it.each([() => divideFinancialDecimals("1", "0"), () => addFinancialDecimals("999999999999999999", "1"), () => multiplyFinancialDecimals("999999999999999999", "2"),
    () => roundFinancialDecimal("1", -1), () => roundFinancialDecimal("1", 17)])("surfaces invalid operation or overflow explicitly", (operation) => expect(operation).toThrow());
});
