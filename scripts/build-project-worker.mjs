import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

// Emit the worker's local module graph as native ESM; npm modules remain external.
const root = process.cwd();
const outputRoot = path.join(root, ".worker");
const visited = new Set();
await fs.rm(outputRoot, { recursive: true, force: true });

async function emit(sourcePath) {
  if (visited.has(sourcePath)) return;
  visited.add(sourcePath);
  const source = await fs.readFile(sourcePath, "utf8");
  const outputPath = path.join(outputRoot, path.relative(root, sourcePath).replace(/\.ts$/, ".mjs"));
  const dependencies = [];
  const transformer = (context) => (file) => {
    const visit = (node) => {
      if (ts.isStringLiteral(node) && (
        (ts.isImportDeclaration(node.parent) && node.parent.moduleSpecifier === node) ||
        (ts.isExportDeclaration(node.parent) && node.parent.moduleSpecifier === node) ||
        (ts.isCallExpression(node.parent) && node.parent.expression.kind === ts.SyntaxKind.ImportKeyword)
      )) {
        const specifier = node.text;
        if (specifier.startsWith("@/") || specifier.startsWith(".")) {
          let dependency = specifier.startsWith("@/") ? path.join(root, specifier.slice(2)) : path.resolve(path.dirname(sourcePath), specifier);
          if (!path.extname(dependency)) dependency += ".ts";
          if (dependency.endsWith(".ts")) {
            dependencies.push(dependency);
            let relative = path.relative(path.dirname(outputPath), path.join(outputRoot, path.relative(root, dependency))).replace(/\.ts$/, ".mjs");
            if (!relative.startsWith(".")) relative = `./${relative}`;
            return ts.factory.createStringLiteral(relative);
          }
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    return ts.visitNode(file, visit);
  };
  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, esModuleInterop: true },
    transformers: { before: [transformer] },
    reportDiagnostics: true,
  });
  if (diagnostics?.some((item) => item.category === ts.DiagnosticCategory.Error)) {
    throw new Error(`Worker compilation failed: ${path.relative(root, sourcePath)}`);
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, outputText);
  for (const dependency of dependencies) await emit(dependency);
}

await emit(path.join(root, "workers/project-analysis.ts"));
console.info(`Project analysis worker compiled (${visited.size} modules)`);
