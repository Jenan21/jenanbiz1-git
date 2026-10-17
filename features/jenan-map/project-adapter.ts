import type { JenanLocation } from "./types";

/**
 * Project currently accepts countryCode, not a persisted coordinate/address object.
 * This opt-in adapter is not wired to project writes and intentionally drops no
 * coordinates into unrelated fields such as description or intelligence snapshots.
 */
export function toLegacyProjectLocation(location: JenanLocation): {
  countryCode?: string;
} {
  return location.country === "SA" ? { countryCode: "SA" } : {};
}
