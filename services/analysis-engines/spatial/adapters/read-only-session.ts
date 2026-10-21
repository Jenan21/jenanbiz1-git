import { Pool } from "pg";
import { z } from "zod";
import { MapReadError } from "../map-read-error";
import { toMapReadError } from "./errors";

const identifier = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/, "A lower-case PostgreSQL identifier");

/**
 * How the adapter connects. Every value has a bound, so a misconfiguration cannot remove the time limits that keep a spatial query from
 * holding a connection. The connection string is a secret: it is never logged and never copied into an error.
 */
export const readOnlySessionConfigSchema = z.object({
  connectionString: z.string().min(1).max(2048),
  /** Where the computation runs: the application's own database, or a dedicated read-only connection (the default). Reported with every result. */
  placement: z.enum(["APP_DATABASE", "DEDICATED_CONNECTION"]).default("DEDICATED_CONNECTION"),
  statementTimeoutMs: z.number().int().min(100).max(60_000).default(5_000),
  lockTimeoutMs: z.number().int().min(100).max(10_000).default(1_000),
  idleInTransactionTimeoutMs: z.number().int().min(1_000).max(60_000).default(10_000),
  connectionTimeoutMs: z.number().int().min(100).max(30_000).default(3_000),
  poolMax: z.number().int().min(1).max(20).default(4),
  idleTimeoutMs: z.number().int().min(1_000).max(600_000).default(30_000),
  /** The schema that holds the PostGIS functions; the session resolves unqualified names against pg_catalog and this schema only. */
  postgisSchema: identifier.default("public"),
  applicationName: z.string().regex(/^[A-Za-z0-9_.:-]{1,63}$/).default("jenan-spatial-engine"),
}).strict();
export type ReadOnlySessionConfig = z.input<typeof readOnlySessionConfigSchema>;
export type ResolvedSessionConfig = z.output<typeof readOnlySessionConfigSchema>;

export type ReadOnlyQuery = <Row extends object = Record<string, unknown>>(sql: string, parameters?: readonly unknown[]) => Promise<Row[]>;

/** The two members of a connection pool the session uses; a test can stand in for a real pool. */
export interface SessionClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  /** `destroy` closes the connection instead of returning it to the pool. */
  release(destroy?: boolean): void;
}
export interface SessionPool {
  connect(): Promise<SessionClient>;
  end(): Promise<void>;
}

/**
 * One snapshot of the database, read-only and time-limited. The first statement is a single simple-query batch: it opens a
 * REPEATABLE READ READ ONLY transaction (so the several queries of one call see one consistent state), sets the time limits and the
 * search path for that transaction only, and runs SELECT 1 so the snapshot exists, after which the transaction can no longer be switched
 * to read-write. The values are validated integers and a validated identifier, never caller text.
 */
export function buildOpeningBatch(config: ResolvedSessionConfig): string {
  return [
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    `SET LOCAL statement_timeout = ${config.statementTimeoutMs}`,
    `SET LOCAL lock_timeout = ${config.lockTimeoutMs}`,
    `SET LOCAL idle_in_transaction_session_timeout = ${config.idleInTransactionTimeoutMs}`,
    `SET LOCAL search_path = pg_catalog, "${config.postgisSchema}"`,
    "SELECT 1",
  ].join("; ");
}

const hasSqlState = (error: unknown) => typeof error === "object" && error !== null && /^(?=.*[0-9])[0-9A-Z]{5}$/.test(String((error as { code?: unknown }).code ?? ""));

export class ReadOnlySession {
  private closed = false;
  private readonly openingBatch: string;

  constructor(readonly config: ResolvedSessionConfig, private readonly pool: SessionPool) {
    this.openingBatch = buildOpeningBatch(config);
  }

  /**
   * Runs `work` inside one read-only snapshot and always rolls it back. Whatever goes wrong comes out as a MapReadError. A connection whose
   * state is uncertain (the driver failed, not the server) is destroyed rather than returned to the pool.
   */
  async run<T>(work: (query: ReadOnlyQuery) => Promise<T>): Promise<T> {
    if (this.closed) throw new MapReadError("UNKNOWN");
    let client: SessionClient;
    try {
      client = await this.pool.connect();
    } catch (error) {
      throw toMapReadError(error);
    }
    let destroy = false;
    const execute = async (text: string, values?: readonly unknown[]) => {
      try {
        return (await client.query(text, values === undefined ? undefined : [...values])).rows;
      } catch (error) {
        if (!hasSqlState(error)) destroy = true;
        throw error;
      }
    };
    try {
      await execute(this.openingBatch);
      return await work(async <Row extends object>(sql: string, parameters?: readonly unknown[]) => (await execute(sql, parameters)) as Row[]);
    } catch (error) {
      throw toMapReadError(error);
    } finally {
      try {
        await execute("ROLLBACK");
      } catch {
        destroy = true;
      }
      client.release(destroy);
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.pool.end();
  }
}

function createPgPool(config: ResolvedSessionConfig): SessionPool {
  const pool = new Pool({
    connectionString: config.connectionString,
    max: config.poolMax,
    idleTimeoutMillis: config.idleTimeoutMs,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    application_name: config.applicationName,
    // A client-side backstop for a connection that stalls; the server enforces statement_timeout and lock_timeout itself.
    query_timeout: config.statementTimeoutMs + config.lockTimeoutMs + 2_000,
  });
  // An idle client that loses its connection emits "error"; without a listener that would end the process.
  pool.on("error", () => undefined);
  return {
    connect: async () => {
      const client = await pool.connect();
      return { query: (text, values) => client.query(text, values), release: (destroy) => client.release(destroy) };
    },
    end: () => pool.end(),
  };
}

/** Validates the configuration (naming only the offending fields, never their values) and opens a session over a new pool, or over `pool` when given. */
export function openReadOnlySession(input: ReadOnlySessionConfig, pool?: SessionPool): ReadOnlySession {
  const parsed = readOnlySessionConfigSchema.safeParse(input);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "(configuration)"))].join(", ");
    throw new RangeError(`Invalid Map reader configuration: ${fields}`);
  }
  return new ReadOnlySession(parsed.data, pool ?? createPgPool(parsed.data));
}
