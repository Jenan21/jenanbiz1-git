import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "services", "privacy-gateway");
const canonical = resolve(root, "..", "analysis-engines", "shared", "canonical");
function violations(text: string, file = join(root, "probe.ts")) {
  const found: string[] = []; const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const specifier = (value: string) => {
    if (value === "zod") return;
    if (value.startsWith(".")) {
      const target = resolve(dirname(file), value);
      if (target.startsWith(`${root}${sep}`) || target === canonical) return;
    }
    found.push("Forbidden import");
  };
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifier(node.moduleSpecifier.text);
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) specifier(node.argument.literal.text);
    if (ts.isImportEqualsDeclaration(node)) found.push("Import assignment");
    if (ts.isIdentifier(node) && ["fetch", "XMLHttpRequest", "WebSocket", "require", "process", "console", "eval", "Function",
      "globalThis", "setTimeout", "setInterval"].includes(node.text)) found.push("Runtime capability");
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) found.push("Dynamic import");
    if (ts.isPropertyAccessExpression(node) && ["Date.now", "Math.random", "performance.now"].includes(node.getText(source))) found.push("Hidden clock/random");
    if (ts.isNewExpression(node) && node.expression.getText(source) === "Date") found.push("Date construction");
    if (ts.isCallExpression(node) && node.expression.getText(source) === "Date") found.push("Hidden clock");
    ts.forEachChild(node, visit);
  };
  visit(source); return found;
}
describe("Privacy M1 foundation capability boundaries", () => {
  it("preserves the five approved pure modules alongside isolated intake and sanitization directories", () => {
    expect(readdirSync(root).sort()).toEqual(["audit.ts", "contracts.ts", "durable", "index.ts", "intake", "policy.ts", "sanitization", "states.ts"]);
    for (const name of readdirSync(root).filter((name) => name.endsWith(".ts"))) {
      const file = join(root, name); const text = readFileSync(file, "utf8");
      expect(violations(text, file), name).toEqual([]);
      expect(text).not.toMatch(/\basync\b|\bPrisma\b|\$queryRaw|\$executeRaw|\.env\b/);
    }
  });
  it("adds no Privacy HTTP endpoint or worker/ingestion path", () => {
    for (const path of [join(process.cwd(), "app", "api", "privacy-gateway"), join(process.cwd(), "workers", "privacy-gateway-worker.ts"),
      join(root, "adapters")]) expect(existsSync(path)).toBe(false);
  });
  it("reuses only unchanged Shared canonical encoding, never an engine runtime", () => {
    expect(violations('import { canonicalHash } from "../analysis-engines/shared/canonical";')).toEqual([]);
    expect(violations('import { z } from "zod"; export * from "./contracts";')).toEqual([]);
  });
  it.each([
    'import "@/lib/db";', 'import "@/generated/prisma/client";', 'import "../files/file-asset-service";',
    'import "@/lib/storage/document-storage";', 'import "../data-center/service";', 'import "../jenan-map/service";',
    'import "../analysis-engines/risk-decision";', 'import "../analysis-engines/shared/contracts";',
    'import "openai";', 'import "@azure/ai-form-recognizer";', 'import "node:fs";', 'import "node:child_process";',
    'import "node:net";', 'import "node:crypto";', 'import "pg";', 'import "ioredis";',
    'type T = import("@/lib/db").DbExecutor;', 'import x = require("fs");',
    'fetch("https://example.test");', 'globalThis["fetch"]("x");', 'process.env.KEY;',
    'console.log("raw");', 'require("fs");', 'import("openai");', 'eval("x");', 'new Function("x");',
    'Date.now();', 'new Date();', 'Date();', 'Math.random();', 'performance.now();',
  ])("rejects forbidden capability %s", (text) => expect(violations(text).length).toBeGreaterThan(0));
});
