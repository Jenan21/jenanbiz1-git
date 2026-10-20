/**
 * The shape of saved map preferences, checked without a schema library.
 *
 * Browser code reads saved preferences with this instead of `mapPreferencesSchema`: importing the schema would put zod into the
 * map's bundle, and zod 4 probes for script evaluation (`new Function`) when it builds a schema, which the production content
 * security policy reports as a violation on every page that loads it. The server keeps the schema as the authority;
 * `tests/unit/jenan-map-preferences.test.ts` holds both to the same answers.
 */
export const MAP_PREFERENCE_RADII = [500, 1000, 3000, 5000] as const;

export interface MapPreferencesPayload {
  releaseId: string;
  radius: (typeof MAP_PREFERENCE_RADII)[number];
  visibleLayers: string[];
  viewport: { latitude: number; longitude: number; zoom: number } | null;
  expectedRevision: number;
}

const UUID = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
const LAYER_ID = /^[a-z][a-z-]{0,63}$/;
const MAX_LAYERS = 64;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function between(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function viewportOf(value: unknown): MapPreferencesPayload["viewport"] | undefined {
  if (value === null) return null;
  if (!record(value) || !onlyKeys(value, ["latitude", "longitude", "zoom"])) return undefined;
  const { latitude, longitude, zoom } = value;
  if (!between(latitude, 16, 33) || !between(longitude, 34, 56.5) || !between(zoom, 3, 18)) return undefined;
  return { latitude, longitude, zoom };
}

/** Returns the settings when they are exactly what the server accepts, otherwise `null`. */
export function parseMapPreferences(value: unknown): MapPreferencesPayload | null {
  if (!record(value) || !onlyKeys(value, ["releaseId", "radius", "visibleLayers", "viewport", "expectedRevision"])) return null;
  const { releaseId, radius, visibleLayers, expectedRevision } = value;
  if (typeof releaseId !== "string" || !UUID.test(releaseId)) return null;
  if (!MAP_PREFERENCE_RADII.some((allowed) => allowed === radius)) return null;
  if (!Array.isArray(visibleLayers) || visibleLayers.length > MAX_LAYERS) return null;
  if (!visibleLayers.every((id) => typeof id === "string" && LAYER_ID.test(id)) || new Set(visibleLayers).size !== visibleLayers.length) return null;
  if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return null;
  const viewport = viewportOf(value.viewport);
  if (viewport === undefined) return null;
  return { releaseId, radius: radius as MapPreferencesPayload["radius"], visibleLayers: visibleLayers as string[], viewport, expectedRevision };
}
