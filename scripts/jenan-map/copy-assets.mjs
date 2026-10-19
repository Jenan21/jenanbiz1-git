// Copies the MapLibre worker and its license into public/jenan-map. Plain Node so it runs the same on Windows, macOS and Linux.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = join(root, "node_modules", "maplibre-gl", "dist");
const target = join(root, "public", "jenan-map");
const files = [
  ["maplibre-gl-worker.mjs", "maplibre-gl-worker.mjs"],
  ["../LICENSE.txt", "maplibre-LICENSE.txt"],
];

mkdirSync(target, { recursive: true });
for (const [from, to] of files) {
  const path = join(source, from);
  if (!existsSync(path)) {
    console.error(`jenan-map:assets: ${path} is missing; run "npm install" first.`);
    process.exit(1);
  }
  copyFileSync(path, join(target, to));
}
console.log("jenan-map:assets: MapLibre worker and license copied to public/jenan-map");
