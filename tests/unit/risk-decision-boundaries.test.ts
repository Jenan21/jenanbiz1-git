import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "services", "analysis-engines", "risk-decision");
const shared = resolve(root, "..", "shared");
const within = (directory: string, path: string) => path.startsWith(`${directory}${sep}`);
function violations(text: string, file = join(root, "probe.ts")) {
  const errors: string[] = []; const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const check = (specifier: string) => {
    if (specifier === "zod") return;
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(file), specifier);
      if (within(root, target) || within(shared, target)) return;
    }
    errors.push(`Forbidden import ${specifier}`);
  };
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) check(node.moduleSpecifier.text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) check(node.argument.literal.text);
    if (ts.isImportEqualsDeclaration(node)) errors.push("Import assignment");
    if (ts.isIdentifier(node) && ["fetch", "WebSocket", "XMLHttpRequest", "require", "process", "console", "eval", "Function", "globalThis"].includes(node.text)) errors.push(node.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) errors.push("Dynamic import");
    if (ts.isPropertyAccessExpression(node) && ["Date.now", "Math.random", "performance.now"].includes(node.getText(source))) errors.push("Nondeterminism");
    if (ts.isNewExpression(node) && node.expression.getText(source) === "Date" && !node.arguments?.length) errors.push("Hidden clock");
    if (ts.isCallExpression(node) && node.expression.getText(source) === "Date") errors.push("Hidden clock");
    ts.forEachChild(node, visit);
  };
  visit(source); return errors;
}
describe("Risk M1 pure foundation capability boundaries", () => {
  it("has exactly six pure modules, no adapters, no integration or calculator", () => {
    expect(readdirSync(root)).toEqual(["contracts.ts", "index.ts", "policy.ts", "request.ts", "semantics.ts", "snapshots.ts"]);
    for (const name of readdirSync(root)) {
      const file = join(root, name); const text = readFileSync(file, "utf8");
      expect(violations(text, file), name).toEqual([]);
      expect(text).not.toMatch(/\$queryRaw|\$executeRaw|PrismaClient|async\s+function|\bnew\s+Date\s*\(/);
    }
  });
  it.each([
    'import "../spatial";', 'export * from "../market-demand";', 'import "../competitor-analysis";',
    'import "../opportunity-gap";', 'import "../financial-feasibility";', 'import "../operational-feasibility";',
    'type T = import("../spatial").SpatialResult;', 'import "@/lib/db";', 'import "@/generated/prisma/client";',
    'import "@/services/data-center/discovery";', 'import "@/services/data-center/policy";', 'import "@/services/jenan-map/service";',
    'import "@/services/projects";', 'import "pg";', 'import "openai";', 'import "decimal.js";', 'import "node:fs";',
    'import("../operational-feasibility");', 'require("pg");', 'fetch("x");', 'globalThis["fetch"]("x");', 'process.env.X;',
    'Date.now();', 'new Date();', 'Date();', 'Math.random();', 'performance.now();', 'new Function("x");',
    'console.log("x");', 'import data = require("pg");',
  ])("rejects prohibited capability %s", (source) => expect(violations(source).length).toBeGreaterThan(0));
  it("allows unchanged Shared contract primitives, not previous engines", () => {
    expect(violations('import { canonicalHash } from "../shared/canonical";')).toEqual([]);
    expect(violations('export * from "./request";')).toEqual([]);
  });
  it("keeps every Risk test registered outside a running test", () => {
    for (const name of readdirSync(join(process.cwd(), "tests", "unit")).filter((name) => /^risk-decision-.*\.test\.ts$/.test(name))) {
      const file = join(process.cwd(), "tests", "unit", name); const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node, inside: boolean) => {
        const test = ts.isCallExpression(node) && /^it(?:\.each\([\s\S]*\))?$/.test(node.expression.getText(source));
        if (test) expect(inside, `Nested test in ${name}`).toBe(false);
        ts.forEachChild(node, (child) => visit(child, inside || test));
      };
      visit(source, false);
    }
  });
});
