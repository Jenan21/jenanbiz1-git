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
    if (file === join(root, "data-port.ts") && specifier === "@/services/data-center/map-contract") return;
    if (file === join(root, "adapters", "data-center-provider.ts") && [
      "@/services/data-center/contracts", "@/services/data-center/discovery", "@/services/data-center/version-content",
    ].includes(specifier)) return;
    const adapters: Record<string, string[]> = {
      "historical-data-center.ts": ["@/generated/prisma/client", "@/lib/auth/authorization", "@/lib/db", "@/services/data-center/contracts", "@/services/data-center/policy", "@/services/data-center/version-checksum"],
      "run-persistence.ts": ["@/generated/prisma/client", "@/lib/db", "@/services/data-center/contracts", "@/services/data-center/policy"],
      "replay-service.ts": ["@/services/data-center/contracts"],
      "run-service.ts": ["@/services/data-center/contracts", "@/services/data-center/policy"],
    };
    if (Object.entries(adapters).some(([name, allowed]) => file === join(root, "adapters", name) && allowed.includes(specifier))) return;
    if (specifier.startsWith(".")) {
      const path = resolve(dirname(file), specifier);
      if ((within(root, path) && (!within(join(root, "adapters"), path) || within(join(root, "adapters"), file))) || within(shared, path)) return;
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
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ["create", "createMany", "update", "updateMany", "delete", "deleteMany", "upsert", "$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe"].includes(node.expression.name.text)
      && !(file === join(root, "adapters", "run-persistence.ts") && node.expression.getText(source) === "tx.analysisEngineRun.create")) found.push("Store capability");
    ts.forEachChild(node, visit);
  };
  visit(source); return found;
}
describe("Financial engine isolation: pure calculations and exact governed read-only provider", () => {
  it("keeps pure calculations isolated and restricts live M4 adapters to existing storage/read capabilities", () => {
    const names = readdirSync(root);
    expect(names).toEqual(["adapters", "calculations.ts", "confidence.ts", "contracts.ts", "data-port.ts", "data-sources.ts", "datasets.ts", "decimal.ts", "index.ts", "model.ts", "request.ts", "run-history.ts", "semantics.ts"]);
    const files = names.filter((name) => name.endsWith(".ts"));
    expect(readdirSync(join(root, "adapters"))).toEqual(["data-center-provider.ts", "historical-data-center.ts", "replay-service.ts", "run-persistence.ts", "run-service.ts"]);
    for (const name of files) {
      const file = join(root, name);
      expect(problems(readFileSync(file, "utf8"), file), relative(root, file)).toEqual([]);
    }
    for (const name of readdirSync(join(root, "adapters"))) {
      const adapter = join(root, "adapters", name);
      expect(problems(readFileSync(adapter, "utf8"), adapter), name).toEqual([]);
    }
    expect(readFileSync(join(root, "index.ts"), "utf8")).not.toMatch(/adapters/);
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
    const files = readdirSync(directory).filter((name) => /^financial-feasibility-.*\.test\.ts$/.test(name)).map((name) => join(directory, name));
    files.push(...readdirSync(join(process.cwd(), "tests", "integration"))
      .filter((name) => /^financial-feasibility-.*\.test\.ts$/.test(name))
      .map((name) => join(process.cwd(), "tests", "integration", name)));
    for (const file of files) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node, insideTest: boolean) => {
        const test = ts.isCallExpression(node) && /^it(?:\.each\([\s\S]*\))?$/.test(node.expression.getText(source));
        if (test) expect(insideTest, `Nested case in ${file}`).toBe(false);
        ts.forEachChild(node, (child) => visit(child, insideTest || test));
      };
      visit(source, false);
    }
  });
});
