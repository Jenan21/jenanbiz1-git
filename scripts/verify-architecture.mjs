import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

function pass(label, value) {
  console.log(`PASS | ${label}: ${value}`);
}

function fail(label, value) {
  console.log(`FAIL | ${label}: ${value}`);
  process.exitCode = 1;
}

const root = process.cwd();
const packageJsonPath = resolve(root, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const dependencies = {
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
};

const requiredFiles = [
  "config/app.ts",
  "config/env.ts",
  "config/feature-flags.ts",
  "config/country-rules.ts",
  "services/index.ts",
  "services/providers.contracts.ts",
  "packages/visual-dna/src/index.ts",
  "packages/token-compiler/src/index.ts",
  "packages/pdf-engine/src/index.ts",
  "packages/sheets-engine/src/index.ts",
  "packages/docs-engine/src/index.ts",
];

for (const file of requiredFiles) {
  const full = resolve(root, file);
  if (existsSync(full)) pass("Required artifact", file);
  else fail("Required artifact", `Missing ${file}`);
}

const forbiddenCoreDependencies = [
  "@supabase/supabase-js",
  "@neondatabase/serverless",
  "airtable",
  "firebase",
  "mongodb",
  "mongoose",
  "mysql2",
  "sqlite3",
  "better-sqlite3",
];

for (const dep of forbiddenCoreDependencies) {
  if (dependencies[dep]) {
    fail("Forbidden core dependency", `${dep} must not be in core dependencies`);
  }
}
pass("Forbidden dependency policy", "No disallowed core providers detected");

if (dependencies["@prisma/client"]) pass("Core DB contract", "Prisma client present");
else fail("Core DB contract", "@prisma/client is required");

if (dependencies["@prisma/adapter-pg"]) pass("PostgreSQL adapter", "Prisma PG adapter present");
else fail("PostgreSQL adapter", "@prisma/adapter-pg is required");

const providerPattern = /supabase|@supabase|@neondatabase|airtable|firebase|mongoose|mongodb/i;
const textFilePattern = /\.(ts|tsx|js|mjs|cjs|json|md)$/i;
const ignoredPathPattern = /[\\/](node_modules|\.next|\.git|dist|coverage)[\\/]/i;

function walkFiles(startDir, files = []) {
  const entries = readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(startDir, entry.name);
    if (ignoredPathPattern.test(fullPath)) continue;
    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
    } else if (textFilePattern.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const filesToScan = walkFiles(root);
const matches = [];
for (const filePath of filesToScan) {
  if (filePath.endsWith("scripts\\verify-architecture.mjs")) continue;
  if (filePath.endsWith("scripts/verify-architecture.mjs")) continue;
  let content = "";
  try {
    if (statSync(filePath).size > 1_500_000) continue;
    content = readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  if (providerPattern.test(content)) {
    matches.push(filePath);
  }
}

if (!matches.length) {
  pass("Forbidden imports scan", "No forbidden provider imports detected in source files");
} else {
  const nonDocs = matches.filter((line) => !line.toLowerCase().endsWith("readme.md"));
  if (nonDocs.length === 0) {
    pass("Forbidden imports scan", "Only documentation mentions detected");
  } else {
    fail("Forbidden imports scan", `Potential forbidden imports in:\n${nonDocs.join("\n")}`);
  }
}

console.log("\nSummary: Architecture policy checks completed.");
