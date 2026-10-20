import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The analysis engines are pure: they never read a database, a network, the clock or the environment on their own. Everything outside
 * their own tree reaches them through a contract or an injected port. Adapters that talk to PostGIS or to the Data Center arrive in later
 * milestones and are the only code allowed to import the database layer; until then this guard allows nothing beyond the list below.
 */
const root = join(process.cwd(), "services", "analysis-engines");
const listFiles = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? listFiles(path) : path.endsWith(".ts") ? [path] : [];
});
const sources = listFiles(root).map((file) => ({ file, path: relative(root, file).split(sep).join("/"), text: readFileSync(file, "utf8") }));
const isAdapter = (path: string) => path.split("/").includes("adapters");

const allowedPackages = new Set(["zod", "node:crypto"]);
const allowedAbsolute = new Set(["@/services/data-center/contracts"]);
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
    const adapters = sources.filter((entry) => isAdapter(entry.path));
    const allowedAdapterPackages = new Set(["pg", "zod"]);

    it("exist only in the Spatial Engine's adapters directory", () => {
      expect(adapters.length).toBeGreaterThan(0);
      for (const adapter of adapters) expect(adapter.path.startsWith("spatial/adapters/"), adapter.path).toBe(true);
    });

    it("import only pg, zod and the engine's own tree: never Prisma, the application's database layer, Projects, the Map's service, the Data Center or the framework", () => {
      for (const adapter of adapters) {
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
        expect(adapter.text, adapter.path).not.toMatch(/process\.env|Date\.now|new Date\(|fetch\s*\(|console\.|Math\.random/);
      }
    });
  });
});
