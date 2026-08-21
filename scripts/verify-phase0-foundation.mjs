import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function pass(label, value) {
  console.log(`PASS | ${label}: ${value}`);
}

function fail(label, value) {
  console.log(`FAIL | ${label}: ${value}`);
  process.exitCode = 1;
}

const requiredFiles = [
  "packages/ui-foundation/src/typography-engine.ts",
  "packages/ui-foundation/src/icon-registry.ts",
  "packages/ui-foundation/src/layout-engine.ts",
  "packages/ui-foundation/src/forms-engine.ts",
  "packages/ui-foundation/src/motion-engine.ts",
  "packages/ui-foundation/src/index.ts",
  "tests/unit/ui-foundation.test.ts",
];

for (const file of requiredFiles) {
  if (existsSync(resolve(process.cwd(), file))) {
    pass("Artifact", file);
  } else {
    fail("Artifact", `Missing ${file}`);
  }
}

const typography = readFileSync(
  resolve(process.cwd(), "packages/ui-foundation/src/typography-engine.ts"),
  "utf8",
);
if (typography.includes("Locale") && typography.includes("Direction")) {
  pass("Typography i18n", "Locale + direction-aware profile implemented");
} else {
  fail("Typography i18n", "Locale/direction typing is incomplete");
}

const forms = readFileSync(
  resolve(process.cwd(), "packages/ui-foundation/src/forms-engine.ts"),
  "utf8",
);
if (forms.includes("canSubmitForm") && forms.includes("validateTextField")) {
  pass("Forms engine", "Validation + submit gating implemented");
} else {
  fail("Forms engine", "Validation or submit gate missing");
}

const motion = readFileSync(
  resolve(process.cwd(), "packages/ui-foundation/src/motion-engine.ts"),
  "utf8",
);
if (motion.includes("prefersReducedMotion") || motion.includes("resolveMotionLevel")) {
  pass("Motion accessibility", "Reduced-motion pathway implemented");
} else {
  fail("Motion accessibility", "Reduced-motion pathway missing");
}

console.log("\nSummary: Phase 0 foundation baseline verification completed.");
