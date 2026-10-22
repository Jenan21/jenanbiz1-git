import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "services", "analysis-engines", "operational-feasibility");
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
    ts.forEachChild(node, visit);
  };
  visit(source); return found;
}
describe("Operational M1 has no I/O, prior-engine or calculation capability", () => {
  it("contains exactly the pure foundation files, with no adapters or full operational formulas", () => {
    expect(readdirSync(root)).toEqual(["confidence.ts", "contracts.ts", "decimal.ts", "index.ts", "model.ts", "request.ts"]);
    for (const name of readdirSync(root)) {
      const file = join(root, name);
      expect(problems(readFileSync(file, "utf8"), file), name).toEqual([]);
    }
  });
  it.each([
    'import "../spatial";', 'export * from "../market-demand";', 'type T = import("../competitor-analysis").Result;',
    'import "../opportunity-gap";', 'import "../financial-feasibility/decimal";', 'import "@/lib/db";',
    'import "@/services/data-center/discovery";', 'import "@/services/data-center/contracts";', 'import "@/services/projects";',
    'import "pg";', 'import "node:fs";', 'import "openai";', 'import "decimal.js";',
    'import("../spatial");', 'require("pg");', 'globalThis["fetch"]("x");', 'fetch("x");', 'process.env.X;',
    'Date.now();', 'new Date();', 'Date();', 'Math.random();', 'performance.now();', 'new Function("x");',
    'console.log("x");', 'import legacy = require("pg");',
  ])("rejects prohibited capability %s", (text) => expect(problems(text).length).toBeGreaterThan(0));
  it("allows the existing decimal dependency only through its isolated local wrapper", () => {
    expect(problems('import Decimal from "decimal.js";', join(root, "decimal.ts"))).toEqual([]);
    expect(problems('import { canonicalize } from "../shared/canonical";')).toEqual([]);
  });
});
