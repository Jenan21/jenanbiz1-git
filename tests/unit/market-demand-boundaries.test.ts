import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "services", "analysis-engines");
const shared = join(root, "shared");
const market = join(root, "market-demand");
const provider = join(market, "adapters", "data-center-provider.ts");
const providerServices = ["@/services/data-center/contracts", "@/services/data-center/discovery", "@/services/data-center/version-content"];
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
      if ((!within(shared, target) && !(within(market, target) && !isShared)) || (within(join(market, "adapters"), target) && file !== provider)) problems.push(`Forbidden module: ${specifier}`);
    } else if (specifier !== "zod"
      && !(isShared && ["node:crypto", "@/services/data-center/contracts", "@/services/data-center/map-contract"].includes(specifier))
      && !(file === join(market, "data-port.ts") && specifier === "@/services/data-center/map-contract")
      && !(file === provider && providerServices.includes(specifier))) problems.push(`Forbidden module: ${specifier}`);
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
    }
    if (ts.isNewExpression(node) && ["WebSocket", "XMLHttpRequest", "Function"].includes(node.expression.getText(source))) problems.push("Forbidden network or dynamic constructor");
    if (ts.isNewExpression(node) && node.expression.getText(source) === "Date" && !node.arguments?.length) problems.push("Hidden clock");
    if (ts.isPropertyAccessExpression(node) && (node.getText(source).startsWith("process.env") || node.expression.getText(source) === "console")) problems.push("Environment or logging");
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}
describe("Market M2 static boundaries", () => {
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
  it("has exactly one read-only adapter, with no database, registration, persistence or Map resolver", () => {
    expect(readdirSync(join(market, "adapters"))).toEqual(["data-center-provider.ts"]);
    for (const file of filesAt(market)) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\b(?:PrismaClient|recordDataCenterUsage|resolveDataCenterMapReference|registerDataCenterType|saveMarketRun|replayMarketRun)\b|\$queryRaw|\$executeRaw|\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
      if (file !== provider) expect(readFileSync(file, "utf8"), file).not.toMatch(/\b(?:discoverDataCenterVersions|readDataCenterVersionContent)\b/);
    }
  });
  it.each(["@/services/data-center/service", "@/services/data-center/map-resolver", "@/lib/db", "pg", "openai"])("rejects extra provider capability: %s", (specifier) => {
    expect(boundaryProblems(`import x from "${specifier}";`, provider).length).toBeGreaterThan(0);
  });
  it("does not let a pure Market module reach its own adapter", () => {
    expect(boundaryProblems('import "./adapters/data-center-provider";', join(market, "probe.ts")).length).toBeGreaterThan(0);
  });
});
