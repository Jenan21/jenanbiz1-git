import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// The type check of this application's routes outgrows Node's default heap, and Next runs it in a child process,
// so the larger heap has to be passed through the environment rather than as an option of this process only.
const heapFlag = "--max-old-space-size=4096";
const existing = process.env.NODE_OPTIONS ?? "";
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

const child = spawn(process.execPath, [nextBin, "build", ...process.argv.slice(2)], {
  env: { ...process.env, NODE_OPTIONS: existing.includes("--max-old-space-size") ? existing : `${existing} ${heapFlag}`.trim() },
  stdio: "inherit",
});
child.on("close", (code) => {
  process.exitCode = code ?? 1;
});
child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
