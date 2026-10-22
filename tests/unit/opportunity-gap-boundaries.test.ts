import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "services", "analysis-engines", "opportunity-gap");
const shared = resolve(root, "..", "shared");
const within = (directory: string, target: string) => target.startsWith(`${directory}${sep}`);
const filesAt = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? filesAt(join(directory, entry.name)) : entry.name.endsWith(".ts") ? [join(directory, entry.name)] : []);
function problems(text: string, file = join(root, "probe.ts")) {
  const found: string[] = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const check = (specifier: string) => {
    if (specifier === "zod") return;
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(file), specifier);
      if (within(root, target) || within(shared, target)) return;
    }
    found.push(`Forbidden import ${specifier}`);
  };
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) check(node.moduleSpecifier.text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) check(node.argument.literal.text);
    if (ts.isImportEqualsDeclaration(node)) found.push("Import assignment");
    if (ts.isIdentifier(node) && ["fetch", "XMLHttpRequest", "WebSocket", "require", "process", "console", "eval", "Function"].includes(node.text)) found.push(node.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) found.push("Dynamic import");
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && ["fetch", "require", "env", "now", "random"].includes(node.argumentExpression.text)) found.push("Indirect capability");
    if (ts.isPropertyAccessExpression(node) && ["Date.now", "Math.random", "performance.now"].includes(node.getText(source))) found.push("Nondeterminism");
    if (ts.isNewExpression(node) && node.expression.getText(source) === "Date" && !node.arguments?.length) found.push("Hidden clock");
    if (ts.isCallExpression(node) && node.expression.getText(source) === "Date") found.push("Hidden clock");
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany", "$queryRaw", "$executeRaw"].includes(node.expression.name.text)) found.push("Store capability");
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
describe("Opportunity M1 isolation: no live provider, persistence or prior-engine imports", () => {
  it("has only own/Shared pure dependencies and no adapters", () => {
    const files = filesAt(root);
    expect(files.length).toBe(6);
    expect(readdirSync(root)).not.toContain("adapters");
    for (const file of files) expect(problems(readFileSync(file, "utf8"), file), relative(root, file)).toEqual([]);
  });
  it.each([
    'import "../spatial";', 'export * from "../market-demand";', 'type T = import("../competitor-analysis").CompetitorResult;',
    'import "@/services/data-center/version-content";', 'import "@/services/jenan-map";', 'import "@/services/projects";',
    'import "pg";', 'import "node:fs";', 'import "node:https";', 'import "openai";',
    'import("../spatial/engine");', 'require("pg");', 'const r = globalThis.fetch;',
    'globalThis["fetch"]("x");', 'process.env.DATABASE_URL;', 'Date.now();', 'Math.random();', 'performance.now();',
    'new Date();', 'Date();', 'new Function("return 1")();', 'console.log("x");',
    'tx.dataCenterItem.create({});', 'tx.analysisEngineRun.create({});', 'tx.$queryRaw("x");',
  ])("detects prohibited capability: %s", (text) => expect(problems(text).length).toBeGreaterThan(0));
  it("allows explicit deterministic dates and unchanged Shared helpers", () => {
    expect(problems('import { canonicalize } from "../shared/canonical"; new Date("2026-10-01T00:00:00.000Z");')).toEqual([]);
  });
});
