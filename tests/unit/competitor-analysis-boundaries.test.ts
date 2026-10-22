import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "services", "analysis-engines");
const competitor = join(root, "competitor-analysis");
const shared = join(root, "shared");
const provider = join(competitor, "adapters", "data-center-provider.ts");
const persistence = join(competitor, "adapters", "run-persistence.ts");
const historyAdapters = new Map([
  [persistence, ["@/generated/prisma/client", "@/lib/db", "@/services/data-center/contracts", "@/services/data-center/policy"]],
  [join(competitor, "adapters", "run-service.ts"), ["@/services/data-center/contracts"]],
  [join(competitor, "adapters", "replay-service.ts"), ["@/services/data-center/contracts", "@/generated/prisma/client", "@/lib/db"]],
  [join(competitor, "adapters", "historical-data-center.ts"), ["@/generated/prisma/client", "@/lib/auth/authorization", "@/lib/db", "@/services/data-center/contracts", "@/services/data-center/policy", "@/services/data-center/version-checksum"]],
]);
const within = (directory: string, target: string) => target === directory || target.startsWith(`${directory}${sep}`);
const filesAt = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? filesAt(join(directory, entry.name)) : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : []);

function boundaryProblems(text: string, file: string): string[] {
  const problems: string[] = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const inspectImport = (specifier: string) => {
    if (specifier === "zod") return;
    if (file === join(competitor, "data-port.ts") && specifier === "@/services/data-center/map-contract") return;
    if (file === provider && ["@/services/data-center/contracts", "@/services/data-center/discovery", "@/services/data-center/version-content"].includes(specifier)) return;
    if (historyAdapters.get(file)?.includes(specifier)) return;
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(file), specifier);
      if ((within(competitor, target) || within(shared, target)) && (!within(join(competitor, "adapters"), target) || historyAdapters.has(file))) return;
    }
    problems.push(`Forbidden capability import: ${specifier}`);
  };
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) inspectImport(node.moduleSpecifier.text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) inspectImport(node.argument.literal.text);
    if (ts.isImportEqualsDeclaration(node)) problems.push("Import assignment");
    if (ts.isIdentifier(node) && ["fetch", "XMLHttpRequest", "WebSocket", "require", "eval", "process", "console", "Function"].includes(node.text)) problems.push(`Forbidden capability: ${node.text}`);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) problems.push("Dynamic import");
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && ["fetch", "require", "env", "now", "random", "Function"].includes(node.argumentExpression.text)) problems.push("Indirect capability");
    if (ts.isPropertyAccessExpression(node) && ["Date.now", "Math.random", "performance.now"].includes(node.getText(source))) problems.push("Hidden nondeterminism");
    if (ts.isNewExpression(node) && node.expression.getText(source) === "Date" && !node.arguments?.length) problems.push("Hidden clock");
    if (ts.isCallExpression(node) && node.expression.getText(source) === "Date") problems.push("Hidden clock");
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany", "$executeRaw", "$executeRawUnsafe", "$queryRaw", "$queryRawUnsafe"].includes(node.expression.name.text)
      && !(file === persistence && node.expression.getText(source) === "tx.analysisEngineRun.create")) problems.push("Database/store capability");
    ts.forEachChild(node, visit);
  };
  visit(source);
  return problems;
}
describe("Competitor M4 pure/static isolation boundaries", () => {
  it("has pure dependencies, one read-only provider and exact internal history adapters", () => {
    for (const file of filesAt(competitor)) expect(boundaryProblems(readFileSync(file, "utf8"), file), relative(root, file)).toEqual([]);
    expect(readdirSync(join(competitor, "adapters")).sort()).toEqual(["data-center-provider.ts", "historical-data-center.ts", "replay-service.ts", "run-persistence.ts", "run-service.ts"]);
    expect(readFileSync(join(competitor, "index.ts"), "utf8")).not.toMatch(/adapters/);
  });
  it.each([
    'import x from "@/services/data-center/service";', 'import x from "@/services/data-center/map-resolver";',
    'import x from "@/lib/db";', 'import x from "../../spatial";', 'fetch("https://example.test");',
    "tx.dataCenterItem.create({});", "tx.analysisEngineRun.create({});",
  ])("rejects excess capability even inside the provider: %s", (text) => {
    expect(boundaryProblems(text, provider).length).toBeGreaterThan(0);
  });
  it.each([
    'import "../spatial/engine";', 'export * from "../market-demand";',
    'import x from "@/services/projects";', 'import x from "@/services/data-center/version-content";',
    'import x from "@/services/jenan-map";', 'import x from "@prisma/client";', 'import x from "pg";',
    'import x from "node:https";', 'import x from "node:fs";', 'import x from "openai";',
    'import x from "@github/copilot-sdk";', 'import "../competitor-analysis/adapters/data-center";',
    'import("../spatial/engine");', 'type X = import("../market-demand/contracts").MarketResult;',
    'require("pg");', 'const load = require;', 'fetch("https://example.test");',
    'new WebSocket("x");', 'new XMLHttpRequest();', 'new Function("return fetch")();',
    "new Date();", "Date();", "Date.now();", "Math.random();", "performance.now();", "process.env.API_KEY;",
    'globalThis["fetch"]("https://example.test");', "const request = globalThis.fetch;",
    "tx.dataCenterSource.create({});", "tx.analysisEngineRun.create({});", "tx.$queryRaw('sql');",
    "console.log('hidden result');",
  ])("actively detects forbidden capabilities: %s", (text) => {
    expect(boundaryProblems(text, join(competitor, "probe.ts")).length).toBeGreaterThan(0);
  });
  it("accepts deterministic explicit dates and Shared-only pure contracts", () => {
    expect(boundaryProblems('import { canonicalHash } from "../shared/canonical"; Date.parse("2026-10-22T00:00:00Z");', join(competitor, "probe.ts"))).toEqual([]);
  });
  it("registers integration cases at suite level, never inside another test callback", () => {
    const file = join(process.cwd(), "tests", "integration", "competitor-analysis-data-center.integration.test.ts");
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node, insideTest = false) => {
      const test = ts.isCallExpression(node) && /^it(?:\.each\([\s\S]*\))?$/.test(node.expression.getText(source));
      if (test) expect(insideTest, `Nested test at ${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`).toBe(false);
      ts.forEachChild(node, (child) => visit(child, insideTest || test));
    };
    visit(source);
  });
  it.each(["tx.dataCenterUsage.create({});", "tx.analysisEngineRun.update({});", "tx.analysisEngineRunInput.create({});", "tx.$queryRaw('x');"])("restricts persistence to one atomic shared nested-create: %s", (text) => {
    expect(boundaryProblems(text, persistence).length).toBeGreaterThan(0);
  });
  it.each([...historyAdapters.keys()])("rejects excess imports/calls in %s", (file) => {
    for (const text of ['import x from "@/services/data-center/service";', 'import x from "../../market-demand";',
      'import x from "pg";', "tx.dataCenterItem.create({});", "fetch('x');", "Date.now();"]) {
      expect(boundaryProblems(text, file).length).toBeGreaterThan(0);
    }
  });
});
