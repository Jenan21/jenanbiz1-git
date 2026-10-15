import { describe, expect, it } from "vitest";
import { normalizeSearchText, SEARCH_INDEX, searchPages } from "@/lib/navigation/home-search";

describe("home search", () => {
  it("folds the spellings Arabic readers use interchangeably", () => {
    expect(normalizeSearchText("أدوات")).toBe(normalizeSearchText("ادوات"));
    expect(normalizeSearchText("المكتبة")).toBe(normalizeSearchText("المكتبه"));
    expect(normalizeSearchText("  Project   Analysis ")).toBe("project analysis");
  });

  it("finds a page by its Arabic or English name and puts the section first", () => {
    expect(searchPages("المشاريع", "ar")[0]?.path).toBe("/projects");
    expect(searchPages("project analysis", "en")[0]?.path).toBe("/projects/analysis");
    expect(searchPages("تحليل", "ar").map((entry) => entry.path)).toContain("/projects/analysis");
    expect(searchPages("academy", "en")[0]?.path).toBe("/academy");
  });

  it("matches every word typed, in any order, and by section name", () => {
    expect(searchPages("pdf merge", "en").map((entry) => entry.path)).toContain("/software/files/merge-pdf");
    const inAcademy = searchPages("الاكاديميه الدورات", "ar");
    expect(inAcademy.map((entry) => entry.path)).toContain("/academy/courses");
  });

  it("returns nothing for an empty or unmatched query and never more than the limit", () => {
    expect(searchPages("", "ar")).toEqual([]);
    expect(searchPages("   ", "en")).toEqual([]);
    expect(searchPages("zzzzqqqq", "en")).toEqual([]);
    expect(searchPages("pdf", "en", 3).length).toBeLessThanOrEqual(3);
  });

  it("reaches the member's own pages, and exposes no funding or admin page", () => {
    expect(searchPages("بياناتي الاستثمارية", "ar")[0]?.path).toBe("/user/investments");
    expect(searchPages("account settings", "en")[0]?.path).toBe("/account");
    for (const entry of SEARCH_INDEX) {
      expect(entry.path).not.toMatch(/^\/admin/);
      expect(entry.path).not.toMatch(/funding/i);
    }
  });

  it("lists every page once", () => {
    const paths = SEARCH_INDEX.map((entry) => entry.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.length).toBeGreaterThan(40);
  });
});
