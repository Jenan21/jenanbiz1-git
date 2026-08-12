import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);
const isWindows = process.platform === "win32";
const nodeBin = process.execPath;
const nextBin = new URL("../node_modules/next/dist/bin/next", import.meta.url);
const playwrightBin = new URL(
  "../node_modules/@playwright/test/cli.js",
  import.meta.url,
);

const server = spawn(
  nodeBin,
  [fileURLToPath(nextBin), "dev", "--hostname", "127.0.0.1", "--port", "3101"],
  {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: "development" },
    stdio: "inherit",
    detached: !isWindows,
  },
);

async function waitUntilReady() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(
        "The Playwright application server exited before readiness",
      );
    try {
      const response = await fetch("http://127.0.0.1:3101/login");
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the Playwright application server");
}

async function stopProcess(child) {
  if (child.exitCode !== null) return;
  if (isWindows) {
    child.kill();
    await new Promise((resolve) => {
      const killer = spawn(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        {
          stdio: "ignore",
        },
      );
      killer.unref();
      killer.on("close", resolve);
      killer.on("error", resolve);
      setTimeout(resolve, 2_000);
    });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
}

let exitCode = 1;
try {
  await waitUntilReady();
  const tests = spawn(
    nodeBin,
    [fileURLToPath(playwrightBin), "test", ...process.argv.slice(2)],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    },
  );
  const closePromise = new Promise((resolve, reject) => {
    tests.on("close", resolve);
    tests.on("error", reject);
  });
  let recentOutput = "";
  const forward = (stream, destination) => {
    stream.on("data", (chunk) => {
      destination.write(chunk);
      recentOutput = `${recentOutput}${chunk}`.slice(-32_768);
    });
  };
  forward(tests.stdout, process.stdout);
  forward(tests.stderr, process.stderr);
  exitCode = await closePromise.then((code) => code ?? 1);
} finally {
  await stopProcess(server);
}

process.exitCode = exitCode;
