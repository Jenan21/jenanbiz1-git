import { MAP_CONTRACT_TABLES, MAP_SCHEMA } from "../map-contract";

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const DATABASE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
/** Base64url-style characters only, so the password can be written as a plain SQL literal without escaping. */
const PASSWORD = /^[A-Za-z0-9_.~-]{16,128}$/;

export interface ReadOnlyRoleOptions {
  /** The login role the Spatial Engine connects as, for example `jenan_spatial_reader`. */
  role: string;
  /** At least 16 characters from A-Z a-z 0-9 _ . ~ - (for example the output of a random base64url generator). */
  password: string;
  database: string;
  statementTimeoutMs?: number;
  /** The schema that holds the PostGIS functions. */
  postgisSchema?: string;
}

/**
 * The statements a database administrator runs once to create the role the engine reads the Map with. The role cannot write by
 * construction: it is not a superuser, owns nothing, its sessions default to read-only with a statement time limit, and it holds
 * SELECT on exactly the five tables of the Map read contract and nothing else. The engine checks this at run time and, in production,
 * refuses to start against a role that can write. The output contains the password; handle it as a secret.
 */
export function buildReadOnlyRoleStatements(options: ReadOnlyRoleOptions): string[] {
  const { role, password, database } = options;
  const statementTimeoutMs = options.statementTimeoutMs ?? 5_000;
  const postgisSchema = options.postgisSchema ?? "public";
  if (!ROLE_NAME.test(role)) throw new RangeError("The role name is a lower-case PostgreSQL identifier of at most 63 characters");
  if (!ROLE_NAME.test(postgisSchema)) throw new RangeError("The PostGIS schema is a lower-case PostgreSQL identifier of at most 63 characters");
  if (!DATABASE_NAME.test(database)) throw new RangeError("The database name is letters, digits and underscores, starting with a letter or underscore");
  if (!PASSWORD.test(password)) throw new RangeError("The password is 16 to 128 characters from A-Z a-z 0-9 _ . ~ -");
  if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 100 || statementTimeoutMs > 60_000) throw new RangeError("The statement time limit is 100 to 60000 ms");

  const tables = MAP_CONTRACT_TABLES.map((table) => `"${MAP_SCHEMA}"."${table}"`).join(", ");
  return [
    `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`,
    `ALTER ROLE "${role}" SET default_transaction_read_only = on`,
    `ALTER ROLE "${role}" SET statement_timeout = ${statementTimeoutMs}`,
    `ALTER ROLE "${role}" SET idle_in_transaction_session_timeout = 10000`,
    `GRANT CONNECT ON DATABASE "${database}" TO "${role}"`,
    `GRANT USAGE ON SCHEMA "${MAP_SCHEMA}" TO "${role}"`,
    `GRANT SELECT ON ${tables} TO "${role}"`,
    `GRANT USAGE ON SCHEMA "${postgisSchema}" TO "${role}"`,
  ];
}
