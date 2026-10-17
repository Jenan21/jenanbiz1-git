// Shared by the offline operator and release validation; no network or database side effects.
export const OPEN_BOUNDARY_NOTICE = "Unofficial boundaries — حدود غير رسمية";
export const OSM_ATTRIBUTION = "© OpenStreetMap contributors (ODbL 1.0)";

export function validateProvenance(value) {
  if (!value || typeof value !== "object") throw new Error("Layer provenance required");
  for (const key of ["source", "organization", "url", "sourceDate", "importedAt", "license", "attribution"]) {
    if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > 2000) throw new Error(`Invalid provenance ${key}`);
  }
  const url = new URL(value.url);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("HTTPS source URL required");
  for (const key of ["sourceDate", "importedAt"]) {
    if (!/^\d{4}-\d{2}-\d{2}T/.test(value[key]) || !Number.isFinite(Date.parse(value[key])) ||
        Date.parse(value[key]) > Date.now()) throw new Error(`Invalid provenance ${key}`);
  }
  if (Date.parse(value.sourceDate) > Date.parse(value.importedAt)) throw new Error("Source date exceeds import date");
  if (!["CC-BY-4.0", "ODbL-1.0", "CC-BY-SA-2.0"].includes(value.license)) throw new Error("Unsupported open-data license");
  return Object.fromEntries(["source", "organization", "url", "sourceDate", "importedAt", "license", "attribution"].map((key) => [key, value[key].trim()]));
}

export function validateCoverage(value) {
  if (value?.countryCode !== "SA" || typeof value.boundaryAuthority !== "string" ||
      value.boundaryAuthority.trim().length < 3 || typeof value.boundarySource !== "string" ||
      value.boundarySource.trim().length < 3) throw new Error("Saudi boundary provenance required");
  if (value.authoritative === true) return value; // Existing reviewed authoritative sources remain supported.
  if (value.authoritative !== false || value.coverageBasis !== "geoBoundaries-ADM0" ||
      value.coverageVerified !== true || value.unofficial !== true ||
      value.notice !== OPEN_BOUNDARY_NOTICE || !/^[a-f0-9]{64}$/.test(value.boundarySha256 ?? "")) {
    throw new Error("Verified unofficial country coverage required");
  }
  const provenance = validateProvenance(value.provenance);
  const url = new URL(provenance.url);
  const githubSource = ["github.com", "raw.githubusercontent.com", "media.githubusercontent.com"].includes(url.hostname);
  if (!["www.geoboundaries.org", "geoboundaries.org", "github.com", "raw.githubusercontent.com", "media.githubusercontent.com"].includes(url.hostname) ||
      !/geoBoundaries.*\bSAU\b.*\bADM0\b/i.test(provenance.source) ||
      !/\/SAU\/ADM0(?:\/|$)/.test(url.pathname) ||
      (githubSource && !/^\/(?:media\/)?wmgeolab\/geoBoundaries\//.test(url.pathname)) ||
      !Array.isArray(value.layers) || !value.layers.length || value.layers.length > 5 ||
      new Set(value.layers.map((layer) => layer.id)).size !== value.layers.length) throw new Error("Reviewed geoBoundaries open coverage required");
  for (const layer of value.layers) {
    if (!["base", "roads", "places", "regions", "governorates"].includes(layer.id)) throw new Error("Unrecognized normalized source layer");
    validateProvenance(layer.provenance);
  }
  return value;
}

export function importedFeature(feature, source, layerId) {
  const properties = feature?.properties ?? {};
  if (properties.visibility === "internal" || properties.internal === true || properties.publicSafe === false) {
    throw new Error("Internal data cannot enter open artifacts");
  }
  const arabic = properties["name:ar"] ?? properties.name_ar;
  const english = properties["name:en"] ?? properties.name_en;
  const label = arabic || properties.name || english || properties.shapeName;
  if (typeof label !== "string" || !label.trim()) return null;
  const aliases = [...new Set([arabic, english, properties.name, properties.shapeName,
    ...String(properties.alt_name ?? "").split(";")].filter((v) => typeof v === "string" && v.trim())
    .map((v) => v.trim()))];
  const sourceId = properties.shapeID ?? properties["@id"] ?? properties.id ?? feature.id;
  if (sourceId === undefined || sourceId === null) throw new Error("Original source identifier required");
  return {
    type: "Feature",
    properties: {
      label: label.trim(), category: layerId, layerId, source,
      sourceId: String(sourceId), aliases,
      ...(typeof arabic === "string" ? { name_ar: arabic } : {}),
      ...(typeof english === "string" ? { name_en: english } : {}),
    },
    geometry: feature.geometry,
  };
}
