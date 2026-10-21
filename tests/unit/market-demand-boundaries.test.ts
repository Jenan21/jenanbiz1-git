import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "services", "analysis-engines");
const shared = join(root, "shared");
const market = join(root, "market-demand");
const provider = join(market, "adapters", "data-center-provider.ts");
const providerServices = ["@/services/data-center/contracts", "@/services/data-center/discovery", "@/services/data-center/version-content"];
const adapterPermissions = new Map([
  [provider, providerServices],
  [join(market, "adapters", "run-persistence.ts"), ["@/generated/prisma/client", "@/lib/db", "@/services/data-center/contracts", "@/services/data-center/policy"]],
  [join(market, "adapters", "run-service.ts"), ["@/services/data-center/contracts"]],
  [join(market, "adapters", "replay-service.ts"), ["@/services/data-center/contracts", "@/generated/prisma/client", "@/lib/db"]],
  [join(market, "adapters", "historical-data-center.ts"), ["@/generated/prisma/client", "@/lib/auth/authorization", "@/lib/db", "@/services/data-center/contracts", "@/services/data-center/policy", "@/services/data-center/version-checksum"]],
]);
const within = (base: string, path: string) => path === base || path.startsWith(`${base}\\`) || path.startsWith(`${base}/`);
function filesAt(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? filesAt(join(directory, entry.name)) : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : []);
}
function boundaryProblems(text: string, file: string, isShared = false): string[] {
  const problems: string[] = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const importTarget = (specifier: string) => {
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(file), specifier);
      if ((!within(shared, target) && !(within(market, target) && !isShared)) || (within(join(market, "adapters"), target) && !adapterPermissions.has(file))) problems.push(`Forbidden module: ${specifier}`);
    } else if (specifier !== "zod"
      && !(isShared && ["node:crypto", "@/services/data-center/contracts", "@/services/data-center/map-contract"].includes(specifier))
      && !(file === join(market, "data-port.ts") && specifier === "@/services/data-center/map-contract")
      && !adapterPermissions.get(file)?.includes(specifier)) problems.push(`Forbidden module: ${specifier}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && ["fetch", "XMLHttpRequest", "WebSocket", "require", "eval", "process", "console"].includes(node.text)) problems.push(`Forbidden global: ${node.text}`);
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)
      && ["fetch", "require", "env", "now", "random"].includes(node.argumentExpression.text)) problems.push("Forbidden indirect capability");
    if (ts.isPropertyAccessExpression(node) && ["Date.now", "Math.random", "performance.now"].includes(node.getText(source))) problems.push("Hidden clock or randomness");
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) importTarget(node.moduleSpecifier.text);
    if (ts.isImportEqualsDeclaration(node)) problems.push("Import assignment is not allowed");
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(source);
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || ["require", "fetch", "eval", "Date.now", "Math.random", "performance.now"].includes(name)) problems.push(`Forbidden call: ${name}`);
      if (!isShared && ts.isPropertyAccessExpression(node.expression)
        && ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany", "$executeRaw", "$executeRawUnsafe", "$queryRaw", "$queryRawUnsafe"].includes(node.expression.name.text)
        && !(file === join(market, "adapters", "run-persistence.ts") && name === "tx.analysisEngineRun.create")) problems.push(`Forbidden write or raw database call: ${name}`);
    }
    if (ts.isNewExpression(node) && ["WebSocket", "XMLHttpRequest", "Function"].includes(node.expression.getText(source))) problems.push("Forbidden network or dynamic constructor");
    if (ts.isNewExpression(node) && node.expression.getText(source) === "Date" && !node.arguments?.length) problems.push("Hidden clock");
    if (ts.isPropertyAccessExpression(node) && (node.getText(source).startsWith("process.env") || node.expression.getText(source) === "console")) problems.push("Environment or logging");
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}
describe("Market M4 static boundaries", () => {
  it("allows only Market's own pure modules and Shared Core; Shared Core never depends on an engine", () => {
    for (const directory of [market, shared]) for (const file of filesAt(directory)) {
      expect(boundaryProblems(readFileSync(file, "utf8"), file, directory === shared), relative(root, file)).toEqual([]);
    }
  });
  it.each([
    'import "../spatial/engine";',
    'export * from "../spatial/contracts";',
    'import x from "@/services/projects";',
    'import x from "@/services/data-center/version-content";',
    'import x from "@/services/jenan-map";',
    'import x from "@prisma/client";',
    'import x from "node:https";',
    'import x from "openai";',
    'import("../spatial/engine");',
    'require("pg");',
    'fetch("https://example.test");',
    "new WebSocket('x');",
    "new Date();",
    "Date.now();",
    "Math.random();",
    "process.env.API_KEY;",
    "const request = globalThis.fetch;",
    'globalThis["fetch"]("https://example.test");',
  ])("detects forbidden code rather than merely documenting it: %s", (code) => {
    expect(boundaryProblems(code, join(market, "probe.ts")).length).toBeGreaterThan(0);
  });
  it("keeps exactly the named read provider and internal persistence/history adapters, with no Data Center writer or Map resolver", () => {
    expect(readdirSync(join(market, "adapters")).sort()).toEqual(["data-center-provider.ts", "historical-data-center.ts", "replay-service.ts", "run-persistence.ts", "run-service.ts"]);
    for (const file of filesAt(market)) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/\b(?:PrismaClient|recordDataCenterUsage|resolveDataCenterMapReference|registerDataCenterType)\b|\$queryRaw|\$executeRaw|\.(?:update|updateMany|upsert|delete|deleteMany)\s*\(/);
      if (file !== join(market, "adapters", "run-persistence.ts")) expect(text, file).not.toMatch(/\.(?:create|createMany)\s*\(/);
      if (file !== provider) expect(readFileSync(file, "utf8"), file).not.toMatch(/\b(?:discoverDataCenterVersions|readDataCenterVersionContent)\b/);
    }
    const persistence = readFileSync(join(market, "adapters", "run-persistence.ts"), "utf8");
    expect(persistence).toMatch(/tx\.analysisEngineRun\.create/);
    expect(persistence).not.toMatch(/(?:dataCenter|auditLog)\w*\.(?:create|update|upsert|delete)/);
  });
  it("does not let either engine's pure index export history/database adapters", () => {
    expect(readFileSync(join(market, "index.ts"), "utf8")).not.toMatch(/adapters/);
  });
  it.each(["tx.dataCenterSource.create({})", "tx.analysisEngineRun.update({})", "tx.analysisEngineRunInput.create({})", "tx.$executeRawUnsafe('sql')"])("restricts persistence to one shared run nested-create capability: %s", (code) => {
    expect(boundaryProblems(code, join(market, "adapters", "run-persistence.ts")).length).toBeGreaterThan(0);
  });
  it.each(["run-persistence.ts", "run-service.ts", "replay-service.ts", "historical-data-center.ts"])("rejects extra network, Data Center writes and Spatial access in %s", (name) => {
    for (const specifier of ["pg", "openai", "@/services/data-center/service", "@/services/analysis-engines/spatial"]) {
      expect(boundaryProblems(`import x from "${specifier}";`, join(market, "adapters", name)).length).toBeGreaterThan(0);
    }
  });
  it.each(["@/services/data-center/service", "@/services/data-center/map-resolver", "@/lib/db", "pg", "openai"])("rejects extra provider capability: %s", (specifier) => {
    expect(boundaryProblems(`import x from "${specifier}";`, provider).length).toBeGreaterThan(0);
  });
  it("does not let a pure Market module reach its own adapter", () => {
    expect(boundaryProblems('import "./adapters/data-center-provider";', join(market, "probe.ts")).length).toBeGreaterThan(0);
  });
});
