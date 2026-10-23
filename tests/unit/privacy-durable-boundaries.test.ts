import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "services", "privacy-gateway", "durable");
const migration = readFileSync(resolve(process.cwd(), "prisma", "migrations", "20261023130000_privacy_gateway_durable", "migration.sql"), "utf8");
const admissionMigration = readFileSync(resolve(process.cwd(), "prisma", "migrations", "20261023160000_privacy_admission_recovery", "migration.sql"), "utf8");
describe("Privacy M4 additive persistence boundaries", () => {
  it("contains exactly seven scoped runtime modules with no activation surface", () => {
    expect(readdirSync(root).sort()).toEqual(["contracts.ts", "data-center.ts", "recovery-contracts.ts", "recovery.ts", "store.ts", "verification.ts", "workflow.ts"]);
    for (const parts of [["app", "api", "privacy-gateway"], ["workers", "privacy-gateway-worker.ts"]]) {
      expect(existsSync(resolve(process.cwd(), ...parts))).toBe(false);
    }
  });
  it("keeps every existing Prisma model/enum byte-identical to approved M3 after newline normalization", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma", "schema.prisma"), "utf8").replaceAll("\r\n", "\n");
    const baseline = execFileSync("git", ["show", "fc27c1495d7cb0f8526eeccf25e188404af4f3ee:prisma/schema.prisma"],
      { cwd: process.cwd(), encoding: "utf8", maxBuffer: 2 * 1024 * 1024 }).replaceAll("\r\n", "\n");
    expect(schema.slice(schema.indexOf("generator client"))).toBe(baseline);
    expect([...schema.slice(0, schema.indexOf("generator client")).matchAll(/^model (\w+)/gm)].map((match) => match[1]))
      .toEqual(["PrivacyClientPackage", "PrivacyAdmission", "PrivacyInventoryArtifact", "PrivacyAdmissionEvent",
        "PrivacyDurableJob", "PrivacyDurableEvent", "PrivacyDurableReceipt", "PrivacyDurableWork"]);
  });
  it("creates only Privacy tables, touches no frozen table and contains no destructive DDL", () => {
    expect([...migration.matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1]).sort())
      .toEqual(["PrivacyDurableEvent", "PrivacyDurableJob", "PrivacyDurableReceipt", "PrivacyDurableWork"]);
    for (const match of migration.matchAll(/ALTER TABLE "([^"]+)"/g)) expect(match[1]).toMatch(/^PrivacyDurable/);
    expect(migration).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bALTER TYPE\b|DELETE FROM|REFERENCES "(?!PrivacyDurable)/i);
    expect(migration).not.toMatch(/GRANT .* TO PUBLIC|GRANT jenan_privacy_\w+ TO/i);
  });
  it("keeps admission recovery DDL additive, Privacy-only and without automatic role membership", () => {
    expect([...admissionMigration.matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1]).sort())
      .toEqual(["PrivacyAdmission", "PrivacyAdmissionEvent", "PrivacyClientPackage", "PrivacyInventoryArtifact"]);
    for (const match of admissionMigration.matchAll(/(?:ALTER TABLE|REFERENCES) "([^"]+)"/g)) expect(match[1]).toMatch(/^Privacy/);
    expect(admissionMigration).not.toMatch(/\bDROP\b|\bTRUNCATE\b|DELETE FROM|GRANT .* TO PUBLIC|GRANT jenan_privacy_\w+ TO/i);
    for (const guard of ["privacy_package_complete", "privacy_admission_complete", "privacy_inventory_fence",
      "privacy_admission_event_order", "ENABLE ROW LEVEL SECURITY"]) expect(admissionMigration).toContain(guard);
    expect(admissionMigration).toContain('"stageAttempts" BETWEEN 0 AND 5');
  });
  it("keeps all restart-persistent filesystem and key fixtures outside runtime services", () => {
    const testAdapter = readFileSync(resolve(process.cwd(), "tests", "unit", "support", "privacy-restart-objects.ts"), "utf8");
    expect(testAdapter).toContain('readonly qualification = "TEST_ONLY"');
    expect(testAdapter).toContain('"aes-256-gcm"');
    for (const name of readdirSync(root)) expect(readFileSync(join(root, name), "utf8"))
      .not.toMatch(/privacy-restart-objects|node:fs|node:child_process|master\.test-key/);
  });
  it("does not persist RAW text, plaintext token mappings, key material or sensitive names", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma", "schema.prisma"), "utf8");
    const privacy = schema.slice(0, schema.indexOf("generator client"));
    expect(privacy).not.toMatch(/^\s+(?:rawText|content|plaintext|tokenMapping|secret|keyBytes|originalFilename|snippet|parserError)\s+/m);
    expect(privacy).toContain("keyRef");
    expect(privacy).toContain("scannerVersion");
  });
  it("uses PostgreSQL checkpoints and preserves the irreversible publication revocation boundary", () => {
    const recovery = readFileSync(join(root, "recovery.ts"), "utf8");
    expect(recovery).not.toMatch(/\bnew (?:Map|WeakMap|Set)\b|globalThis|latest/i);
    for (const expected of ['"STALE_ATTEMPT"', '"STALE_REVISION"', "revokePublished", "privacyAdmissionEvent",
      "privacyInventoryArtifact", 'a.taint === "RAW"', "published?.revokedAt"]) expect(recovery).toContain(expected);
  });
  it("does not expose RAW reading, key broker, parser, AI, network, filesystem or process capability to publisher", () => {
    const source = readFileSync(join(root, "data-center.ts"), "utf8");
    expect(source).not.toMatch(/withReadyRaw|KeyBoundary|readFile|fetch\(|https?:|process\.|openai|OCRClient|EphemeralIntake/);
    expect(source).toContain("createDataCenterItemInTransaction");
    expect(source).not.toMatch(/transitionDataCenterItem|reviewDataCenterItem|createDataCenterVersion|createDataCenterSource/);
    expect(source).toContain('evidenceStatus: "UNVERIFIED"');
  });
  it("limits all M4 imports to Privacy, Zod and the explicitly allowed database/Data Center interfaces", () => {
    const external = new Set(["zod", "@/generated/prisma/client", "@/lib/db", "@/services/data-center/contracts", "@/services/data-center/service"]);
    for (const name of readdirSync(root)) {
      const text = readFileSync(join(root, name), "utf8");
      const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
          const value = node.moduleSpecifier.text;
          expect(value.startsWith(".") || external.has(value) || name === "recovery.ts" && value === "node:crypto", value).toBe(true);
        }
        if (ts.isIdentifier(node)) expect(["console", "fetch", "process", "require", "eval", "Function", "globalThis"]).not.toContain(node.text);
        ts.forEachChild(node, visit);
      }
      visit(file);
    }
  });
});
