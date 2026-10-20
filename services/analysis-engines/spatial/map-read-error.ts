/**
 * Failures of the Map read adapter, described in the engine's own terms. A `kind` is all that may travel towards a caller:
 * the driver's native message can name hosts and users and stays in `cause` for server-side diagnostics only.
 */
export const mapReadErrorKinds = [
  "UNREACHABLE", // the database cannot be reached, refuses the connection or rejects the credentials
  "TIMEOUT", // a statement, a lock or the connection ran into its time limit
  "POSTGIS_MISSING", // the PostGIS functions the engine needs are not installed
  "SCHEMA_MISMATCH", // the Map's tables are not what the adapter's contract says
  "PERMISSION_DENIED", // the role may not read something the adapter needs
  "READ_ONLY_VIOLATION", // something tried to write through a read-only session
  "INVALID_GEOMETRY", // PostGIS refused a geometry that came from the request
  "UNKNOWN",
] as const;
export type MapReadErrorKind = typeof mapReadErrorKinds[number];

export class MapReadError extends Error {
  constructor(public readonly kind: MapReadErrorKind, public readonly sqlState: string | null = null, options?: { cause?: unknown }) {
    super(kind, options);
    this.name = "MapReadError";
  }
}
