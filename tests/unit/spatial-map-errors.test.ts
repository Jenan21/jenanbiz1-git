import { describe, expect, it } from "vitest";
import { toMapReadError } from "@/services/analysis-engines/spatial/adapters/errors";
import { MapReadError, mapReadErrorKinds } from "@/services/analysis-engines/spatial/map-read-error";
import { pgError } from "./support/spatial-fake-pool";

const coded = (code: string, message: string) => Object.assign(new Error(message), { code });

describe("Map read errors", () => {
  it.each([
    ["57014", "canceling statement due to statement timeout", "TIMEOUT"],
    ["55P03", "canceling statement due to lock timeout", "TIMEOUT"],
    ["25P03", "terminating connection due to idle-in-transaction timeout", "TIMEOUT"],
    ["25006", "cannot execute INSERT in a read-only transaction", "READ_ONLY_VIOLATION"],
    ["25001", "transaction read-write mode must be set before any query", "READ_ONLY_VIOLATION"],
    ["42501", "permission denied for table feature", "PERMISSION_DENIED"],
    ["42P01", 'relation "jenan_map.feature" does not exist', "SCHEMA_MISMATCH"],
    ["42703", 'column f.sourceId does not exist', "SCHEMA_MISMATCH"],
    ["3F000", 'schema "jenan_map" does not exist', "SCHEMA_MISMATCH"],
    ["42883", "function st_distance(geography, geography) does not exist", "POSTGIS_MISSING"],
    ["42883", "function postgis_lib_version() does not exist", "POSTGIS_MISSING"],
    ["42704", 'type "geometry" does not exist', "POSTGIS_MISSING"],
    ["22023", "ST_GeomFromGeoJSON: invalid GeoJSON coordinate", "INVALID_GEOMETRY"],
    ["XX000", "invalid GeoJSON representation", "INVALID_GEOMETRY"],
    ["57P01", "terminating connection due to administrator command", "UNREACHABLE"],
    ["57P03", "the database system is starting up", "UNREACHABLE"],
    ["53300", "too many connections for role", "UNREACHABLE"],
    ["28P01", "password authentication failed for user", "UNREACHABLE"],
    ["28000", "no pg_hba.conf entry for host", "UNREACHABLE"],
    ["3D000", 'database "jenan" does not exist', "UNREACHABLE"],
    ["08006", "connection failure", "UNREACHABLE"],
  ] as const)("reads SQLSTATE %s as %s", (code, message, kind) => {
    const error = toMapReadError(coded(code, message));
    expect(error).toBeInstanceOf(MapReadError);
    expect(error.kind).toBe(kind);
    expect(error.sqlState).toBe(code);
  });

  it.each([
    ["ECONNREFUSED", "UNREACHABLE"], ["ENOTFOUND", "UNREACHABLE"], ["EAI_AGAIN", "UNREACHABLE"], ["ECONNRESET", "UNREACHABLE"], ["EPIPE", "UNREACHABLE"],
    ["EHOSTUNREACH", "UNREACHABLE"], ["ETIMEDOUT", "TIMEOUT"],
  ] as const)("reads the socket error %s as %s and never mistakes it for a SQLSTATE", (code, kind) => {
    const error = toMapReadError(coded(code, `connect ${code} 10.0.0.7:5432`));
    expect(error.kind).toBe(kind);
    expect(error.sqlState).toBeNull();
  });

  it("reads the driver's own timeouts and dropped connections, which carry no code", () => {
    expect(toMapReadError(new Error("timeout exceeded when trying to connect")).kind).toBe("TIMEOUT");
    expect(toMapReadError(new Error("Query read timeout")).kind).toBe("TIMEOUT");
    expect(toMapReadError(new Error("Connection terminated due to connection timeout")).kind).toBe("TIMEOUT");
    expect(toMapReadError(new Error("Connection terminated unexpectedly")).kind).toBe("UNREACHABLE");
    expect(toMapReadError(new Error("Client has encountered a connection error and is not queryable")).kind).toBe("UNREACHABLE");
  });

  it("does not guess: other errors, other codes and values that are not errors are UNKNOWN", () => {
    expect(toMapReadError(new Error("something else")).kind).toBe("UNKNOWN");
    expect(toMapReadError(coded("22P02", "invalid input syntax for type uuid")).kind).toBe("UNKNOWN");
    expect(toMapReadError(coded("42883", "function lower(integer) does not exist")).kind).toBe("UNKNOWN");
    expect(toMapReadError(coded("25001", "SET TRANSACTION ISOLATION LEVEL must be called before any query")).kind).toBe("UNKNOWN");
    for (const value of [null, undefined, 42, "text", {}, []]) expect(toMapReadError(value).kind).toBe("UNKNOWN");
  });

  it("returns an error that is already a MapReadError unchanged", () => {
    const own = new MapReadError("SCHEMA_MISMATCH");
    expect(toMapReadError(own)).toBe(own);
  });

  it("shows a caller only the kind: the driver's text stays in the cause", () => {
    const error = toMapReadError(pgError("28P01", "password authentication failed for user jenan_reader at db.internal.example"));
    expect(error.message).toBe("UNREACHABLE");
    expect(String(error)).toBe("MapReadError: UNREACHABLE");
    expect(JSON.stringify({ message: error.message, kind: error.kind, sqlState: error.sqlState })).not.toMatch(/jenan_reader|internal\.example|password/);
    expect((error.cause as Error).message).toContain("db.internal.example");
  });

  it("only produces the documented kinds", () => {
    const samples = [pgError("57014"), pgError("25006"), pgError("42501"), pgError("42P01"), pgError("08006"), new Error("x"), coded("ETIMEDOUT", "x")];
    for (const sample of samples) expect(mapReadErrorKinds).toContain(toMapReadError(sample).kind);
  });
});
