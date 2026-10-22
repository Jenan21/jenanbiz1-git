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
    if (file === join(root, "data-port.ts") && specifier === "@/services/data-center/map-contract") return;
    if (file === join(root, "adapters", "data-center-provider.ts") && [
      "@/services/data-center/contracts", "@/services/data-center/discovery", "@/services/data-center/version-content",
    ].includes(specifier)) return;
    if (specifier.startsWith(".")) {
      const path = resolve(dirname(file), specifier);
      if ((within(root, path) && !within(join(root, "adapters"), path)) || within(shared, path)) return;
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
describe("Operational M2 confines I/O to the exact governed read adapter", () => {
  it("retains pure contracts and only one read adapter, with no operating calculations or storage", () => {
    expect(readdirSync(root)).toEqual(["adapters", "confidence.ts", "contracts.ts", "data-port.ts", "data-sources.ts", "datasets.ts", "decimal.ts", "index.ts", "model.ts", "request.ts"]);
    for (const name of readdirSync(root).filter((name) => name.endsWith(".ts"))) {
      const file = join(root, name);
      expect(problems(readFileSync(file, "utf8"), file), name).toEqual([]);
    }
    expect(readdirSync(join(root, "adapters"))).toEqual(["data-center-provider.ts"]);
    const adapter = join(root, "adapters", "data-center-provider.ts");
    expect(problems(readFileSync(adapter, "utf8"), adapter)).toEqual([]);
    expect(readFileSync(join(root, "index.ts"), "utf8")).not.toMatch(/adapters/);
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
  it("registers every Operational unit and integration case outside a running test", () => {
    for (const directory of [join(process.cwd(), "tests", "unit"), join(process.cwd(), "tests", "integration")]) {
      for (const name of readdirSync(directory).filter((name) => /^operational-feasibility-.*\.test\.ts$/.test(name))) {
        const file = join(directory, name);
        const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
        const visit = (node: ts.Node, insideTest: boolean) => {
          const test = ts.isCallExpression(node) && /^it(?:\.each\([\s\S]*\))?$/.test(node.expression.getText(source));
          if (test) expect(insideTest, `Nested test in ${file}`).toBe(false);
          ts.forEachChild(node, (child) => visit(child, insideTest || test));
        };
        visit(source, false);
      }
    }
  });
});
