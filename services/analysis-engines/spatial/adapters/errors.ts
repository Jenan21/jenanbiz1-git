import { MapReadError, type MapReadErrorKind } from "../map-read-error";

/**
 * Translates what the database driver throws into the engine's own failure kinds. The driver's message can name hosts, users and
 * relations, so it never leaves this module except as `cause`; callers see only a kind and, when there is one, a five-character SQLSTATE.
 */
const SQLSTATE = /^(?=.*[0-9])[0-9A-Z]{5}$/; // a digit is required so that a socket code such as EPIPE is not mistaken for a SQLSTATE
const POSTGIS_NAME = /\b(?:st_\w+|postgis\w*|geometry|geography|box2d|box3d)\b/i;
const UNREACHABLE_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "EPIPE", "EHOSTUNREACH", "ENETUNREACH", "ENETDOWN", "ECONNABORTED"]);

const stringProperty = (error: unknown, name: "code" | "message"): string => {
  const value = typeof error === "object" && error !== null ? (error as Record<string, unknown>)[name] : undefined;
  return typeof value === "string" ? value : "";
};

function kindFromSqlState(code: string, message: string): MapReadErrorKind | null {
  switch (code) {
    case "57014": // query_canceled: statement_timeout
    case "55P03": // lock_not_available: lock_timeout
    case "25P03": // idle_in_transaction_session_timeout
      return "TIMEOUT";
    case "25006": // read_only_sql_transaction
      return "READ_ONLY_VIOLATION";
    case "25001": // a read-only transaction asked to become read-write after its snapshot
      return /read-write/i.test(message) ? "READ_ONLY_VIOLATION" : null;
    case "42501":
      return "PERMISSION_DENIED";
    case "42P01":
    case "42703":
    case "3F000":
      return "SCHEMA_MISMATCH";
    case "42883":
    case "42704":
      return POSTGIS_NAME.test(message) ? "POSTGIS_MISSING" : null;
    case "22023":
      return POSTGIS_NAME.test(message) || /geojson|coordinate/i.test(message) ? "INVALID_GEOMETRY" : null;
    case "XX000":
      return /geojson/i.test(message) ? "INVALID_GEOMETRY" : null;
    case "57P01":
    case "57P02":
    case "57P03":
    case "53300":
      return "UNREACHABLE";
    default:
      return code.startsWith("08") || code.startsWith("28") ? "UNREACHABLE" : null;
  }
}

export function toMapReadError(error: unknown): MapReadError {
  if (error instanceof MapReadError) return error;
  const code = stringProperty(error, "code");
  const message = stringProperty(error, "message");
  const sqlState = SQLSTATE.test(code) ? code : null;
  const failed = (kind: MapReadErrorKind) => new MapReadError(kind, sqlState, { cause: error });

  const fromState = sqlState === null ? null : kindFromSqlState(sqlState, message);
  if (fromState !== null) return failed(fromState);
  if (code === "ETIMEDOUT") return failed("TIMEOUT");
  if (UNREACHABLE_CODES.has(code)) return failed("UNREACHABLE");
  // node-postgres reports its own timeouts and dropped connections as plain errors without a code.
  if (/timeout|timed out/i.test(message)) return failed("TIMEOUT");
  if (/connection terminated|connection error|not queryable|connection ended|econnrefused|econnreset/i.test(message)) return failed("UNREACHABLE");
  return failed("UNKNOWN");
}
