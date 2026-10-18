// Jenan PRO Map styles (Light and Dark), original Jenan design drawn on the layers and fields of the Saudi PMTiles archive.
// The style is data: `buildStyle` returns plain MapLibre style JSON that the platform validates like any other artifact.
export const THEMES = ["light", "dark"];
export const SOURCE_LAYERS = ["boundaries", "buildings", "earth", "landcover", "landuse", "places", "pois", "roads", "water"];
export const STYLE_FONTS = { regular: "Noto Sans Regular", medium: "Noto Sans Medium", italic: "Noto Sans Italic" };

const palettes = {
  light: {
    background: "#eef1ec", earth: "#f1f3ee", water: "#a9d3ea", waterLine: "#8fc3e0", waterText: "#2f6f95",
    park: "#cfe6c4", forest: "#bdd9b0", farmland: "#e4ecd2", sand: "#f3e9cf", rock: "#e6e0d6",
    commercial: "#f3dfd6", industrial: "#e4e0ec", institution: "#e9dfef", health: "#f6d7d7", military: "#e7e3da", aero: "#e5e5ea", residential: "#ede9e1",
    building: "#e2ddd3", buildingEdge: "#cfc8bb",
    roadCasing: "#ffffff", path: "#c9b99f", rail: "#a9a39a",
    highway: "#f7b84b", highwayEdge: "#d38a1c", major: "#fbd88a", majorEdge: "#d9b05c", minor: "#ffffff", minorEdge: "#d7d2c7", other: "#f6f4ef",
    boundary: "#7d6a9b", boundaryRegion: "#a799bd",
    text: "#2b3338", textMuted: "#5d6870", halo: "#ffffff", placeText: "#1c2a33", roadText: "#4a5560",
    poi: "#0f8f9d", poiText: "#1d5f67", accent: "#0bb6c4",
  },
  dark: {
    background: "#071420", earth: "#0b1b2a", water: "#0a2d47", waterLine: "#10476b", waterText: "#6fb7dd",
    park: "#103726", forest: "#0e3322", farmland: "#142c26", sand: "#1d2a2e", rock: "#1b2630",
    commercial: "#2a2230", industrial: "#1f2438", institution: "#27223a", health: "#35202a", military: "#1c262a", aero: "#18283a", residential: "#0e2030",
    building: "#13293a", buildingEdge: "#1d3b52",
    roadCasing: "#04101a", path: "#3d5566", rail: "#456070",
    highway: "#dd9a38", highwayEdge: "#5d3f10", major: "#a87625", majorEdge: "#46320f", minor: "#34607f", minorEdge: "#0a1c2a", other: "#264a63",
    boundary: "#8e7cc0", boundaryRegion: "#5f5390",
    text: "#d7e8ef", textMuted: "#91aab6", halo: "#061420", placeText: "#f0fbff", roadText: "#a9c3cf",
    poi: "#19f0f6", poiText: "#9fe9ee", accent: "#19f0f6",
  },
};

const zoomWidth = (...stops) => ["interpolate", ["exponential", 1.4], ["zoom"], ...stops.flat()];
const arabic = ["coalesce", ["get", "name:ar"], ["get", "name"]];
const english = ["coalesce", ["get", "name:en"], ["get", "name"]];
const bilingual = ["case", ["all", ["has", "name:ar"], ["has", "name:en"], ["!=", ["get", "name:ar"], ["get", "name:en"]]],
  ["format", ["get", "name:ar"], {}, "\n", {}, ["get", "name:en"], { "font-scale": 0.8 }], arabic];

/** The label text for one language mode: `ar` (default), `en`, or `bilingual` (Arabic with the English name beneath, where both exist). */
export function labelField(language = "ar", detailed = false) {
  if (language === "en") return english;
  return language === "bilingual" && detailed ? bilingual : arabic;
}

export function buildStyle({ theme = "light", language = "ar", releaseBase, tileFilename }) {
  if (!THEMES.includes(theme)) throw new Error("Unknown theme");
  if (!["ar", "en", "bilingual"].includes(language)) throw new Error("Unknown label language");
  if (!releaseBase || !tileFilename) throw new Error("releaseBase and tileFilename are required");
  const c = palettes[theme];
  const src = "saudi";
  const font = (name) => [STYLE_FONTS[name]];
  const text = (color, halo = c.halo, width = 1.6) => ({ "text-color": color, "text-halo-color": halo, "text-halo-width": width, "text-halo-blur": 0.4 });
  const road = (id, filter, color, width, minzoom = 0, extra = {}) => ({ id, type: "line", source: src, "source-layer": "roads", minzoom, filter,
    layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": color, "line-width": width, ...extra } });
  const kind = (value) => ["==", ["get", "kind"], value];
  const notTunnel = ["!=", ["get", "is_tunnel"], true];
  const isLine = ["==", ["geometry-type"], "LineString"];

  const landFill = (id, kinds, color, minzoom = 0) => ({ id, type: "fill", source: src, "source-layer": "landuse", minzoom,
    filter: ["in", ["get", "kind"], ["literal", kinds]], paint: { "fill-color": color } });

  const layers = [
    { id: "background", type: "background", paint: { "background-color": c.background } },
    { id: "landcover-barren", type: "fill", source: src, "source-layer": "landcover", maxzoom: 8, filter: ["in", ["get", "kind"], ["literal", ["barren", "scrub"]]], paint: { "fill-color": c.sand } },
    { id: "landcover-green", type: "fill", source: src, "source-layer": "landcover", maxzoom: 8, filter: ["in", ["get", "kind"], ["literal", ["forest", "grassland", "farmland"]]], paint: { "fill-color": c.farmland } },
    { id: "earth", type: "fill", source: src, "source-layer": "earth", paint: { "fill-color": c.earth } },
    landFill("landuse-nature", ["park", "garden", "grass", "grassland", "recreation_ground", "pitch", "national_park", "nature_reserve", "greenfield"], c.park, 5),
    landFill("landuse-forest", ["forest", "wood", "scrub", "wetland", "farmland"], c.forest, 6),
    landFill("landuse-sand", ["sand", "bare_rock"], c.sand, 6),
    landFill("landuse-residential", ["residential"], c.residential, 11),
    landFill("landuse-commercial", ["commercial", "retail", "mall"], c.commercial, 10),
    landFill("landuse-industrial", ["industrial", "railway"], c.industrial, 10),
    landFill("landuse-institution", ["school", "university", "college"], c.institution, 12),
    landFill("landuse-health", ["hospital"], c.health, 12),
    landFill("landuse-restricted", ["military", "aerodrome", "airfield", "cemetery", "platform", "pedestrian"], c.military, 10),
    { id: "water", type: "fill", source: src, "source-layer": "water", filter: ["!=", ["get", "kind"], "swimming_pool"], paint: { "fill-color": c.water } },
    { id: "water-river", type: "line", source: src, "source-layer": "water", minzoom: 8, filter: ["all", isLine, kind("river")], paint: { "line-color": c.waterLine, "line-width": zoomWidth([8, 0.6], [14, 2.4], [18, 8]) } },
    { id: "boundaries-region", type: "line", source: src, "source-layer": "boundaries", minzoom: 4, filter: ["in", ["get", "kind"], ["literal", ["region", "county", "map_unit"]]],
      layout: { "line-join": "round" }, paint: { "line-color": c.boundaryRegion, "line-width": zoomWidth([4, 0.6], [10, 1.4]), "line-dasharray": [3, 2.5] } },
    { id: "boundaries-country", type: "line", source: src, "source-layer": "boundaries", filter: ["in", ["get", "kind"], ["literal", ["country", "unrecognized_country"]]],
      layout: { "line-join": "round" }, paint: { "line-color": c.boundary, "line-width": zoomWidth([0, 0.8], [8, 1.6], [14, 2.4]), "line-dasharray": [6, 2] } },

    // Roads: casings first, then the fill of each class from the least to the most important, so highways sit on top.
    road("roads-rail", ["all", kind("rail"), notTunnel], c.rail, zoomWidth([8, 0.5], [16, 2]), 8, { "line-dasharray": [4, 3] }),
    road("roads-path", ["all", kind("path"), ["!=", ["get", "kind_detail"], "steps"]], c.path, zoomWidth([14, 0.4], [18, 1.6]), 14, { "line-dasharray": [2, 1.5] }),
    road("roads-other-casing", ["all", kind("other"), notTunnel], c.minorEdge, zoomWidth([13, 1.4], [18, 12]), 13),
    road("roads-other", ["all", kind("other"), notTunnel], c.other, zoomWidth([13, 0.8], [18, 9]), 13),
    road("roads-minor-casing", ["all", kind("minor_road"), notTunnel], c.minorEdge, zoomWidth([11, 0.8], [14, 3], [18, 17]), 11),
    road("roads-minor", ["all", kind("minor_road"), notTunnel], c.minor, zoomWidth([11, 0.4], [14, 2], [18, 14]), 11),
    road("roads-major-casing", ["all", kind("major_road"), notTunnel], c.majorEdge, zoomWidth([6, 0.8], [10, 2.2], [14, 5], [18, 22]), 6),
    road("roads-major", ["all", kind("major_road"), notTunnel], c.major, zoomWidth([6, 0.5], [10, 1.4], [14, 3.6], [18, 18]), 6),
    road("roads-highway-casing", ["all", kind("highway"), notTunnel], c.highwayEdge, zoomWidth([3, 1], [8, 2.2], [12, 4.6], [14, 7], [18, 28]), 3),
    road("roads-highway", ["all", kind("highway"), notTunnel], c.highway, zoomWidth([3, 0.6], [8, 1.4], [12, 3], [14, 5], [18, 22]), 3),
    road("roads-tunnel", ["all", ["in", ["get", "kind"], ["literal", ["highway", "major_road", "minor_road"]]], ["==", ["get", "is_tunnel"], true]], c.minorEdge, zoomWidth([10, 0.8], [18, 10]), 10, { "line-dasharray": [2, 2] }),
    road("roads-aeroway", ["==", ["get", "kind"], "aeroway"], c.aero, zoomWidth([10, 1], [16, 12]), 10),

    { id: "buildings", type: "fill", source: src, "source-layer": "buildings", minzoom: 14, filter: ["!=", ["get", "kind"], "building_part"],
      paint: { "fill-color": c.building, "fill-outline-color": c.buildingEdge, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15, 0.9] } },

    // Labels: Arabic first, shown progressively so a zoom level never carries every name at once.
    { id: "labels-water", type: "symbol", source: src, "source-layer": "water", minzoom: 3, filter: ["has", "name"],
      layout: { "text-field": labelField(language), "text-font": font("italic"), "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 14, 14], "text-letter-spacing": 0.08, "symbol-sort-key": ["coalesce", ["get", "sort_rank"], 0] },
      paint: text(c.waterText) },
    { id: "labels-roads-highway", type: "symbol", source: src, "source-layer": "roads", minzoom: 9, filter: ["all", kind("highway"), ["has", "name"]],
      layout: { "symbol-placement": "line", "text-field": labelField(language), "text-font": font("medium"), "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 16, 14], "symbol-spacing": 320, "text-max-angle": 30 },
      paint: text(c.roadText, c.halo, 2) },
    { id: "labels-roads-major", type: "symbol", source: src, "source-layer": "roads", minzoom: 12, filter: ["all", kind("major_road"), ["has", "name"]],
      layout: { "symbol-placement": "line", "text-field": labelField(language), "text-font": font("regular"), "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 17, 14], "symbol-spacing": 260, "text-max-angle": 30 },
      paint: text(c.roadText) },
    { id: "labels-roads-minor", type: "symbol", source: src, "source-layer": "roads", minzoom: 14.5, filter: ["all", ["in", ["get", "kind"], ["literal", ["minor_road", "other"]]], ["has", "name"]],
      layout: { "symbol-placement": "line", "text-field": labelField(language), "text-font": font("regular"), "text-size": ["interpolate", ["linear"], ["zoom"], 14.5, 10, 18, 13], "symbol-spacing": 220, "text-max-angle": 30 },
      paint: text(c.textMuted) },

    { id: "pois-dot", type: "circle", source: src, "source-layer": "pois", minzoom: 14,
      filter: ["has", "name"], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2.5, 18, 6], "circle-color": ["match", ["get", "kind"],
        ["hospital", "dentist", "pharmacy"], "#e0525c", ["restaurant", "cafe", "fast_food", "bakery"], "#f08a2e", ["hotel", "hostel", "guest_house"], "#7a5cd6",
        ["school", "college", "university", "library"], "#2f7de1", ["supermarket", "mall", "retail", "electronics"], "#2ba68c", ["bank", "atm"], "#c9a227", c.poi],
        "circle-stroke-color": c.halo, "circle-stroke-width": 1.2 } },
    { id: "labels-pois", type: "symbol", source: src, "source-layer": "pois", minzoom: 15.2, filter: ["has", "name"],
      layout: { "text-field": labelField(language, true), "text-font": font("regular"), "text-size": 11.5, "text-anchor": "top", "text-offset": [0, 0.7], "text-max-width": 8, "symbol-sort-key": ["coalesce", ["get", "min_zoom"], 99] },
      paint: text(c.poiText) },

    { id: "labels-neighbourhood", type: "symbol", source: src, "source-layer": "places", minzoom: 12, filter: ["==", ["get", "kind"], "neighbourhood"],
      layout: { "text-field": labelField(language, true), "text-font": font("regular"), "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10.5, 16, 14], "text-transform": "none", "text-max-width": 7, "symbol-sort-key": ["coalesce", ["get", "sort_key"], 0] },
      paint: text(c.textMuted) },
    { id: "labels-village", type: "symbol", source: src, "source-layer": "places", minzoom: 9, filter: ["all", ["==", ["get", "kind"], "locality"], ["==", ["get", "kind_detail"], "village"]],
      layout: { "text-field": labelField(language), "text-font": font("regular"), "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 14, 13], "text-max-width": 7, "symbol-sort-key": ["coalesce", ["get", "sort_key"], 0] },
      paint: text(c.text) },
    { id: "labels-town", type: "symbol", source: src, "source-layer": "places", minzoom: 7, filter: ["all", ["==", ["get", "kind"], "locality"], ["==", ["get", "kind_detail"], "town"]],
      layout: { "text-field": labelField(language), "text-font": font("medium"), "text-size": ["interpolate", ["linear"], ["zoom"], 7, 11, 13, 15], "text-max-width": 7, "symbol-sort-key": ["coalesce", ["get", "sort_key"], 0] },
      paint: text(c.placeText) },
    { id: "labels-city", type: "symbol", source: src, "source-layer": "places", minzoom: 4, filter: ["all", ["==", ["get", "kind"], "locality"], ["==", ["get", "kind_detail"], "city"]],
      layout: { "text-field": labelField(language, true), "text-font": font("medium"), "text-size": ["interpolate", ["linear"], ["zoom"], 4, 12, 8, 16, 12, 21], "text-max-width": 8, "symbol-sort-key": ["coalesce", ["get", "sort_key"], 0] },
      paint: text(c.placeText, c.halo, 2) },
    { id: "labels-region", type: "symbol", source: src, "source-layer": "places", minzoom: 3, maxzoom: 9, filter: ["==", ["get", "kind"], "region"],
      layout: { "text-field": labelField(language), "text-font": font("medium"), "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 8, 15], "text-letter-spacing": 0.06, "text-max-width": 9 },
      paint: text(c.boundary, c.halo, 1.8) },
    { id: "labels-country", type: "symbol", source: src, "source-layer": "places", maxzoom: 7, filter: ["==", ["get", "kind"], "country"],
      layout: { "text-field": labelField(language), "text-font": font("medium"), "text-size": ["interpolate", ["linear"], ["zoom"], 1, 12, 6, 20], "text-letter-spacing": 0.08, "text-max-width": 8 },
      paint: text(c.placeText, c.halo, 2.2) },
  ];

  return {
    version: 8,
    name: `Jenan PRO Map ${theme === "dark" ? "Dark" : "Light"}`,
    metadata: { "jenan:theme": theme, "jenan:language": language, "jenan:ownership": "JENAN_OWNED", "jenan:note": "Style and design are Jenan-owned; the tile data is OpenStreetMap-derived (ODbL)." },
    glyphs: `${releaseBase}/glyphs/{fontstack}/{range}.pbf`,
    sources: { [src]: { type: "vector", url: `pmtiles://${releaseBase}/pmtiles/${encodeURIComponent(tileFilename)}`, attribution: "© OpenStreetMap contributors" } },
    layers,
  };
}

/** Groups the style's layer ids by the catalog layer they belong to, for release layer bindings. */
export function styleLayerGroups(style) {
  const groups = { base: [], roads: [], places: [], regions: [], buildings: [], pois: [], water: [], landuse: [] };
  for (const { id } of style.layers) {
    if (id === "background" || id === "earth" || id.startsWith("landcover")) groups.base.push(id);
    else if (id.startsWith("roads")) groups.roads.push(id);
    else if (id.startsWith("labels-roads")) groups.roads.push(id);
    else if (id.startsWith("boundaries")) groups.regions.push(id);
    else if (id.startsWith("buildings")) groups.buildings.push(id);
    else if (id.startsWith("pois") || id === "labels-pois") groups.pois.push(id);
    else if (id.startsWith("water") || id === "labels-water") groups.water.push(id);
    else if (id.startsWith("landuse")) groups.landuse.push(id);
    else groups.places.push(id);
  }
  return groups;
}
