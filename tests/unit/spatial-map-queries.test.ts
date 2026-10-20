import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { QUERIES, type QueryName } from "@/services/analysis-engines/spatial/adapters/queries";
import { MAP_CONTRACT_TABLES, MAP_READ_CONTRACT, MAP_SCHEMA } from "@/services/analysis-engines/spatial/map-contract";

/**
 * The adapter's whole SQL surface is the fixed text in adapters/queries.ts. These tests read that text and prove, statement by statement,
 * that it can only read, only reads what the Map read contract lists, and takes every value as a parameter.
 */
const entries = Object.entries(QUERIES) as Array<[QueryName, string]>;
const adapterDirectory = join(process.cwd(), "services", "analysis-engines", "spatial", "adapters");

const withoutLiterals = (sql: string) => sql.replace(/'(?:[^']|'')*'/g, "''");
const withoutQuotedNames = (sql: string) => withoutLiterals(sql).replace(/"(?:[^"]|"")*"/g, '""');

const expectedParameters: Record<QueryName, number> = {
  postgisPresent: 0, postgisVersions: 0, catalog: 2, role: 2, runtime: 0, release: 1, boundary: 1, layers: 2, geometryChecks: 1, locateCoverage: 2, locateUnits: 4, nearest: 7,
  countFeatures: 6, measureDataset: 6,
};

describe("the adapter's SQL", () => {
  it("is exactly the reviewed set of statements, so a new statement cannot slip in unnoticed", () => {
    expect(Object.keys(QUERIES).sort()).toEqual(Object.keys(expectedParameters).sort());
  });

  it.each(entries)("%s is a single read: it starts with SELECT or WITH and holds one statement", (_name, sql) => {
    expect(sql.trimStart()).toMatch(/^(?:SELECT|WITH)\b/);
    expect(withoutLiterals(sql)).not.toContain(";");
    expect(sql).not.toMatch(/--|\/\*/);
  });

  it.each(entries)("%s cannot write, lock, change a setting, call a procedure, sleep or reach outside the database", (_name, sql) => {
    const bare = withoutQuotedNames(sql);
    expect(bare).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|MERGE|DROP|ALTER|CREATE|GRANT|REVOKE|COPY|LOCK|VACUUM|ANALYZE|REINDEX|CLUSTER|REFRESH|CALL|DO|EXECUTE|PREPARE|DEALLOCATE|LISTEN|NOTIFY|UNLISTEN|COMMIT|ROLLBACK|BEGIN|SAVEPOINT|RELEASE|SET|RESET|INTO|SECURITY|DEFINER|EXPLAIN)\b/i,
    );
    expect(bare).not.toMatch(/\bFOR\s+(?:UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i);
    expect(bare).not.toMatch(/\b(?:nextval|setval|currval|lastval|set_config|pg_sleep|pg_advisory_\w+|pg_terminate_backend|pg_cancel_backend|pg_notify|dblink\w*|lo_\w+|pg_read_\w+|pg_ls_\w+|pg_stat_file|pg_reload_conf|txid_\w+)\s*\(/i);
  });

  it.each(entries)("%s takes every value as a numbered parameter, all of them used, none missing", (name, sql) => {
    const numbers = [...new Set([...withoutLiterals(sql).matchAll(/\$(\d+)/g)].map((match) => Number(match[1])))].sort((first, second) => first - second);
    expect(numbers).toEqual(Array.from({ length: expectedParameters[name] }, (_unused, index) => index + 1));
    expect(sql).not.toMatch(/\$\{/);
  });

  it.each(entries)("%s reads only the Map's contract tables, always schema-qualified, plus the system catalog", (_name, sql) => {
    const bare = withoutLiterals(sql);
    for (const match of bare.matchAll(/"jenan_map"\."([^"]+)"/g)) expect(MAP_CONTRACT_TABLES, `table ${match[1]}`).toContain(match[1]);
    expect(bare).not.toMatch(/\bjenan_map\b(?!")/); // never an unquoted or unqualified reference
    const catalogTables = [...bare.matchAll(/\bpg_catalog\.(\w+)/g)].map((match) => match[1]);
    for (const table of catalogTables) expect(["pg_class", "pg_namespace", "pg_attribute", "pg_roles"], `catalog table ${table}`).toContain(table);
    // Every relation after FROM or JOIN is a Map table, a catalog table, a CTE of the same statement, unnest(...) or a sub-select.
    const ctes = new Set([...bare.matchAll(/(?:\bWITH|,)\s*(\w+)\s+AS\s+(?:MATERIALIZED\s+)?\(/gi)].map((match) => match[1]));
    for (const match of bare.matchAll(/\b(?:FROM|JOIN)\s+((?:"[^"]+"\.)?(?:"[^"]+"|\w+(?:\.\w+)?))/g)) {
      const relation = (match[1] as string).replace(/\s+/g, "");
      const allowed = relation.startsWith('"jenan_map".') || relation.startsWith("pg_catalog.") || ctes.has(relation)
        || ["unnest", "jsonb_array_elements", "LATERAL"].includes(relation);
      expect(allowed, `relation ${relation}`).toBe(true);
    }
  });

  it.each(entries)("%s quotes only identifiers the contract or the statement itself defines", (_name, sql) => {
    const contractColumns = Object.values(MAP_READ_CONTRACT.tables).flatMap((columns) => Object.keys(columns));
    const known = new Set<string>([MAP_SCHEMA, ...MAP_CONTRACT_TABLES, ...contractColumns]);
    const bare = withoutLiterals(sql);
    const collations = [...bare.matchAll(/\bCOLLATE\s+("[^"]*"|\w+)/g)].map((match) => match[1]);
    for (const collation of collations) expect(collation).toBe('"C"'); // the only collation allowed: bytewise, so no ordering depends on the database's locale
    const quoted = bare.replace(/\bCOLLATE\s+"C"/g, "");
    for (const match of bare.matchAll(/\bAS\s+"([^"]+)"/g)) known.add(match[1] as string); // output columns
    for (const match of bare.matchAll(/\bAS\s+\w+\(([^)]*)\)/g)) for (const alias of (match[1] as string).matchAll(/"([^"]+)"/g)) known.add(alias[1] as string);
    for (const match of quoted.matchAll(/"([^"]+)"/g)) expect(known.has(match[1] as string), `identifier "${match[1]}"`).toBe(true);
  });

  it("uses only columns that each Map table really has in the contract", () => {
    const feature = Object.keys(MAP_READ_CONTRACT.tables.feature);
    const boundary = Object.keys(MAP_READ_CONTRACT.tables.boundary);
    for (const column of ["id", "releaseId", "label", "layerId", "sourceId", "geometry"]) expect(feature).toContain(column);
    for (const column of ["id", "releaseId", "authority", "source", "coverage", "geometry"]) expect(boundary).toContain(column);
    expect(Object.keys(MAP_READ_CONTRACT.tables).sort()).toEqual(["boundary", "feature", "release", "release_layer", "runtime"]);
  });

  it("keeps the geodesic and planar conventions: containment on geometry, distances on geography, locale-free orderings", () => {
    expect(QUERIES.nearest).toContain('f."geometry"::geography');
    expect(QUERIES.locateUnits).toContain("ST_Distance(ST_Boundary(");
    expect(QUERIES.locateUnits).toContain('::geography, r."target"::geography');
    expect(QUERIES.locateUnits).toContain('ST_Covers(f."geometry"');
    expect(QUERIES.locateCoverage).toContain('ST_Covers(b."geometry"');
    for (const name of ["catalog", "layers", "locateUnits", "nearest"] as const) expect(QUERIES[name]).toContain('COLLATE "C"');
    // Features at the very same distance are taken in a fixed order, whatever the database's locale: the id compared bytewise, then the rank.
    expect(QUERIES.nearest).toContain('ORDER BY n."distance", n."id" COLLATE "C"');
    expect(QUERIES.nearest).toContain('OVER (ORDER BY m."distance", m."id" COLLATE "C")');
    expect(QUERIES.nearest.trimEnd().endsWith('ORDER BY "part", "rank"')).toBe(true);
  });

  it("does not measure invalid Data Center geometries after the validity check fails", () => {
    expect(QUERIES.measureDataset).toContain("CASE WHEN (SELECT valid FROM validity) THEN");
    expect(QUERIES.measureDataset).toMatch(/CASE WHEN \$6::boolean AND \(SELECT valid FROM validity\) THEN/);
  });
});

describe("the adapter's source", () => {
  const read = (file: string) => readFileSync(join(adapterDirectory, file), "utf8");

  it("sends nothing but the fixed queries: every query(...) call in the reader names one of them", () => {
    const reader = read("postgis-map-reader.ts");
    const calls = [...reader.matchAll(/\bquery\(\s*([^,)\s]+)/g)].map((match) => match[1] as string);
    expect(calls.length).toBeGreaterThanOrEqual(12);
    for (const argument of calls) expect(argument).toMatch(/^QUERIES\.[A-Za-z]+$/);
    expect(reader).not.toMatch(/\b(?:SELECT|INSERT|UPDATE|DELETE|WITH)\s+[\w"*(]/);
  });

  it("builds no SQL anywhere else: queries.ts is the only adapter file holding statements, and it interpolates nothing", () => {
    expect(read("queries.ts")).not.toContain("${");
    for (const file of ["postgis-map-reader.ts", "errors.ts", "index.ts"]) expect(read(file), file).not.toMatch(/\bSELECT\b\s+[\w"*(]/);
    // The only SQL besides the fixed queries is the session's opening batch and ROLLBACK, built from validated numbers and one validated identifier.
    const session = read("read-only-session.ts");
    expect(session).toContain('"ROLLBACK"');
    expect(session).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT)\b/);
  });

  it("exposes no raw-SQL method on the port the engine uses", () => {
    const port = readFileSync(join(adapterDirectory, "..", "map-port.ts"), "utf8");
    expect(port).not.toMatch(/\b(?:sql|query|execute|raw)\s*[(:]/i);
  });
});
