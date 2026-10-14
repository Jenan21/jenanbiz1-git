#!/usr/bin/env node
// Load and resilience test for a running Jenan PRO server (normally `next start` of a production build).
//
//   node --env-file=.env scripts/loadtest.mjs [--duration 15] [--scale 1] [--only health-live,login-flood]
//
// Environment: LOADTEST_BASE_URL (default http://127.0.0.1:3102), DATABASE_URL (to seed a throw-away member and remove
// it afterwards), LOADTEST_GATE_USER / LOADTEST_GATE_PASSWORD when the server runs behind the private gate.
// Point it at a local or staging server only: it generates sustained traffic and sign-in failures on purpose.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import autocannon from "autocannon";
import pg from "pg";

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const baseUrl = new URL(process.env.LOADTEST_BASE_URL ?? "http://127.0.0.1:3102");
const origin = baseUrl.origin;
const duration = Number(option("duration", "15"));
const scale = Number(option("scale", "1"));
const only = option("only", "")?.split(",").filter(Boolean);
const gate = process.env.LOADTEST_GATE_USER && process.env.LOADTEST_GATE_PASSWORD
  ? `Basic ${Buffer.from(`${process.env.LOADTEST_GATE_USER}:${process.env.LOADTEST_GATE_PASSWORD}`).toString("base64")}`
  : null;

if (!["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname) && process.env.LOADTEST_ALLOW_REMOTE !== "yes") {
  console.error(`Refusing to load ${baseUrl.hostname}: set LOADTEST_ALLOW_REMOTE=yes if you really mean a remote server you own.`);
  process.exit(2);
}

const runLabel = randomBytes(4).toString("hex");
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2, allowExitOnIdle: true }) : null;
let seeded = null;

async function seedMember() {
  if (!pool) return null;
  const userId = randomUUID();
  const token = randomBytes(32).toString("base64url");
  const email = `loadtest.${runLabel}@example.test`;
  await pool.query('INSERT INTO "User" (id, email, status, "systemRole", "createdAt", "updatedAt") VALUES ($1, $2, \'ACTIVE\', \'USER\', NOW(), NOW())', [userId, email]);
  await pool.query(
    'INSERT INTO "Profile" (id, "userId", "displayName", locale, language, "countryCode", timezone, "createdAt", "updatedAt") VALUES ($1, $2, \'Load test member\', \'en\', \'en\', \'SA\', \'Asia/Riyadh\', NOW(), NOW())',
    [randomUUID(), userId],
  );
  await pool.query(
    'INSERT INTO "Session" (id, "userId", "tokenHash", "expiresAt", "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW() + INTERVAL \'2 hours\', NOW(), NOW())',
    [randomUUID(), userId, createHash("sha256").update(token).digest("hex")],
  );
  return { token, userId };
}

async function removeMember() {
  if (!pool || !seeded) return;
  const ids = [seeded.userId];
  await pool.query('DELETE FROM "Project" WHERE "createdById" = ANY($1::text[])', [ids]);
  await pool.query('DELETE FROM "AuditLog" WHERE "actorId" = ANY($1::text[])', [ids]);
  await pool.query('DELETE FROM "User" WHERE id = ANY($1::text[])', [ids]);
}

const baseHeaders = () => ({ ...(gate ? { authorization: gate } : {}) });
const memberHeaders = () => ({ ...baseHeaders(), cookie: `jenan_session=${seeded.token}` });
const json = { "content-type": "application/json", origin };

const randomIp = () => `${(Math.random() * 223 + 1) | 0}.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${(Math.random() * 254 + 1) | 0}`;

const MEMBER_READ_PATHS = ["/api/projects", "/api/market", "/api/talent", "/api/dashboard", "/api/account/overview", "/api/academy/catalog", "/api/notifications", "/api/studio/documents"];
const MEMBER_PAGE_PATHS = ["/dashboard", "/projects", "/market", "/academy", "/talent", "/studio", "/account"];

/** One scenario per route, so a single slow endpoint shows up instead of hiding in an average. Run with --each. */
const eachRouteScenarios = [...MEMBER_READ_PATHS, ...MEMBER_PAGE_PATHS].map((path) => ({
  name: `route ${path}`,
  connections: 10,
  duration: Math.min(duration, 5),
  requests: [{ path }],
  headers: memberHeaders,
  needs: "member",
}));

/** Each scenario states what must hold. `serverErrors` counts 5xx answers, `dropped` counts timeouts and broken connections. */
const scenarios = [
  { name: "health-live", connections: 100, requests: [{ path: "/api/health/live" }], needs: "none" },
  { name: "health-ready", connections: 100, requests: [{ path: "/api/health/ready" }], needs: "none" },
  { name: "spike-500", connections: 500, duration: Math.min(duration, 10), requests: [{ path: "/api/health/live" }], needs: "none" },
  { name: "gate-flood", connections: 200, requests: [{ path: "/" }, { path: "/dashboard" }, { path: "/api/projects" }], headers: () => ({}), needs: "gate", expectStatus: [401] },
  { name: "public-home", connections: 50, requests: [{ path: "/" }, { path: "/login" }, { path: "/register" }], headers: baseHeaders, needs: "none" },
  {
    name: "member-api-reads",
    connections: 50,
    requests: MEMBER_READ_PATHS.map((path) => ({ path })),
    headers: memberHeaders,
    needs: "member",
  },
  { name: "member-pages", connections: 30, requests: MEMBER_PAGE_PATHS.map((path) => ({ path })), headers: memberHeaders, needs: "member" },
  {
    name: "member-writes",
    connections: 20,
    requests: [{ method: "POST", path: "/api/projects", headers: json, body: JSON.stringify({ action: "create", name: "Load test project", sector: "Logistics", countryCode: "SA" }) }],
    headers: memberHeaders,
    needs: "member",
    tolerated: [201, 400, 409, 429],
  },
  {
    name: "login-flood",
    connections: 100,
    requests: [{ method: "POST", path: "/api/auth/login", headers: json, setupRequest: (req) => ({ ...req, body: JSON.stringify({ email: `flood.${randomBytes(4).toString("hex")}@example.test`, password: "A-wrong-password-1" }) }) }],
    headers: baseHeaders,
    needs: "none",
    tolerated: [400, 401, 403, 429, 503],
    probe: true,
  },
  {
    name: "login-botnet",
    connections: 100,
    requests: [{ method: "POST", path: "/api/auth/login", headers: json, setupRequest: (req) => ({ ...req, headers: { ...req.headers, "x-forwarded-for": randomIp() }, body: JSON.stringify({ email: `botnet.${randomBytes(4).toString("hex")}@example.test`, password: "A-wrong-password-1" }) }) }],
    headers: baseHeaders,
    needs: "none",
    tolerated: [400, 401, 403, 429, 503],
    probe: true,
  },
];

function summarize(result, scenario) {
  const statuses = result.statusCodeStats ?? {};
  const total = result.requests.total || 1;
  const count = (predicate) => Object.entries(statuses).filter(([code]) => predicate(Number(code))).reduce((sum, [, value]) => sum + value.count, 0);
  const serverErrors = count((code) => code >= 500 && !(scenario.tolerated ?? []).includes(code));
  const dropped = (result.errors ?? 0) + (result.timeouts ?? 0);
  const unexpected = scenario.expectStatus ? count((code) => !scenario.expectStatus.includes(code)) : scenario.tolerated ? count((code) => !scenario.tolerated.includes(code) && code < 500) : count((code) => code >= 300 && code < 400 ? false : code >= 400);
  return { dropped, name: scenario.name, p50: result.latency.p50, p99: result.latency.p99, max: result.latency.max, rps: Math.round(result.requests.average), serverErrors, statuses: Object.fromEntries(Object.entries(statuses).map(([code, value]) => [code, value.count])), total, unexpected };
}

async function run(scenario) {
  const headers = (scenario.headers ?? baseHeaders)();
  const settings = {
    url: origin,
    connections: Math.max(1, Math.round(scenario.connections * scale)),
    duration: scenario.duration ?? duration,
    timeout: 30,
    headers,
    requests: scenario.requests.map((request) => ({ method: "GET", ...request, headers: { ...headers, ...(request.headers ?? {}) } })),
  };
  const tasks = [autocannon(settings)];
  let probe;
  if (scenario.probe) {
    // While the abuse runs, a handful of ordinary visitors must still get answers.
    probe = autocannon({ url: origin, connections: 5, duration: scenario.duration ?? duration, timeout: 30, headers: baseHeaders(), requests: [{ method: "GET", path: "/api/health/live" }] });
    tasks.push(probe);
  }
  const [result, probeResult] = await Promise.all(tasks);
  return { summary: summarize(result, scenario), probe: probeResult ? summarize(probeResult, { name: `${scenario.name}/visitors` }) : null };
}

const pad = (value, width) => String(value).padEnd(width);
const line = (item) => `${pad(item.name, 22)} ${pad(item.rps + " rps", 10)} p50 ${pad(item.p50 + "ms", 8)} p99 ${pad(item.p99 + "ms", 8)} max ${pad(item.max + "ms", 8)} 5xx ${pad(item.serverErrors, 5)} dropped ${pad(item.dropped, 4)} ${JSON.stringify(item.statuses)}`;

const failures = [];
try {
  seeded = await seedMember();
  const selected = (argv.includes("--each") ? eachRouteScenarios : scenarios).filter((scenario) => (only?.length ? only.includes(scenario.name) : true));
  for (const scenario of selected) {
    if (scenario.needs === "member" && !seeded) {
      console.log(`${pad(scenario.name, 22)} skipped (needs DATABASE_URL to seed a member)`);
      continue;
    }
    if (scenario.needs === "gate" && !gate) {
      console.log(`${pad(scenario.name, 22)} skipped (needs LOADTEST_GATE_USER / LOADTEST_GATE_PASSWORD, i.e. a gated server)`);
      continue;
    }
    const { summary, probe } = await run(scenario);
    console.log(line(summary));
    if (probe) console.log(`  ${line(probe)}`);
    if (summary.serverErrors > 0) failures.push(`${summary.name}: ${summary.serverErrors} server errors`);
    if (summary.dropped / summary.total > 0.01) failures.push(`${summary.name}: ${summary.dropped} dropped connections or timeouts`);
    if (summary.unexpected > 0) failures.push(`${summary.name}: ${summary.unexpected} answers outside the expected statuses`);
    if (probe && (probe.serverErrors > 0 || probe.dropped > 0 || probe.p99 > 5_000)) failures.push(`${summary.name}: ordinary visitors suffered (p99 ${probe.p99}ms, 5xx ${probe.serverErrors}, dropped ${probe.dropped})`);
    // Let queues and sockets drain before the next scenario so one does not bleed into the next.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
} finally {
  await removeMember().catch((error) => console.error("cleanup failed:", error.message));
  await pool?.end().catch(() => undefined);
}

if (failures.length) {
  console.error(`\nFAILED\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("\nAll scenarios held: no server errors, no dropped connections, and ordinary visitors stayed served.");
}
