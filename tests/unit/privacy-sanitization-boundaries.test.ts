import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "services", "privacy-gateway", "sanitization");
const allowed = new Set(["zod", "../contracts", "../policy", "../states", "../intake/contracts", "../intake/formats",
  "../intake/staging", "./contracts", "./classification", "./transform", "./verifier"]);
function capabilities(text: string, file: string) {
  const result: string[] = []; const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const specifier = (value: string) => {
    if (!allowed.has(value) && !(file.endsWith("service.ts") && value === "node:crypto")) result.push("IMPORT");
  };
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifier(node.moduleSpecifier.text);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) specifier(node.argument.literal.text);
    if (ts.isImportEqualsDeclaration(node)) result.push("REQUIRE");
    if (ts.isIdentifier(node) && ["fetch", "process", "console", "globalThis", "require", "eval", "Function",
      "setTimeout", "setInterval", "XMLHttpRequest", "WebSocket"].includes(node.text)) result.push("RUNTIME");
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) result.push("DYNAMIC");
    ts.forEachChild(node, visit);
  }
  visit(source); return result;
}
describe("M3 independent processing architecture", () => {
  it("contains exactly five bounded modules and no production provider", () => {
    const files = readdirSync(root);
    expect(files.sort()).toEqual(["classification.ts", "contracts.ts", "service.ts", "transform.ts", "verifier.ts"]);
    for (const file of files) expect(capabilities(readFileSync(join(root, file), "utf8"), file), file).toEqual([]);
  });
  it("independent verifier does not invoke sanitizer/token generator", () => {
    const text = readFileSync(join(root, "verifier.ts"), "utf8");
    expect(text).not.toMatch(/sanitizeTables\s*\(|randomBytes|\.push\(\{\s*kind,\s*original/);
    expect(text).toContain('import type { ReadyArtifact }');
  });
  it("allows only cryptographic random-byte generation from the crypto capability", () => {
    const text = readFileSync(join(root, "service.ts"), "utf8");
    expect(text).toContain('import { randomBytes } from "node:crypto"');
    expect(text).not.toMatch(/createHash|createCipher|readFile|\.env|https?:|PUBLISHING|SANITIZED_PUBLISHED/);
  });
  it("does not activate HTTP, worker, publication, UI or barrel exports", () => {
    for (const parts of [["app", "api", "privacy-gateway"], ["workers", "privacy-gateway-worker.ts"]]) {
      expect(existsSync(resolve(process.cwd(), ...parts))).toBe(false);
    }
    const barrel = readFileSync(resolve(root, "..", "index.ts"), "utf8");
    expect(barrel).not.toMatch(/sanitization|intake/);
  });
  it.each([
    'import "node:fs";', 'import "node:net";', 'import "node:child_process";', 'import "openai";',
    'import "../data-center/service";', 'import "../analysis-engines/shared/contracts";', 'import "node:crypto";',
    'fetch("x")', 'process.env.SECRET', 'console.log("raw")', 'globalThis.fetch("x")',
    'eval("raw")', 'new Function("raw")', 'import("openai")', 'type T = import("node:fs").T;',
  ])("rejects forbidden capability %s", (probe) => expect(capabilities(probe, "verifier.ts").length).toBeGreaterThan(0));
});
