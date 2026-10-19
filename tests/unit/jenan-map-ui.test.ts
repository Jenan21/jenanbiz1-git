import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JenanMapHarness } from "@/features/jenan-map/jenan-map-harness";
import {
  loadOwnedMapLocation,
  saveOwnedMapLocation,
} from "@/features/jenan-map/location-api";
import { focusLoopTarget } from "@/features/jenan-map/accessibility";
import {
  assertPinnedRelease,
  controlledMapUrl,
  controlledReleaseMapUrl,
  mapManifestUrl,
  mapRequest,
  mapSearchUrl,
} from "@/features/jenan-map/api";
import {
  cameraMoveFor,
  coordinateDraft,
  EARTH_RADIUS_METERS,
  geodesicRing,
  isCoordinate,
  MAP_RADII,
  ringBounds,
} from "@/features/jenan-map/geometry";
import {
  fromLegacyProjectLocation,
  fromProjectRecord,
  toLegacyProjectLocation,
} from "@/features/jenan-map/project-adapter";

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
  expect(html).toContain("لم يتم تحميل الموقع المحفوظ بعد");
  expect(html).toContain("لا تتغير مواقع المشاريع الحالية");
  expect(html).not.toContain('role="dialog"');
  expect(html).not.toContain("<canvas");
});

describe("owned map location persistence boundary", () => {
  const location = {
    latitude: 24.7136,
    longitude: 46.6753,
    country: "SA",
    region: null,
    city: null,
    district: null,
    formattedAddress: null,
    source: "coordinates",
    selectedAt: "2026-10-01T12:00:00.000Z",
  };
  it("loads the owned saved point without guessing address or refreshing selectedAt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ location }))),
    );
    expect(await loadOwnedMapLocation()).toEqual(location);
    expect(fetch).toHaveBeenCalledWith(
      "/api/jenan-map/location",
      expect.objectContaining({
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
  });
  it("preserves a truthful empty saved location", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ location: null }))),
    );
    expect(await loadOwnedMapLocation()).toBeNull();
  });
  it("sends only coordinates and source, using the server timestamp and fresh address verbatim", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ location }))),
    );
    expect(
      await saveOwnedMapLocation({
        latitude: location.latitude,
        longitude: location.longitude,
        source: "coordinates",
        releaseId: "release-one",
      }),
    ).toEqual(location);
    expect(fetch).toHaveBeenCalledWith(
      "/api/jenan-map/location",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          latitude: location.latitude,
          longitude: location.longitude,
          source: "coordinates",
          releaseId: "release-one",
        }),
      }),
    );
  });
  it.each([
    { ...location, selectedAt: undefined },
    { ...location, source: null },
    { ...location, formattedAddress: undefined },
  ])(
    "does not manufacture missing server selection metadata",
    async (value) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify({ location: value }))),
      );
      await expect(loadOwnedMapLocation()).rejects.toThrow("غير صالحة");
    },
  );
  it("never reports an authoritative rejection as a saved point", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "OUTSIDE_SAUDI_ARABIA" }), {
          status: 422,
        }),
      ),
    );
    await expect(
      saveOwnedMapLocation({
        latitude: 0,
        longitude: 0,
        source: "map",
        releaseId: "release-one",
      }),
    ).rejects.toThrow("خارج الحدود");
  });
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
  it.each(MAP_RADII)("frames the %im ring by its true extent, centred on the point", (radius) => {
    const [[west, south], [east, north]] = ringBounds(24.7136, 46.6753, radius);
    expect(distance([46.6753, 24.7136], [46.6753, north])).toBeCloseTo(radius, 0);
    expect(distance([46.6753, 24.7136], [46.6753, south])).toBeCloseTo(radius, 0);
    expect(east - 46.6753).toBeCloseTo(46.6753 - west, 9);
    expect(east).toBeGreaterThan(west);
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
});

describe("how the camera follows the analysis point and radius", () => {
  const here = { latitude: 24.7136, longitude: 46.6753, radius: 1000 };
  const elsewhere = { latitude: 24.8216, longitude: 46.6633 };
  it.each([
    ["leaves the saved viewport alone on the first pass", undefined, { ...here, source: "search" as const }, "stay"],
    ["stays put while nothing is selected", here, null, "stay"],
    ["frames the ring of the first search result", null, { ...here, source: "search" as const }, "fit"],
    ["only follows the first click", null, { ...here, source: "map" as const }, "center"],
    ["frames the ring of a device location", here, { ...here, ...elsewhere, source: "geolocation" as const }, "fit"],
    ["frames the ring of typed coordinates", here, { ...here, ...elsewhere, source: "coordinates" as const }, "fit"],
    ["frames the ring of a later search result", here, { ...here, ...elsewhere, source: "search" as const }, "fit"],
    ["only follows a click or a dragged marker", here, { ...here, ...elsewhere, source: "map" as const }, "center"],
    ["frames the ring again for a new radius", here, { ...here, radius: 3000, source: "map" as const }, "fit"],
    ["does nothing when only the layers change", here, { ...here, source: "search" as const }, "stay"],
  ])("%s", (_name, previous, next, move) => {
    expect(cameraMoveFor(previous, next)).toBe(move);
  });
});

describe("read-only project integration adapters", () => {
  const input = {
    idea: "A saved project",
    city: "الرياض",
    targetAudience: "BUSINESSES",
    latitude: 24.713612345,
    longitude: 46.675312345,
    placeLabel: "عنوان محفوظ",
  };
  it("restores the exact coordinates and saved label from analysisStudy.input", () => {
    const project = {
      countryCode: "SA",
      analysisStudy: { status: "COMPLETED", input },
    };
    expect(fromProjectRecord(project)).toEqual({
      latitude: input.latitude,
      longitude: input.longitude,
      city: input.city,
      formattedAddress: input.placeLabel,
      country: null,
      region: null,
      district: null,
      source: null,
      selectedAt: null,
    });
    expect(project.analysisStudy.input).toBe(input);
  });
  it("never guesses an address, selection time or country from a coordinate-only legacy record", () => {
    expect(fromLegacyProjectLocation({ latitude: 24, longitude: 46 })).toEqual({
      latitude: 24,
      longitude: 46,
      country: null,
      region: null,
      city: null,
      district: null,
      formattedAddress: null,
      source: null,
      selectedAt: null,
    });
  });
  it("round-trips all explicit selection metadata in a caller-owned sidecar without mutation", () => {
    const selection = {
      ...coordinateDraft(input.latitude, input.longitude, "search"),
      selectedAt: "2026-10-01T12:00:00.000Z",
      country: "SA",
      region: "منطقة الرياض",
      city: input.city,
      district: "حي مسجل",
      formattedAddress: input.placeLabel,
    };
    const output = toLegacyProjectLocation(selection);
    expect(output.analysisInput).toEqual({
      latitude: input.latitude,
      longitude: input.longitude,
      city: input.city,
      placeLabel: input.placeLabel,
    });
    expect(output.launchBasics).toEqual({ city: input.city });
    expect(output.feasibilityGeneral).toEqual({ location: input.placeLabel });
    expect(output.countryCode).toBe("SA");
    expect(
      fromLegacyProjectLocation(output.analysisInput, output.selection),
    ).toEqual(selection);
    expect(output.selection).not.toBe(selection);
    expect(output.missingRequiredFields).toEqual([]);
  });
  it("drops stale metadata if persisted analysis coordinates have changed", () => {
    const old = {
      ...coordinateDraft(25, 47, "search"),
      formattedAddress: "عنوان قديم",
      city: "مدينة قديمة",
    };
    const restored = fromLegacyProjectLocation(input, old);
    expect(restored?.latitude).toBe(input.latitude);
    expect(restored?.formattedAddress).toBe(input.placeLabel);
    expect(restored?.source).toBeNull();
    expect(restored?.selectedAt).toBeNull();
    expect(restored?.region).toBeNull();
  });
  it("clears the old analysis label and requires a known city instead of inventing a city/address", () => {
    const output = toLegacyProjectLocation(coordinateDraft(25, 47, "map"));
    expect(output.analysisInput).toEqual({
      latitude: 25,
      longitude: 47,
      city: "",
      placeLabel: undefined,
    });
    expect({ ...input, ...output.analysisInput }.placeLabel).toBeUndefined();
    expect(output.launchBasics).toEqual({ city: "" });
    expect(output.feasibilityGeneral).toEqual({ location: "" });
    expect(output.missingRequiredFields).toEqual(["city"]);
  });
  it("does not invent coordinates from start city or feasibility location text", () => {
    const project = {
      launchPlan: { sections: { BASICS: { city: "الرياض" } } },
      feasibilityStudy: { sections: { GENERAL: { location: "الرياض" } } },
    };
    expect(fromProjectRecord(project)).toBeNull();
    const explicit = {
      ...coordinateDraft(24.7136, 46.6753, "coordinates"),
      selectedAt: "2026-10-01T12:00:00.000Z",
    };
    expect(fromProjectRecord(project, explicit)).toEqual(explicit);
  });
  it.each([
    { latitude: NaN, longitude: 46 },
    { latitude: 91, longitude: 46 },
    { latitude: 24 },
    { latitude: "24", longitude: "46" },
  ])("rejects incomplete or invalid persisted coordinate pair %o", (point) => {
    expect(fromLegacyProjectLocation(point)).toBeNull();
  });
  it("does not replace absent or invalid metadata with today's time or an inferred source", () => {
    const restored = fromLegacyProjectLocation(input, {
      ...input,
      selectedAt: "not-a-date",
      source: "legacy",
    });
    expect(restored?.selectedAt).toBeNull();
    expect(restored?.source).toBeNull();
  });
});

describe("controlled map network", () => {
  const origin = "https://jenanpro.sa";
  const release = {
    id: "release-one",
    artifacts: [
      {
        id: "tiles-one",
        kind: "pmtiles",
        url: "/api/jenan-map/artifacts/tiles-one",
      },
      {
        id: "style-one",
        kind: "style",
        url: "/api/jenan-map/artifacts/style-one",
      },
    ],
  };
  it("pins published and private-preview searches to their release and visible layer selection", () => {
    const published = new URL(mapSearchUrl(null, release.id, " الرياض ", ["roads", "pois"]), origin);
    expect(published.pathname).toBe("/api/jenan-map/search");
    expect(published.searchParams.get("q")).toBe("الرياض");
    expect(published.searchParams.get("releaseId")).toBe(release.id);
    expect(published.searchParams.get("layerIds")).toBe("roads,pois");
    const preview = new URL(mapSearchUrl(release.id, release.id, "حي", []), origin);
    expect(preview.pathname).toBe("/api/admin/jenan-map/search");
    expect(preview.searchParams.get("layerIds")).toBe("");
  });
  it("pins styles, PMTiles and glyph templates to the selected immutable release", () => {
    expect(
      controlledReleaseMapUrl(release.artifacts[1].url, origin, release),
    ).toBe(origin + release.artifacts[1].url);
    expect(
      controlledReleaseMapUrl(
        "/api/jenan-map/releases/release-one/glyphs/{fontstack}/{range}.pbf",
        origin,
        release,
      ),
    ).toContain("{fontstack}/{range}.pbf");
    expect(() =>
      controlledReleaseMapUrl(
        "/api/jenan-map/releases/release-two/glyphs/{fontstack}/{range}.pbf",
        origin,
        release,
      ),
    ).toThrow("غير مرتبط");
    expect(() =>
      controlledReleaseMapUrl(
        "/api/jenan-map/artifacts/style-two",
        origin,
        release,
      ),
    ).toThrow("غير مرتبط");
    expect(() =>
      controlledReleaseMapUrl("/api/jenan-map/style/current", origin, release),
    ).toThrow("غير مرتبط");
    const preview = {
      id: "preview-one",
      artifacts: [
        {
          id: "preview-style",
          kind: "style",
          url: "/api/admin/jenan-map/artifacts/preview-style",
        },
      ],
    };
    expect(
      controlledReleaseMapUrl(preview.artifacts[0].url, origin, preview, true),
    ).toBe(origin + preview.artifacts[0].url);
    expect(() =>
      controlledReleaseMapUrl(
        "/api/admin/jenan-map/releases/another/glyphs/font/0-255.pbf",
        origin,
        preview,
        true,
      ),
    ).toThrow();
  });
  it("preserves PMTiles protocol source and tile URLs through MapLibre's transform hook", async () => {
    const { PMTiles, Protocol } = await import("pmtiles");
    const base = origin + release.artifacts[0].url;
    const archive = new PMTiles(base);
    vi.spyOn(archive, "getHeader").mockResolvedValue({
      minLon: 34,
      maxLon: 56,
      minLat: 16,
      maxLat: 33,
      minZoom: 0,
      maxZoom: 14,
    } as Awaited<ReturnType<typeof archive.getHeader>>);
    const getTile = vi
      .spyOn(archive, "getZxy")
      .mockResolvedValue({ data: new ArrayBuffer(4) });
    const protocol = new Protocol();
    protocol.add(archive);
    const sourceUrl = controlledReleaseMapUrl(
      `pmtiles://${base}`,
      origin,
      release,
    );
    const tileJSON = await protocol.tilev4(
      { url: sourceUrl, type: "json" },
      new AbortController(),
    );
    expect(tileJSON.data).toMatchObject({
      tiles: [`${sourceUrl}/{z}/{x}/{y}`],
    });
    const tileUrl = controlledReleaseMapUrl(
      `${sourceUrl}/12/3200/1700`,
      origin,
      release,
    );
    const tile = await protocol.tilev4(
      { url: tileUrl, type: "arrayBuffer" },
      new AbortController(),
    );
    expect(getTile).toHaveBeenCalledWith(
      12,
      3200,
      1700,
      expect.any(AbortSignal),
    );
    expect(tile.data).toEqual(new Uint8Array(4));
  });
  it("resolves the same immutable style's public references through the private preview manifest", () => {
    const preview = {
      ...release,
      artifacts: release.artifacts.map((artifact) => ({
        ...artifact, url: artifact.url.replace("/api/", "/api/admin/"),
      })),
    };
    expect(controlledReleaseMapUrl(release.artifacts[1].url, origin, preview, true))
      .toBe(`${origin}/api/admin/jenan-map/artifacts/style-one`);
    expect(controlledReleaseMapUrl(`pmtiles://${origin}${release.artifacts[0].url}/{z}/{x}/{y}`, origin, preview, true))
      .toBe(`pmtiles://${origin}/api/admin/jenan-map/artifacts/tiles-one/{z}/{x}/{y}`);
    expect(controlledReleaseMapUrl("/api/jenan-map/releases/release-one/glyphs/font/0-255.pbf", origin, preview, true))
      .toBe(`${origin}/api/admin/jenan-map/releases/release-one/glyphs/font/0-255.pbf`);
    expect(() => controlledReleaseMapUrl("/api/jenan-map/artifacts/tiles-other", origin, preview, true)).toThrow();
    expect(() => controlledReleaseMapUrl(`${release.artifacts[1].url}/arbitrary`, origin, release)).toThrow();
  });
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
