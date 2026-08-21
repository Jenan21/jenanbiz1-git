import { execSync } from "node:child_process";

function run(command) {
  return execSync(command, { encoding: "utf8" }).trim();
}

function ok(label, value) {
  console.log(`PASS | ${label}: ${value}`);
}

function fail(label, value) {
  console.log(`FAIL | ${label}: ${value}`);
  process.exitCode = 1;
}

const expectedRepo = "https://github.com/Jenan21/jenanbiz1-git.git";

try {
  const topLevel = run("git rev-parse --show-toplevel");
  ok("Git workspace", topLevel);

  const branch = run("git branch --show-current");
  if (branch === "main") ok("Branch", branch);
  else fail("Branch", `${branch} (expected: main)`);

  const remotesRaw = run("git remote -v");
  const hasExpectedRemote = remotesRaw
    .split(/\r?\n/)
    .some((line) => line.includes("origin") && line.includes(expectedRepo));

  if (hasExpectedRemote) ok("Origin remote", expectedRepo);
  else fail("Origin remote", `Expected ${expectedRepo} but got:\n${remotesRaw}`);

  const enforceCleanTree = process.env.JENAN_VERIFY_CLEAN_TREE === "YES";
  const status = run("git status --short");
  if (!status) {
    ok("Working tree", "clean");
  } else if (enforceCleanTree) {
    fail("Working tree", "has pending local changes (clean tree required)");
  } else {
    ok("Working tree", "has pending local changes (allowed in local development)");
  }

  const requiredAdministrativeVerifications = [
    ["Slack channel (#all-jenanbiz1)", process.env.JENAN_VERIFY_SLACK],
    ["Notion workspace linkage", process.env.JENAN_VERIFY_NOTION],
    ["Google Drive/Sheets linkage", process.env.JENAN_VERIFY_DRIVE],
    ["Vercel policy (staging only)", process.env.JENAN_VERIFY_VERCEL],
  ];

  let pendingAdministrativeChecks = 0;

  for (const [name, value] of requiredAdministrativeVerifications) {
    if (value === "YES") ok(name, "confirmed");
    else {
      pendingAdministrativeChecks += 1;
      fail(name, "requires manual confirmation (set env to YES)");
    }
  }

  if (pendingAdministrativeChecks === 0) {
    console.log("\nSummary: Technical checks completed. Administrative checks are fully confirmed.");
  } else {
    console.log("\nSummary: Technical checks completed. Administrative checks require explicit confirmation.");
  }
} catch (error) {
  fail("Verification error", error instanceof Error ? error.message : String(error));
}
