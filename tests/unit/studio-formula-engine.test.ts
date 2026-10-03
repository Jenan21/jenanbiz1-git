import { describe, expect, it } from "vitest";

import { evaluateSheetRows } from "@/lib/studio/formula-engine";

describe("Studio formula engine", () => {
  it("evaluates cell references, ranges, and formula dependencies", () => {
    const values = evaluateSheetRows([
      ["Item", "Value"],
      ["Base", "10"],
      ["Double", "=B2*2"],
      ["Total", "=SUM(B2:B3)"],
    ]);

    expect(values[2]?.[1]).toBe("20");
    expect(values[3]?.[1]).toBe("30");
  });

  it("returns a visible error for circular references", () => {
    expect(evaluateSheetRows([["=B1", "=A1"]])[0]?.[0]).toMatch(/^#/);
  });
});