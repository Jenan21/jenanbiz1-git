/**
 * The PostGIS adapter of the Spatial Engine. It is the only part of the engine that talks to a database, and the only part that imports
 * `pg`. It is deliberately not re-exported by the engine's own index, so the pure core stays free of drivers.
 */
export { PostgisMapReader } from "./postgis-map-reader";
export { buildOpeningBatch, openReadOnlySession, ReadOnlySession, readOnlySessionConfigSchema, type ReadOnlyQuery, type ReadOnlySessionConfig, type ResolvedSessionConfig, type SessionClient, type SessionPool } from "./read-only-session";
export { buildReadOnlyRoleStatements, type ReadOnlyRoleOptions } from "./read-role";
export { toMapReadError } from "./errors";
export { QUERIES, type QueryName } from "./queries";
