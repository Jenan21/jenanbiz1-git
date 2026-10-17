import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JenanMapHarness } from "@/features/jenan-map/jenan-map-harness";
import { focusLoopTarget } from "@/features/jenan-map/accessibility";
import {
  assertPinnedRelease,
  controlledMapUrl,
  mapManifestUrl,
  mapRequest,
} from "@/features/jenan-map/api";
import {
  coordinateDraft,
  EARTH_RADIUS_METERS,
  geodesicRing,
  isCoordinate,
  MAP_RADII,
} from "@/features/jenan-map/geometry";
import { toLegacyProjectLocation } from "@/features/jenan-map/project-adapter";

function distance(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

vi.mock("@/features/jenan-map/map-renderer", () => {
  throw new Error("The closed harness must not import the renderer");
});

it("renders an Arabic standalone empty harness without loading the map engine", () => {
  const html = renderToStaticMarkup(createElement(JenanMapHarness));
  expect(html).toContain('dir="rtl"');
  expect(html).toContain("اختيار موقع على الخريطة");
  expect(html).toContain("وليس في سجل مشروع أو قاعدة البيانات");
  expect(html).not.toContain('role="dialog"');
  expect(html).not.toContain("<canvas");
});

describe("modal keyboard focus loop", () => {
  const items = ["close", "search", "cancel"];
  it("wraps forward from the last control and backward from the first", () => {
    expect(focusLoopTarget("cancel", items, false, "dialog")).toBe("close");
    expect(focusLoopTarget("close", items, true, "dialog")).toBe("cancel");
  });
  it("enters the first or last control from the initially focused dialog", () => {
    expect(focusLoopTarget("dialog", items, false, "dialog")).toBe("close");
    expect(focusLoopTarget("dialog", items, true, "dialog")).toBe("cancel");
  });
  it("keeps ordinary tab navigation and safely handles no interactive controls", () => {
    expect(focusLoopTarget("search", items, false, "dialog")).toBeNull();
    expect(focusLoopTarget("search", [], false, "dialog")).toBe("dialog");
  });
});

describe("Jenan PRO map geometry and draft isolation", () => {
  it.each(MAP_RADII)(
    "draws every vertex at the geodesic radius %im",
    (radius) => {
      const ring = geodesicRing(24.7136, 46.6753, radius);
      expect(ring).toHaveLength(97);
      expect(ring[0]).toEqual(ring.at(-1));
      for (const point of ring)
        expect(distance([46.6753, 24.7136], point)).toBeCloseTo(radius, 5);
    },
  );
  it("rejects nonfinite, out of range and degenerate geometry", () => {
    expect(isCoordinate(NaN, 46)).toBe(false);
    expect(isCoordinate(91, 46)).toBe(false);
    expect(isCoordinate(24, -181)).toBe(false);
    expect(() => geodesicRing(24, 46, -1)).toThrow();
    expect(() => geodesicRing(24, 46, 500, 2)).toThrow();
    expect(() => coordinateDraft(100, 46, "map")).toThrow();
  });
  it("clears every address field whenever coordinates are selected", () => {
    const saved = {
      ...coordinateDraft(24, 46, "search"),
      formattedAddress: "عنوان سابق",
      country: "SA",
      region: "الرياض",
      city: "الرياض",
      district: "حي",
    };
    const draft = coordinateDraft(25, 47, "map");
    for (const field of [
      "country",
      "region",
      "city",
      "district",
      "formattedAddress",
    ] as const)
      expect(draft[field]).toBeNull();
    expect(saved.formattedAddress).toBe("عنوان سابق");
    expect(draft.source).toBe("map");
    expect(Number.isFinite(Date.parse(draft.selectedAt))).toBe(true);
  });
  it("only adapts the actual legacy Project countryCode contract without persistence", () => {
    expect(
      toLegacyProjectLocation({
        ...coordinateDraft(24, 46, "map"),
        country: "SA",
      }),
    ).toEqual({ countryCode: "SA" });
    expect(toLegacyProjectLocation(coordinateDraft(24, 46, "map"))).toEqual({});
  });
});

describe("controlled map network", () => {
  const origin = "https://jenanpro.sa";
  it("uses the authenticated admin endpoint for pinned preview manifests", () => {
    expect(mapManifestUrl("release-id")).toBe(
      "/api/admin/jenan-map/preview?releaseId=release-id",
    );
    expect(mapManifestUrl(null)).toBe("/api/jenan-map");
    const artifact = "/api/admin/jenan-map/artifacts/id";
    expect(() => controlledMapUrl(artifact, origin)).toThrow();
    expect(controlledMapUrl(artifact, origin, true)).toBe(origin + artifact);
    expect(() =>
      controlledMapUrl(
        "https://external.test/api/admin/jenan-map/a",
        origin,
        true,
      ),
    ).toThrow();
  });
  it("never silently substitutes the published release for a pinned admin preview", () => {
    expect(() =>
      assertPinnedRelease({ release: { id: "published" } }, "preview"),
    ).toThrow("لم يتم تحميل إصدار بديل");
    expect(() => assertPinnedRelease({ release: null }, "preview")).toThrow();
    expect(() =>
      assertPinnedRelease({ release: { id: "preview" } }, "preview"),
    ).not.toThrow();
    expect(() => assertPinnedRelease({ release: null }, null)).not.toThrow();
  });
  it("surfaces authoritative boundary rejection without accepting the draft", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "OUTSIDE_SAUDI_ARABIA" }), {
          status: 422,
        }),
      ),
    );
    await expect(mapRequest("/api/jenan-map/validate")).rejects.toThrow(
      "خارج الحدود المعتمدة",
    );
  });
  it("preserves self-hosted glyph and PMTiles templates", () => {
    expect(
      controlledMapUrl("/api/jenan-map/glyphs/{fontstack}/{range}.pbf", origin),
    ).toBe(`${origin}/api/jenan-map/glyphs/{fontstack}/{range}.pbf`);
    expect(
      controlledMapUrl(
        `pmtiles://${origin}/api/jenan-map/releases/a/tiles`,
        origin,
      ),
    ).toBe(`pmtiles://${origin}/api/jenan-map/releases/a/tiles`);
  });
  it.each([
    "https://tiles.example.org/style.json",
    "//tiles.example.org/a",
    "data:application/json,{}",
    "/api/projects",
    "/api/jenan-map/../../external",
    "******jenanpro.sa/api/jenan-map/a",
  ])("rejects uncontrolled resource %s", (url) => {
    expect(() => controlledMapUrl(url, origin)).toThrow();
  });
  it("applies a cancellable timeout and returns a truthful timeout error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const pending = mapRequest("/api/jenan-map", {}, 50);
    const rejected = expect(pending).rejects.toThrow("انتهت مهلة الاتصال");
    await vi.advanceTimersByTimeAsync(51);
    await rejected;
  });
  it("forwards external cancellation so superseded searches cannot complete", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const pending = mapRequest("/api/jenan-map/search?q=abc", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
