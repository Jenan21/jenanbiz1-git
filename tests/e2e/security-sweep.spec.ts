import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import { cleanE2EIdentities, createE2ESession, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

// A black-box sweep of every API route the application declares. It reads the routes from the source tree, so a route
// added tomorrow is covered without touching this file, and a new public route has to be allowed here on purpose.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;
const origin = new URL(baseURL).origin;
const SAMPLE_ID = "cmnonexistent00000000000000";
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

interface RouteDefinition {
  methods: Method[];
  pattern: string;
  url: string;
}

function discoverRoutes(): RouteDefinition[] {
  const root = path.join(process.cwd(), "app", "api");
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "route.ts") files.push(full);
    }
  };
  walk(root);
  return files
    .map((file) => {
      const pattern = `/api${path.relative(root, path.dirname(file)).split(path.sep).filter(Boolean).map((part) => `/${part}`).join("")}`;
      const source = readFileSync(file, "utf8");
      const methods = METHODS.filter((method) => new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`).test(source));
      const url = pattern.replace(/\[\[?\.\.\.[^\]]+\]\]?/g, "x").replace(/\[provider\]/g, "google").replace(/\[[^\]]+\]/g, SAMPLE_ID);
      return { methods, pattern, url };
    })
    .filter((route) => route.methods.length)
    .sort((a, b) => a.pattern.localeCompare(b.pattern));
}

const routes = discoverRoutes();

// Routes that are reachable without signing in, each with the reason. Anything else must answer 401 or 403.
const PUBLIC: Array<{ method: Method; pattern: RegExp; reason: string }> = [
  { method: "GET", pattern: /^\/api\/health\/(live|ready)$/, reason: "health probes" },
  { method: "GET", pattern: /^\/api\/auth\/country$/, reason: "country list for the registration form" },
  { method: "POST", pattern: /^\/api\/auth\/logout$/, reason: "clearing a session that does not exist is harmless" },
  { method: "GET", pattern: /^\/api\/auth\/oauth\/\[provider\]\/(start|callback)$/, reason: "OAuth redirects" },
  { method: "POST", pattern: /^\/api\/auth\/oauth\/\[provider\]\/callback$/, reason: "Apple posts the OAuth callback" },
  { method: "GET", pattern: /^\/api\/platform\/(activity|social-links)$/, reason: "truthful public home data" },
  { method: "POST", pattern: /^\/api\/security\/csp-report$/, reason: "browsers send violation reports without credentials" },
];
// The credential endpoints are public by design and have their own throttling and tests; the sweep leaves them alone.
const CREDENTIAL_ROUTES = /^\/api\/auth\/(login|register|forgot)$/;
const isPublic = (method: Method, pattern: string) => PUBLIC.some((entry) => entry.method === method && entry.pattern.test(pattern));

const LEAK = /PrismaClient|prisma\.\w+\.\w+|Invalid `|\bat (?:Object|async|Module|Function)\b|node_modules|[A-Z]:\\Users\\|\/vercel\/|\/app\/\.next|\.ts:\d+:\d+|passwordHash|\$argon2|BEGIN (?:RSA|EC|PRIVATE)/;

async function call(context: APIRequestContext, method: Method, url: string, options: { body?: string; headers?: Record<string, string> } = {}) {
  const response = await context.fetch(url, {
    data: options.body,
    failOnStatusCode: false,
    headers: { ...(options.body === undefined ? {} : { "content-type": "application/json" }), origin, ...options.headers },
    maxRedirects: 0,
    method,
    timeout: 60_000,
  });
  return { response, text: await response.text().catch(() => "") };
}

async function sessionContext(email: string) {
  return playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { cookie: `jenan_session=${await createE2ESession(email)}` } });
}

test.describe.serial("security sweep of every API route", () => {
  let anonymous: APIRequestContext;
  let member: APIRequestContext;
  let admin: APIRequestContext;

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await seedE2EAdmin();
    anonymous = await playwrightRequest.newContext({ baseURL });
    member = await sessionContext(e2eIdentity.user.email);
    admin = await sessionContext(e2eIdentity.admin.email);
  });

  test.afterAll(async () => {
    await Promise.all([anonymous?.dispose(), member?.dispose(), admin?.dispose()]);
    await cleanE2EIdentities();
  });

  test("the sweep sees the whole API surface", () => {
    expect(routes.length).toBeGreaterThan(60);
    expect(routes.some((route) => route.pattern === "/api/projects/[projectId]/report")).toBe(true);
  });

  test("a caller without a session is refused everywhere except the declared public routes", async () => {
    test.setTimeout(10 * 60_000);
    const findings: string[] = [];
    for (const route of routes) {
      if (CREDENTIAL_ROUTES.test(route.pattern)) continue;
      for (const method of route.methods) {
        if (isPublic(method, route.pattern)) continue;
        const { response, text } = await call(anonymous, method, route.url, { body: method === "GET" ? undefined : "{}" });
        if (![401, 403].includes(response.status())) findings.push(`${method} ${route.pattern} -> ${response.status()}`);
        if (LEAK.test(text)) findings.push(`${method} ${route.pattern} leaks internals`);
      }
    }
    expect(findings, findings.join("\n")).toEqual([]);
  });

  test("an ordinary member never reaches an administrator route", async () => {
    test.setTimeout(5 * 60_000);
    const findings: string[] = [];
    // The academy route also serves scoped academy managers, so it validates the command before it checks the scope;
    // probing it with an administrator-only command shows the authorization answer.
    const probeBody: Record<string, string> = { "/api/admin/academy": JSON.stringify({ action: "refreshCertificationExpiry" }) };
    for (const route of routes.filter((item) => item.pattern.startsWith("/api/admin/") || item.pattern === "/api/marketing/payment-requests")) {
      for (const method of route.methods) {
        const { response } = await call(member, method, route.url, { body: method === "GET" ? undefined : (probeBody[route.pattern] ?? "{}") });
        if (response.status() !== 403) findings.push(`${method} ${route.pattern} -> ${response.status()}`);
      }
    }
    expect(findings, findings.join("\n")).toEqual([]);
  });

  test("a request from another site cannot change anything, even with a valid session", async () => {
    test.setTimeout(10 * 60_000);
    const findings: string[] = [];
    for (const route of routes) {
      if (CREDENTIAL_ROUTES.test(route.pattern) || route.pattern === "/api/security/csp-report" || /^\/api\/auth\/oauth\//.test(route.pattern)) continue;
      for (const method of route.methods.filter((item) => item !== "GET")) {
        const context = route.pattern.startsWith("/api/admin/") || route.pattern === "/api/marketing/payment-requests" ? admin : member;
        const { response } = await call(context, method, route.url, { body: "{}", headers: { origin: "https://evil.example" } });
        if (response.status() !== 403) findings.push(`${method} ${route.pattern} -> ${response.status()}`);
      }
    }
    expect(findings, findings.join("\n")).toEqual([]);
  });

  test("hostile input never produces a server error or leaks internals", async () => {
    test.setTimeout(20 * 60_000);
    const nested = `${"{\"a\":".repeat(1500)}1${"}".repeat(1500)}`;
    const payloads: Array<[string, string]> = [
      ["truncated JSON", '{"action":'],
      ["null", "null"],
      ["array", "[]"],
      ["prototype pollution", '{"action":"__proto__","constructor":{"prototype":{"polluted":true}},"__proto__":{"polluted":true}}'],
      ["oversized string", JSON.stringify({ action: "x".repeat(300_000), name: "y".repeat(300_000) })],
      ["deep nesting", nested],
      ["injection strings", JSON.stringify({ action: "' OR 1=1 --", email: "a@b.c\u0000", name: "<script>alert(1)</script>", id: "../../etc/passwd", limit: -1, offset: "abc" })],
      ["wrong types", JSON.stringify({ action: 1, id: {}, email: [], limit: "NaN", amountMinor: 1e308, content: null })],
    ];
    const queries = ["?limit=-1&offset=abc&q=%00", "?limit=999999999&offset=999999999999", "?q=%27%20OR%201%3D1--&page=0", `?id=${encodeURIComponent("../../etc/passwd")}&organizationId=${SAMPLE_ID}&projectId=${SAMPLE_ID}`];
    const findings: string[] = [];
    for (const route of routes) {
      if (CREDENTIAL_ROUTES.test(route.pattern) || /^\/api\/auth\/oauth\//.test(route.pattern)) continue;
      const context = route.pattern.startsWith("/api/admin/") || route.pattern === "/api/marketing/payment-requests" ? admin : member;
      for (const method of route.methods) {
        const attempts: Array<[string, string, string | undefined]> =
          method === "GET" ? queries.map((query) => [`GET ${query}`, `${route.url}${query}`, undefined]) : payloads.map(([name, body]) => [name, route.url, body]);
        for (const [name, url, body] of attempts) {
          const { response, text } = await call(context, method, url, { body });
          if (response.status() >= 500) findings.push(`${method} ${route.pattern} (${name}) -> ${response.status()}`);
          else if (LEAK.test(text)) findings.push(`${method} ${route.pattern} (${name}) leaks internals`);
        }
      }
    }
    expect(findings, findings.join("\n")).toEqual([]);
  });

  test("the API is still healthy after the sweep", async () => {
    const { response, text } = await call(anonymous, "GET", "/api/health/live");
    expect(response.status()).toBe(200);
    expect(text).toContain('"status":"live"');
  });
});
