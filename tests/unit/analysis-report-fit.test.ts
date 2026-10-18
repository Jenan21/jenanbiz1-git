import { describe, expect, it } from "vitest";
import { clampText, fitItems, linesFor } from "@/lib/projects/analysis-report-fit";

describe("one-screen fit helpers", () => {
  it("keeps a short text whole and cuts a long one at a word with an ellipsis", () => {
    expect(clampText("  Coffee   shop  ", 40)).toEqual({ text: "Coffee shop", clamped: false });
    const cut = clampText("A platform that delivers specialty coffee to offices and young companies", 40);
    expect(cut.clamped).toBe(true);
    expect(cut.text.endsWith("…")).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(41);
    expect(cut.text).not.toMatch(/\s…$/);
  });

  it("cuts an Arabic text at a word and never leaves a dangling comma", () => {
    const cut = clampText("منصة توصيل قهوة مختصة للمكاتب والشركات الناشئة في شمال الرياض، مع خدمة الاشتراك الشهري", 40);
    expect(cut.clamped).toBe(true);
    expect(cut.text).toMatch(/…$/);
    expect(cut.text).not.toMatch(/[،,]…$/);
  });

  it("cuts a text with no spaces at the limit", () => {
    expect(clampText("x".repeat(100), 30)).toEqual({ text: `${"x".repeat(30)}…`, clamped: true });
  });

  it("counts the lines a text needs and never less than one", () => {
    expect(linesFor("", 20)).toBe(1);
    expect(linesFor("a".repeat(20), 20)).toBe(1);
    expect(linesFor("a".repeat(21), 20)).toBe(2);
    expect(linesFor("a".repeat(5), 0)).toBe(5);
  });

  it("keeps the items that fit the budget, in order, and says how many it left out", () => {
    const items = ["a", "b", "c", "d"];
    const fit = fitItems(items, { budget: 5, lines: () => 2 });
    expect(fit.shown).toEqual(["a", "b"]);
    expect(fit.hidden).toBe(2);
  });

  it("always keeps the first item, even when it alone passes the budget", () => {
    const fit = fitItems(["only", "second"], { budget: 1, lines: () => 4 });
    expect(fit.shown).toEqual(["only"]);
    expect(fit.hidden).toBe(1);
  });

  it("honours the maximum number of items", () => {
    const fit = fitItems(["a", "b", "c", "d"], { budget: 100, lines: () => 1, max: 3 });
    expect(fit.shown).toEqual(["a", "b", "c"]);
    expect(fit.hidden).toBe(1);
  });

  it("returns nothing for an empty list", () => {
    expect(fitItems([], { budget: 5, lines: () => 1 })).toEqual({ shown: [], hidden: 0 });
  });
});
