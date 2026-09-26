import { describe, expect, it } from "vitest";
import manifest from "../../design-references/Jenan-PRO/extracted/Jenan_PRO_COMPLETE_PLATFORM_UI_BLUEPRINT/Jenan_PRO_COMPLETE_PLATFORM_UI_BLUEPRINT/03_PAGE_SPECS/route_manifest.json";
import { findMarketFlow, marketFlowDefinitions } from "@/lib/market/market-flow-routes";

describe("market route contract", () => {
  it("matches every Market child route in the authoritative blueprint", () => {
    const expected = manifest.map((item) => item.route).filter((route) => route.startsWith("/market/")).sort();
    expect(marketFlowDefinitions.map((item) => item.route).sort()).toEqual(expected);
  });

  it("keeps routes unique and rejects unknown paths", () => {
    expect(new Set(marketFlowDefinitions.map((item) => item.route)).size).toBe(marketFlowDefinitions.length);
    expect(findMarketFlow("/market/nda/sample")?.kind).toBe("form");
    expect(findMarketFlow("/market/not-real")).toBeUndefined();
  });
});