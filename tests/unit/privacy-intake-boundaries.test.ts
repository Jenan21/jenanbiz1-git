import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "services", "privacy-gateway", "intake");
const pure = ["archive.ts", "formats.ts", "contracts.ts"];
function imports(text: string, allowTimers = false) {
  const source = ts.createSourceFile("probe.ts", text, ts.ScriptTarget.Latest, true);
  const result: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) result.push(node.moduleSpecifier.text);
    if (ts.isIdentifier(node) && ["process", "globalThis", "require", "fetch", "eval", "Function", "console",
      "XMLHttpRequest", "WebSocket", "setInterval", ...(allowTimers ? [] : ["setTimeout"])].includes(node.text)) result.push("runtime-capability");
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) result.push("dynamic-import");
    ts.forEachChild(node, visit);
  }
  visit(source); return result;
}
describe("M2 parser capability and activation boundaries", () => {
  it("contains only the four explicit M2 modules", () => {
    expect(readdirSync(root).sort()).toEqual(["archive.ts", "contracts.ts", "formats.ts", "staging.ts"]);
  });
  it.each(pure)("keeps parser contract/module %s free from I/O, environment, network and dynamic execution", (name) => {
    const text = readFileSync(join(root, name), "utf8");
    const allowed = new Set(["zod", "../contracts", "../policy", "./contracts", "./formats"]);
    expect(imports(text).filter((value) => !allowed.has(value))).toEqual([]);
    expect(text).not.toMatch(/node:|https?:|\.env\b|DataCenter|Prisma|AIClient|OCRClient/);
  });
  it("provides no production transport, default key broker, scanner or storage fallback", () => {
    const text = readFileSync(join(root, "staging.ts"), "utf8");
    const allowed = new Set(["../contracts", "../policy", "../states", "./archive", "./contracts", "./formats"]);
    expect(imports(text, true).filter((value) => !allowed.has(value))).toEqual([]);
    expect(text).toContain('"TEST_ONLY"'); expect(text).not.toMatch(/https?:|console\.|fetch\(|process\.|RAW_DESTROYED"/);
    for (const path of ["app/api/privacy-gateway", "workers/privacy-gateway-worker.ts"]) {
      expect(existsSync(resolve(process.cwd(), ...path.split("/")))).toBe(false);
    }
  });
  it.each([
    'import "node:fs";', 'import "node:net";', 'import "node:child_process";', 'process.env.SECRET',
    'fetch("x")', 'globalThis.fetch("x")', 'eval("x")', 'new Function("x")', 'import("x")',
  ])("detects forbidden parser capability %s", (probe) => {
    expect(imports(probe).some((value) => !value.startsWith("."))).toBe(true);
  });
});
