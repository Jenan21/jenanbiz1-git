import { describe, expect, it } from "vitest";
import { buildReadOnlyRoleStatements } from "@/services/analysis-engines/spatial/adapters/read-role";
import { MAP_CONTRACT_TABLES } from "@/services/analysis-engines/spatial/map-contract";

const options = { role: "jenan_spatial_reader", password: "Zx9_qT7.rL2~vB4-nM8kP3wY", database: "jenan" };

describe("read-only role statements", () => {
  it("creates a login role that cannot be a superuser, create anything, replicate or bypass row security", () => {
    const [create] = buildReadOnlyRoleStatements(options);
    expect(create).toBe(`CREATE ROLE "jenan_spatial_reader" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD 'Zx9_qT7.rL2~vB4-nM8kP3wY'`);
  });

  it("makes every session of the role read-only by default and time-limited", () => {
    const statements = buildReadOnlyRoleStatements({ ...options, statementTimeoutMs: 2500 });
    expect(statements).toContain('ALTER ROLE "jenan_spatial_reader" SET default_transaction_read_only = on');
    expect(statements).toContain('ALTER ROLE "jenan_spatial_reader" SET statement_timeout = 2500');
    expect(statements).toContain('ALTER ROLE "jenan_spatial_reader" SET idle_in_transaction_session_timeout = 10000');
  });

  it("grants SELECT on exactly the five tables of the read contract, plus connecting and the two schemas, and nothing else", () => {
    const statements = buildReadOnlyRoleStatements({ ...options, postgisSchema: "postgis" });
    expect(statements).toContain('GRANT CONNECT ON DATABASE "jenan" TO "jenan_spatial_reader"');
    expect(statements).toContain('GRANT USAGE ON SCHEMA "jenan_map" TO "jenan_spatial_reader"');
    expect(statements).toContain('GRANT USAGE ON SCHEMA "postgis" TO "jenan_spatial_reader"');
    const select = statements.find((statement) => statement.startsWith("GRANT SELECT"));
    expect(select).toBe(`GRANT SELECT ON ${MAP_CONTRACT_TABLES.map((table) => `"jenan_map"."${table}"`).join(", ")} TO "jenan_spatial_reader"`);
    expect(MAP_CONTRACT_TABLES).toHaveLength(5);
    const grants = statements.filter((statement) => /^GRANT\b/.test(statement));
    expect(grants).toHaveLength(4);
    for (const statement of statements) expect(statement).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALL PRIVILEGES|WITH GRANT OPTION|SUPERUSER|CREATEDB|CREATEROLE|BYPASSRLS|REPLICATION)\b/);
  });

  it("defaults to the public PostGIS schema and a five-second limit", () => {
    const statements = buildReadOnlyRoleStatements(options);
    expect(statements).toContain('GRANT USAGE ON SCHEMA "public" TO "jenan_spatial_reader"');
    expect(statements).toContain('ALTER ROLE "jenan_spatial_reader" SET statement_timeout = 5000');
  });

  it.each([
    [{ role: "Jenan Reader" }], [{ role: "reader; DROP ROLE x" }], [{ role: "" }], [{ role: "r".repeat(64) }], [{ role: "1reader" }],
    [{ database: "jenan; DROP" }], [{ database: "" }], [{ database: "my-db" }],
    [{ password: "short" }], [{ password: "has space in the middle!!" }], [{ password: "quote'inside-the-password" }], [{ password: "a".repeat(129) }], [{ password: "" }],
    [{ postgisSchema: "public; x" }], [{ postgisSchema: "Public" }],
    [{ statementTimeoutMs: 50 }], [{ statementTimeoutMs: 60_001 }], [{ statementTimeoutMs: 1.5 }],
  ])("refuses %j, so nothing a caller supplies can become SQL", (override) => {
    expect(() => buildReadOnlyRoleStatements({ ...options, ...override })).toThrow(RangeError);
  });
});
