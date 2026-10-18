import type { ProjectAnalysisInput } from "@/services/projects/project-analysis";
import { isCoordinate } from "./geometry";
import type { JenanLocation, LocationSource } from "./types";

type AnalysisLocationInput = Pick<
  ProjectAnalysisInput,
  "latitude" | "longitude" | "city" | "placeLabel"
>;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function explicitSelection(value: unknown): JenanLocation | null {
  const saved = record(value);
  if (
    !saved ||
    typeof saved.latitude !== "number" ||
    typeof saved.longitude !== "number" ||
    !isCoordinate(saved.latitude, saved.longitude)
  )
    return null;
  return {
    latitude: saved.latitude,
    longitude: saved.longitude,
    country: text(saved.country),
    region: text(saved.region),
    city: text(saved.city),
    district: text(saved.district),
    formattedAddress: text(saved.formattedAddress),
    source: ["map", "search", "geolocation", "coordinates"].includes(
      String(saved.source),
    )
      ? (saved.source as LocationSource)
      : null,
    selectedAt:
      typeof saved.selectedAt === "string" &&
      Number.isFinite(Date.parse(saved.selectedAt))
        ? saved.selectedAt
        : null,
  };
}

/**
 * Analysis persists numeric coordinates and placeLabel in analysisStudy.input.
 * Start BASICS supports city only; feasibility GENERAL supports location text only.
 * selection is a caller-owned sidecar: existing API schemas strip this metadata.
 * These pure adapters neither submit requests nor imply new persistence support.
 */
export function toLegacyProjectLocation(location: JenanLocation) {
  if (!isCoordinate(location.latitude, location.longitude))
    throw new Error("Invalid coordinates");
  const analysisInput: AnalysisLocationInput = {
    latitude: location.latitude,
    longitude: location.longitude,
    city: location.city ?? "",
    placeLabel: location.formattedAddress ?? undefined,
  };
  return {
    countryCode: location.country === "SA" ? "SA" : undefined,
    analysisInput,
    launchBasics: { city: location.city ?? "" },
    feasibilityGeneral: {
      location: location.formattedAddress ?? location.city ?? "",
    },
    selection: { ...location },
    missingRequiredFields: location.city ? [] : ["city"],
  };
}

export function fromLegacyProjectLocation(
  input: unknown,
  selection?: unknown,
): JenanLocation | null {
  const legacy = record(input);
  const metadata = explicitSelection(selection);
  const latitude = legacy?.latitude;
  const longitude = legacy?.longitude;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !isCoordinate(latitude, longitude)
  ) {
    return metadata;
  }
  // Never attach an old address, source or timestamp to a different saved point.
  if (metadata?.latitude === latitude && metadata.longitude === longitude)
    return metadata;
  return {
    latitude,
    longitude,
    country: null,
    region: null,
    district: null,
    city: text(legacy?.city),
    formattedAddress: text(legacy?.placeLabel),
    source: null,
    selectedAt: null,
  };
}

export function fromProjectRecord(
  project: unknown,
  selection?: unknown,
): JenanLocation | null {
  const saved = record(project);
  return fromLegacyProjectLocation(
    record(saved?.analysisStudy)?.input,
    selection,
  );
}
