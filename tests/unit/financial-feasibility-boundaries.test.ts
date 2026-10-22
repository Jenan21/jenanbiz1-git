import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "services", "analysis-engines", "financial-feasibility");
const shared = resolve(root, "..", "shared");
const within = (directory: string, path: string) => path.startsWith(`${directory}${sep}`);
function problems(text: string, file = join(root, "probe.ts")) {
  const found: string[] = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const check = (specifier: string) => {
    if (specifier === "zod" || (specifier === "decimal.js" && file === join(root, "decimal.ts"))) return;
    if (specifier.startsWith(".")) {
      const path = resolve(dirname(file), specifier);
      if (within(root, path) || within(shared, path)) return;
    }
    found.push(`Forbidden import ${specifier}`);
  };
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) check(node.moduleSpecifier.text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) check(node.argument.literal.text);
    if (ts.isImportEqualsDeclaration(node)) found.push("Import assignment");
    if (ts.isIdentifier(node) && ["fetch", "WebSocket", "XMLHttpRequest", "require", "process", "console", "eval", "Function", "globalThis"].includes(node.text)) found.push(node.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) found.push("Dynamic import");
    if (ts.isPropertyAccessExpression(node) && ["Date.now", "Math.random", "performance.now"].includes(node.getText(source))) found.push("Nondeterminism");
    if (ts.isNewExpression(node) && node.expression.getText(source) === "Date" && !node.arguments?.length) found.push("Hidden clock");
    if (ts.isCallExpression(node) && node.expression.getText(source) === "Date") found.push("Hidden clock");
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ["create", "createMany", "update", "delete", "upsert", "$queryRaw", "$executeRaw"].includes(node.expression.name.text)) found.push("Store capability");
    ts.forEachChild(node, visit);
  };
  visit(source); return found;
}
describe("Financial M1 isolation and strict pure foundation", () => {
  it("has exactly seven pure files, no adapter and no production persistence", () => {
    const files = readdirSync(root);
    expect(files).toEqual(["confidence.ts", "contracts.ts", "decimal.ts", "index.ts", "model.ts", "request.ts", "semantics.ts"]);
    for (const name of files) {
      const file = join(root, name);
      expect(problems(readFileSync(file, "utf8"), file), relative(root, file)).toEqual([]);
    }
  });
  it.each([
    'import "../spatial";', 'export * from "../market-demand";', 'type T = import("../competitor-analysis").CompetitorResult;',
    'import "../opportunity-gap";', 'import "@/lib/db";', 'import "@/services/data-center/service";',
    'import "@/services/projects";', 'import "pg";', 'import "node:fs";', 'import "node:https";', 'import "openai";',
    'import "decimal.js";', 'import("../spatial");', 'require("pg");', 'globalThis["fetch"]("x");', 'fetch("x");',
    'process.env.X;', 'Date.now();', 'new Date();', 'Date();', 'Math.random();', 'performance.now();',
    'new Function("x");', 'tx.analysisEngineRun.create({});', 'console.log("x");',
  ])("detects prohibited capability %s", (text) => expect(problems(text).length).toBeGreaterThan(0));
  it("allows decimal.js only in its isolated configuration wrapper", () => {
    expect(problems('import Decimal from "decimal.js";', join(root, "decimal.ts"))).toEqual([]);
    expect(problems('import { canonicalize } from "../shared/canonical"; new Date("2026-10-01T00:00:00.000Z");')).toEqual([]);
  });
  it("registers every Financial case at suite level", () => {
    const directory = join(process.cwd(), "tests", "unit");
    for (const file of readdirSync(directory).filter((name) => /^financial-feasibility-.*\.test\.ts$/.test(name))) {
      const source = ts.createSourceFile(file, readFileSync(join(directory, file), "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node, insideTest: boolean) => {
        const test = ts.isCallExpression(node) && /^it(?:\.each\([\s\S]*\))?$/.test(node.expression.getText(source));
        if (test) expect(insideTest, `Nested case in ${file}`).toBe(false);
        ts.forEachChild(node, (child) => visit(child, insideTest || test));
      };
      visit(source, false);
    }
  });
});
