import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The analysis engines are pure: they never read a database, a network, the clock or the environment on their own. Everything outside
 * their own tree reaches them through a contract or an injected port. Explicitly allowlisted adapters alone reach outside the tree:
 * the PostGIS reader imports `pg`; each engine's Data Center provider imports only its governed read services, never a database.
 * This guard allows nothing beyond the exact capabilities listed below, including the existing M5 persistence exceptions.
 */
const root = join(process.cwd(), "services", "analysis-engines");
const listFiles = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? listFiles(path) : path.endsWith(".ts") ? [path] : [];
});
const sources = listFiles(root).map((file) => ({ file, path: relative(root, file).split(sep).join("/"), text: readFileSync(file, "utf8") }));
const isAdapter = (path: string) => path.split("/").includes("adapters");

const allowedPackages = new Set(["zod", "node:crypto"]);
// The Data Center's pure vocabulary and its pure Map contract: no database, no network. Everything else of the Data Center reaches the engine only through an adapter.
const allowedAbsolute = new Set(["@/services/data-center/contracts", "@/services/data-center/map-contract"]);
const specifiersOf = (text: string) => [...text.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+["']([^"']+)["']/gm)].map((match) => match[1] as string);

describe("analysis engine boundaries", () => {
  it("has the shared core and the Spatial Engine", () => {
    expect(sources.some((source) => source.path.startsWith("shared/"))).toBe(true);
    expect(sources.some((source) => source.path.startsWith("spatial/"))).toBe(true);
    expect(sources.length).toBeGreaterThan(15);
  });

  it("imports only zod, node:crypto, the pure Data Center vocabulary and its own tree", () => {
    for (const source of sources.filter((entry) => !isAdapter(entry.path))) {
      for (const specifier of specifiersOf(source.text)) {
        if (specifier.startsWith(".")) {
          expect(resolve(dirname(source.file), specifier).startsWith(root), `${source.path} imports ${specifier}`).toBe(true);
        } else {
          expect(allowedPackages.has(specifier) || allowedAbsolute.has(specifier), `${source.path} imports ${specifier}`).toBe(true);
        }
      }
    }
  });

  it("never reaches the database, Prisma, Projects, the Map, the UI or the framework", () => {
    const forbidden = /(?:@\/lib\/db|@\/generated|@prisma|"pg"|"next|@\/app\/|@\/components\/|@\/services\/(?:projects|jenan-map|market|intelligence)|@\/lib\/projects)/;
    for (const source of sources.filter((entry) => !isAdapter(entry.path))) expect(specifiersOf(source.text).filter((specifier) => forbidden.test(`"${specifier}"`)), source.path).toEqual([]);
  });

  it("does not import dynamically or use require", () => {
    for (const source of sources) {
      expect(source.text, source.path).not.toMatch(/\brequire\s*\(/);
      expect(source.text, source.path).not.toMatch(/\bimport\s*\(/);
    }
  });

  it("does not use the network, the environment, randomness, a hidden clock, logging or dynamic code", () => {
    const clockAllowed = new Set(["spatial/normalize.ts"]);
    for (const source of sources) {
      expect(source.text, `${source.path} fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source.text, `${source.path} XMLHttpRequest`).not.toMatch(/XMLHttpRequest/);
      expect(source.text, `${source.path} process.env`).not.toMatch(/process\.env/);
      expect(source.text, `${source.path} Math.random`).not.toMatch(/Math\.random\s*\(/);
      expect(source.text, `${source.path} Date.now`).not.toMatch(/Date\.now\s*\(/);
      expect(source.text, `${source.path} performance.now`).not.toMatch(/performance\.now\s*\(/);
      expect(source.text, `${source.path} console`).not.toMatch(/\bconsole\./);
      expect(source.text, `${source.path} eval`).not.toMatch(/\beval\s*\(|new Function\s*\(/);
      if (!clockAllowed.has(source.path)) expect(source.text, `${source.path} new Date()`).not.toMatch(/new Date\(\s*\)/);
    }
  });

  it("holds no SQL and no database client outside an adapter", () => {
    for (const source of sources.filter((entry) => !isAdapter(entry.path))) {
      expect(source.text, source.path).not.toMatch(/\$queryRaw|\$executeRaw|PrismaClient|\bSELECT\s+\w+\s+FROM\b|\bST_[A-Z]\w+\s*\(/);
    }
  });

  it("keeps the product rules: no funding, no legacy product name", () => {
    for (const source of sources) {
      expect(source.text, source.path).not.toMatch(/funding/i);
      expect(source.text, source.path).not.toMatch(/Jenan BIZ|جنان بيز/i);
    }
  });

  it("keeps the hidden clock to the one place that defaults it", () => {
    const withClock = sources.filter((source) => /new Date\(\s*\)/.test(source.text)).map((source) => source.path);
    expect(withClock).toEqual(["spatial/normalize.ts"]);
  });

  describe("adapters", () => {
    const dataCenterProviderPath = "spatial/adapters/data-center-provider.ts";
    const marketProviderPath = "market-demand/adapters/data-center-provider.ts";
    const marketHistoryAdapters = new Set([
      "market-demand/adapters/run-persistence.ts", "market-demand/adapters/run-service.ts",
      "market-demand/adapters/replay-service.ts", "market-demand/adapters/historical-data-center.ts",
    ]);
    const m5Adapters = new Set([
      "spatial/adapters/run-persistence.ts",
      "spatial/adapters/run-service.ts",
      "spatial/adapters/replay-service.ts",
      "spatial/adapters/historical-data-center.ts",
    ]);
    const adapters = sources.filter((entry) => isAdapter(entry.path));
    const databaseAdapters = adapters.filter((entry) => ![dataCenterProviderPath, marketProviderPath].includes(entry.path) && !m5Adapters.has(entry.path) && !marketHistoryAdapters.has(entry.path));
    const allowedAdapterPackages = new Set(["pg", "zod"]);

    it("exist only in Spatial's adapters directory or Market's exact provider/history allowlist", () => {
      expect(adapters.length).toBeGreaterThan(0);
      for (const adapter of adapters) expect(adapter.path.startsWith("spatial/adapters/") || adapter.path === marketProviderPath || marketHistoryAdapters.has(adapter.path), adapter.path).toBe(true);
    });

    it("import only pg, zod and the engine's own tree: never Prisma, the application's database layer, Projects, the Map's service, the Data Center or the framework", () => {
      for (const adapter of databaseAdapters) {
        for (const specifier of specifiersOf(adapter.text)) {
          if (specifier.startsWith(".")) expect(resolve(dirname(adapter.file), specifier).startsWith(root), `${adapter.path} imports ${specifier}`).toBe(true);
          else expect(allowedAdapterPackages.has(specifier), `${adapter.path} imports ${specifier}`).toBe(true);
        }
      }
    });

    it("are the only files that import the driver", () => {
      const importers = sources.filter((entry) => specifiersOf(entry.text).includes("pg")).map((entry) => entry.path);
      expect(importers).toEqual(["spatial/adapters/read-only-session.ts"]);
    });

    it("are not re-exported by the engine's own index, so the pure core never pulls in a driver", () => {
      const index = sources.find((entry) => entry.path === "spatial/index.ts");
      expect(index?.text).not.toMatch(/adapters/);
      for (const entry of sources.filter((candidate) => !isAdapter(candidate.path))) expect(specifiersOf(entry.text).filter((specifier) => /adapters/.test(specifier)), entry.path).toEqual([]);
    });

    it("never read the environment, the clock or the network, and never log", () => {
      for (const adapter of adapters) {
        expect(adapter.text, adapter.path).not.toMatch(/process\.env|Date\.now|new Date\(\s*\)|fetch\s*\(|console\.|Math\.random/);
      }
    });

    it("keeps Spatial M5 and Market M4 database adapters narrowly scoped to persistence and exact historical reads", () => {
      const permitted = new Map<string, Set<string>>([
        ["market-demand/adapters/run-persistence.ts", new Set(["@/generated/prisma/client", "@/lib/db", "@/services/data-center/contracts", "@/services/data-center/policy"])],
        ["market-demand/adapters/run-service.ts", new Set(["@/services/data-center/contracts"])],
        ["market-demand/adapters/replay-service.ts", new Set(["@/services/data-center/contracts", "@/generated/prisma/client", "@/lib/db"])],
        ["market-demand/adapters/historical-data-center.ts", new Set(["@/generated/prisma/client", "@/lib/auth/authorization", "@/lib/db", "@/services/data-center/contracts", "@/services/data-center/policy", "@/services/data-center/version-checksum"])],
        ["spatial/adapters/run-persistence.ts", new Set(["@/generated/prisma/client", "@/lib/db", "@/services/data-center/contracts", "@/services/data-center/map-contract", "@/services/data-center/policy"])],
        ["spatial/adapters/run-service.ts", new Set(["@/services/data-center/contracts"])],
        ["spatial/adapters/replay-service.ts", new Set(["zod", "@/services/data-center/contracts", "@/services/data-center/map-contract"])],
        ["spatial/adapters/historical-data-center.ts", new Set(["@/generated/prisma/client", "@/lib/auth/authorization", "@/lib/db", "@/services/data-center/contracts", "@/services/data-center/imports", "@/services/data-center/policy", "@/services/data-center/version-checksum"])],
      ]);
      for (const adapter of adapters.filter((entry) => m5Adapters.has(entry.path) || marketHistoryAdapters.has(entry.path))) {
        for (const specifier of specifiersOf(adapter.text)) {
          if (specifier.startsWith(".")) expect(resolve(dirname(adapter.file), specifier).startsWith(root), `${adapter.path} imports ${specifier}`).toBe(true);
          else expect(permitted.get(adapter.path)?.has(specifier), `${adapter.path} imports ${specifier}`).toBe(true);
        }
      }
      const historical = adapters.find((entry) => entry.path === "spatial/adapters/historical-data-center.ts")?.text ?? "";
      expect(historical).not.toMatch(/\$executeRaw|\$queryRaw|\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
      expect(historical).toMatch(/findFirst\s*\(/);
      const persistence = adapters.find((entry) => entry.path === "spatial/adapters/run-persistence.ts")?.text ?? "";
      expect(persistence).not.toMatch(/\.(?:update|updateMany|upsert|delete|deleteMany)\s*\(/);
    });

    describe("the Data Center provider", () => {
      // The Data Center's three read services: the only way the engine reaches the Data Center.
      const readServices = ["@/services/data-center/discovery", "@/services/data-center/version-content", "@/services/data-center/map-resolver"];
      const allowedAbsolute = new Set([...readServices, "@/services/data-center/contracts", "@/services/data-center/version-selection"]);
      const provider = adapters.find((entry) => entry.path === dataCenterProviderPath);

      it("exists, and no other adapter imports anything of the Data Center", () => {
        expect(provider).toBeDefined();
        for (const adapter of adapters.filter((entry) => ![dataCenterProviderPath, marketProviderPath].includes(entry.path) && !m5Adapters.has(entry.path) && !marketHistoryAdapters.has(entry.path))) {
          expect(specifiersOf(adapter.text).filter((specifier) => specifier.startsWith("@/services/data-center")), adapter.path).toEqual([]);
        }
      });

      it("reaches the Data Center only through its three read services and their pure contracts, plus the engine's own tree", () => {
        const specifiers = specifiersOf(provider?.text ?? "");
        for (const service of readServices) expect(specifiers).toContain(service);
        for (const specifier of specifiers) {
          if (specifier.startsWith(".")) expect(resolve(dirname(provider?.file ?? ""), specifier).startsWith(root), `imports ${specifier}`).toBe(true);
          else expect(allowedAbsolute.has(specifier), `imports ${specifier}`).toBe(true);
        }
      });

      it("has no direct database access: no driver, no Prisma, no application database layer, no SQL, and no writer of usage, audit or anything else", () => {
        const text = provider?.text ?? "";
        expect(specifiersOf(text).filter((specifier) => /^pg$|@\/lib\/|@\/generated|@prisma|data-center\/(?:retrieval|service|imports|robot-grants|quality|import)/.test(specifier))).toEqual([]);
        expect(text).not.toMatch(/\$queryRaw|\$executeRaw|\$transaction|\bPrismaClient\b|\bSELECT\s+\w+\s+FROM\b|\bdb\s*\./);
        expect(text).not.toMatch(/recordDataCenterUsage|\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
      });

      it("confines Data Center read-service imports to the two named engine providers", () => {
        const importers = sources.filter((entry) => specifiersOf(entry.text).some((specifier) => readServices.includes(specifier))).map((entry) => entry.path);
        expect(importers).toEqual([marketProviderPath, dataCenterProviderPath]);
      });
    });
  });
});
