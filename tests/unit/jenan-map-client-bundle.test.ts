import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// zod 4 probes for script evaluation (`new Function`) as it builds a schema. The production content security policy forbids
// evaluation, so any page whose bundle holds a schema reports a violation and fails the policy audit. Browser code of the map
// must therefore never reach zod; it shares only the dependency-free modules below with the server.
const root = process.cwd();
const clientFolders = ["features/jenan-map", "components/admin/jenan-map"];
const dependencyFree = ["messages", "preferences-shape"];

function sourcesIn(folder: string): string[] {
  return readdirSync(join(root, folder), { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return sourcesIn(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

interface Import { specifier: string; typeOnly: boolean }

function importsOf(source: string): Import[] {
  const found: Import[] = [];
  for (const match of source.matchAll(/^(?:import|export)\s+(type\s+)?([^;]*?)\sfrom\s+["']([^"']+)["']/gm)) {
    const clause = match[2].trim();
    const names = clause.startsWith("{") ? clause.slice(1, clause.lastIndexOf("}")).split(",").map((name) => name.trim()).filter(Boolean) : [];
    const everyNameIsAType = names.length > 0 && names.every((name) => name.startsWith("type "));
    found.push({ specifier: match[3], typeOnly: Boolean(match[1]) || everyNameIsAType });
  }
  for (const match of source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g)) found.push({ specifier: match[1], typeOnly: false });
  for (const match of source.matchAll(/^import\s+["']([^"']+)["']/gm)) found.push({ specifier: match[1], typeOnly: false });
  return found;
}

describe("the map's browser code stays free of the schema library", () => {
  const files = clientFolders.flatMap(sourcesIn);

  it("finds the browser code it is meant to guard", () => {
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((file) => file.endsWith("preferences-api.ts"))).toBe(true);
    expect(files.some((file) => file.endsWith("jenan-map-admin.tsx"))).toBe(true);
  });

  it.each(files)("%s imports neither zod nor the server contracts", (file) => {
    const offending = importsOf(readFileSync(join(root, file), "utf8"))
      .filter((item) => !item.typeOnly)
      .filter((item) => {
        if (item.specifier === "zod" || item.specifier.startsWith("zod/")) return true;
        const service = /^@\/services\/jenan-map\/(.+)$/.exec(item.specifier);
        return service !== null && !dependencyFree.includes(service[1]);
      });
    expect(offending, relative(root, join(root, file))).toEqual([]);
  });

  it.each(dependencyFree)("the shared module %s imports nothing", (name) => {
    const source = readFileSync(join(root, "services/jenan-map", `${name}.ts`), "utf8");
    expect(importsOf(source).filter((item) => !item.typeOnly)).toEqual([]);
  });
});
