export type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  properties: Record<string, unknown> | null;
  geometry: null | { type: string; coordinates: unknown };
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type GeoJsonComparison =
  | { status: "COMPUTED"; added: number; changed: number; removed: number }
  | { status: "NOT_COMPUTED"; reason: string };

const MAX_FEATURES = 25_000;
const MAX_VERTICES = 250_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function stableJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

function isPosition(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function positions(value: unknown, minimum: number) {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.every(isPosition)
  );
}

function validGeometry(geometry: Record<string, unknown>) {
  const coordinates = geometry.coordinates;
  switch (geometry.type) {
    case "Point":
      return isPosition(coordinates);
    case "MultiPoint":
      return positions(coordinates, 1);
    case "LineString":
      return positions(coordinates, 2);
    case "MultiLineString":
      return Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every((line) => positions(line, 2));
    case "Polygon":
      return (
        Array.isArray(coordinates) &&
        coordinates.length > 0 &&
        coordinates.every(
          (ring) =>
            positions(ring, 4) &&
            stableJson(ring[0]) === stableJson(ring[ring.length - 1]),
        )
      );
    case "MultiPolygon":
      return (
        Array.isArray(coordinates) &&
        coordinates.length > 0 &&
        coordinates.every((polygon) => validGeometry({ type: "Polygon", coordinates: polygon }))
      );
    default:
      return false;
  }
}

export function normalizeGeoJson(input: unknown): { collection: GeoJsonFeatureCollection; json: string } {
  if (!isRecord(input) || input.type !== "FeatureCollection" || !Array.isArray(input.features)) {
    throw new Error("Expected a GeoJSON FeatureCollection.");
  }
  if (input.features.length === 0 || input.features.length > MAX_FEATURES) {
    throw new Error(`Feature count must be between 1 and ${MAX_FEATURES}.`);
  }

  let vertexCount = 0;
  const features = input.features.map((item, index) => {
    if (!isRecord(item) || item.type !== "Feature") {
      throw new Error(`Feature ${index + 1} is invalid.`);
    }
    if (
      item.id !== undefined &&
      typeof item.id !== "string" &&
      !(typeof item.id === "number" && Number.isFinite(item.id))
    ) {
      throw new Error(`Feature ${index + 1} has an invalid id.`);
    }
    if (item.properties !== null && !isRecord(item.properties)) {
      throw new Error(`Feature ${index + 1} properties must be an object or null.`);
    }
    if (item.geometry !== null) {
      if (!isRecord(item.geometry) || !validGeometry(item.geometry)) {
        throw new Error(`Feature ${index + 1} has unsupported or invalid geometry.`);
      }
      const countPositions = (value: unknown): number =>
        isPosition(value)
          ? 1
          : Array.isArray(value)
            ? value.reduce<number>((sum, child) => sum + countPositions(child), 0)
            : 0;
      vertexCount += countPositions(item.geometry.coordinates);
      if (vertexCount > MAX_VERTICES) throw new Error(`Dataset exceeds ${MAX_VERTICES} coordinates.`);
    }

    return item as unknown as GeoJsonFeature;
  });

  const collection: GeoJsonFeatureCollection = { type: "FeatureCollection", features };
  return { collection, json: stableJson(collection) };
}

function featureIdentity(feature: GeoJsonFeature) {
  if (feature.id === undefined) return null;
  return `${typeof feature.id}:${String(feature.id)}`;
}

function keyedFeatures(collection: GeoJsonFeatureCollection) {
  const result = new Map<string, GeoJsonFeature>();
  for (const feature of collection.features) {
    const identity = featureIdentity(feature);
    if (identity === null || result.has(identity)) return null;
    result.set(identity, feature);
  }
  return result;
}

export function compareGeoJson(
  current: GeoJsonFeatureCollection,
  previous: GeoJsonFeatureCollection | null,
): GeoJsonComparison {
  if (!previous) return { status: "NOT_COMPUTED", reason: "No previously published dataset is available." };

  const currentById = keyedFeatures(current);
  const previousById = keyedFeatures(previous);
  if (!currentById || !previousById) {
    return { status: "NOT_COMPUTED", reason: "Every feature needs a unique stable GeoJSON id." };
  }

  let added = 0;
  let changed = 0;
  for (const [id, feature] of currentById) {
    const previousFeature = previousById.get(id);
    if (!previousFeature) added += 1;
    else if (stableJson(feature) !== stableJson(previousFeature)) changed += 1;
  }

  let removed = 0;
  for (const id of previousById.keys()) {
    if (!currentById.has(id)) removed += 1;
  }
  return { status: "COMPUTED", added, changed, removed };
}
