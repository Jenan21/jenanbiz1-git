import { describe, expect, it } from "vitest";
import { initialListingFilters, listingFiltersQuery } from "@/lib/market/listing-filters";

describe("initialListingFilters", () => {
  it("defaults to no filter", () => {
    expect(initialListingFilters({})).toEqual({ country: "", kind: "", query: "" });
  });

  it("reads a supported kind (any case) and a trimmed text query", () => {
    expect(initialListingFilters({ kind: "business", q: "  مطاعم " })).toEqual({
      country: "",
      kind: "BUSINESS",
      query: "مطاعم",
    });
    expect(initialListingFilters({ kind: "PROJECT" }).kind).toBe("PROJECT");
  });

  it("ignores unsupported kinds and uses the first value of repeated parameters", () => {
    expect(initialListingFilters({ kind: "ADMIN" }).kind).toBe("");
    expect(initialListingFilters({ kind: ["", "BUSINESS"] }).kind).toBe("");
    expect(initialListingFilters({ kind: ["business", "project"], q: ["عقارات", "x"] })).toEqual({
      country: "",
      kind: "BUSINESS",
      query: "عقارات",
    });
  });

  it("caps the query length", () => {
    expect(initialListingFilters({ q: "a".repeat(500) }).query).toHaveLength(80);
  });
});

describe("listingFiltersQuery", () => {
  it("is empty without filters and encodes the supported ones", () => {
    expect(listingFiltersQuery({ kind: "", query: "" })).toBe("");
    expect(listingFiltersQuery({ kind: "BUSINESS", query: "" })).toBe("?kind=BUSINESS");
    expect(listingFiltersQuery({ kind: "", query: "مطاعم" })).toBe(`?q=${encodeURIComponent("مطاعم")}`);
    expect(listingFiltersQuery({ kind: "PROJECT", query: "a&b" })).toBe("?kind=PROJECT&q=a%26b");
  });

  it("round-trips through the initial filters", () => {
    const filters = initialListingFilters({ kind: "business", q: "عقارات" });
    const params = new URLSearchParams(listingFiltersQuery(filters));
    expect(initialListingFilters({ kind: params.get("kind") ?? undefined, q: params.get("q") ?? undefined })).toEqual(filters);
  });
});
