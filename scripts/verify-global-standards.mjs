import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function pass(label, value) {
  console.log(`PASS | ${label}: ${value}`);
}

function fail(label, value) {
  console.log(`FAIL | ${label}: ${value}`);
  process.exitCode = 1;
}

function requireFile(path) {
  if (existsSync(resolve(process.cwd(), path))) {
    pass("Artifact", path);
  } else {
    fail("Artifact", `Missing ${path}`);
  }
}

const root = process.cwd();
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);

const scripts = packageJson.scripts ?? {};
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
};

const appConfigSource = readFileSync(resolve(root, "config/app.ts"), "utf8");
if (
  appConfigSource.includes("defaultLocale: \"ar\"") &&
  appConfigSource.includes("supportedLocales: [\"ar\", \"en\"]")
) {
  pass("AR/EN locale baseline", "default ar + supported ar/en");
} else {
  fail("AR/EN locale baseline", "app locale configuration is incomplete");
}

const i18nSource = readFileSync(resolve(root, "lib/i18n/index.ts"), "utf8");
if (
  i18nSource.includes("locale === \"ar\" ? \"rtl\" : \"ltr\"") ||
  i18nSource.includes("return locale === \"ar\" ? \"rtl\" : \"ltr\"")
) {
  pass("RTL/LTR direction baseline", "deterministic locale-to-direction mapping");
} else {
  fail("RTL/LTR direction baseline", "locale direction mapping not found");
}

const requiredScripts = [
  "lint",
  "typecheck",
  "build",
  "test",
  "test:e2e:visual",
  "verify:connections",
  "verify:architecture",
];

for (const scriptName of requiredScripts) {
  if (scripts[scriptName]) pass("Quality gate script", scriptName);
  else fail("Quality gate script", `Missing script ${scriptName}`);
}

if (dependencies["@node-rs/argon2"]) pass("Security dependency", "argon2 present");
else fail("Security dependency", "@node-rs/argon2 missing");

if (dependencies.zod) pass("Validation dependency", "zod present");
else fail("Validation dependency", "zod missing");

if (dependencies["@playwright/test"]) pass("E2E dependency", "playwright present");
else fail("E2E dependency", "@playwright/test missing");

const requiredTests = [
  "tests/e2e/visual-layout.spec.ts",
  "tests/e2e/auth.spec.ts",
  "tests/unit/rate-limit.test.ts",
  "tests/integration/auth.integration.test.ts",
];
for (const testFile of requiredTests) requireFile(testFile);

const visualSpec = readFileSync(
  resolve(root, "tests/e2e/visual-layout.spec.ts"),
  "utf8",
);
if (
  visualSpec.includes('toHaveAttribute("lang", locale)') &&
  visualSpec.includes('toHaveAttribute(') &&
  visualSpec.includes('"dir"')
) {
  pass("Accessibility/i18n visual assertions", "lang + dir assertions present");
} else {
  fail("Accessibility/i18n visual assertions", "lang/dir assertions missing");
}

const playwrightConfig = readFileSync(
  resolve(root, "playwright.config.ts"),
  "utf8",
);
const viewportKinds = ["desktop", "laptop", "tablet", "mobile"];
const missingViewports = viewportKinds.filter(
  (viewport) => !playwrightConfig.includes(`\"${viewport}\"`) && !playwrightConfig.includes(`'${viewport}'`),
);
if (missingViewports.length === 0) {
  pass("Multi-device baseline", "desktop/laptop/tablet/mobile configured");
} else {
  fail(
    "Multi-device baseline",
    `Missing viewport configurations: ${missingViewports.join(", ")}`,
  );
}

console.log("\nSummary: Global standards baseline verification completed.");
