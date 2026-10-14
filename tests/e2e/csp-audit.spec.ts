import { PDFDocument } from "pdf-lib";
import { expect, test } from "@playwright/test";
import { crawl, expectNoFindings, origin } from "./crawler";
import { cleanE2EIdentities, createE2ESession, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

// Audits the content security policy against a PRODUCTION build, which is the only place the proxy sends it
// (`npm run build`, then `next start`). It visits the application as a member and as an administrator, listens for the
// browser's own `securitypolicyviolation` events, and fails on any violation. Run it with CSP_AUDIT=1; when the server is
// behind the private gate, also set CSP_AUDIT_GATE_USER and CSP_AUDIT_GATE_PASSWORD.
test.skip(process.env.CSP_AUDIT !== "1", "needs a production server: set CSP_AUDIT=1");

const gateUser = process.env.CSP_AUDIT_GATE_USER;
const gatePassword = process.env.CSP_AUDIT_GATE_PASSWORD;
if (gateUser && gatePassword) {
  test.use({ extraHTTPHeaders: { authorization: `Basic ${Buffer.from(`${gateUser}:${gatePassword}`).toString("base64")}` } });
}

interface Violation {
  blocked: string;
  directive: string;
  page: string;
  sample: string;
}

const RECORDER = `
  window.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__cspViolations.push({ blocked: event.blockedURI || "inline", directive: event.effectiveDirective, sample: (event.sample || "").slice(0, 80) });
  });
`;

test.describe.serial("content security policy audit", () => {
  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await seedE2EAdmin();
  });
  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  const violations: Violation[] = [];
  const collect = async (page: import("@playwright/test").Page, path: string) => {
    // Let late scripts, images and fetches settle so their violations are recorded too.
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    const found = (await page.evaluate("window.__cspViolations || []")) as Array<Omit<Violation, "page">>;
    for (const item of found) violations.push({ ...item, page: path });
  };
  const summarize = () => {
    const unique = new Map<string, Violation & { pages: number }>();
    for (const item of violations) {
      const key = `${item.directive}|${item.blocked}|${item.sample}`;
      const known = unique.get(key);
      if (known) known.pages += 1;
      else unique.set(key, { ...item, pages: 1 });
    }
    return [...unique.values()];
  };

  test("the public pages load without violations", async ({ page }) => {
    await page.addInitScript(RECORDER);
    for (const path of ["/", "/login", "/register", "/auth/forgot"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await collect(page, path);
      // Blocked scripts would leave the page static; the client runtime being present shows the policy lets it start.
      expect(await page.evaluate("typeof window.next"), `${path} must hydrate`).toBe("object");
    }
    expect(summarize(), JSON.stringify(summarize(), null, 2)).toEqual([]);
  });

  test("a member's application loads without violations", async ({ context, page }) => {
    test.setTimeout(25 * 60_000);
    await context.addCookies([
      { name: "jenan_session", value: await createE2ESession(e2eIdentity.user.email), url: origin, httpOnly: true, sameSite: "Lax" },
      { name: "locale", value: "en", url: origin },
    ]);
    await page.addInitScript(RECORDER);
    const { findings } = await crawl(
      page,
      ["/dashboard", "/projects", "/academy", "/market", "/talent", "/marketing", "/studio", "/software", "/programs", "/account", "/pricing", "/benefits"],
      140,
      true,
      { onVisited: collect },
    );
    expectNoFindings(findings);
    expect(summarize(), JSON.stringify(summarize(), null, 2)).toEqual([]);
  });

  test("the PDF preview (a blob object) and the Visual DNA tool load without violations", async ({ context, page }) => {
    await context.addCookies([
      { name: "jenan_session", value: await createE2ESession(e2eIdentity.user.email), url: origin, httpOnly: true, sameSite: "Lax" },
      { name: "locale", value: "en", url: origin },
    ]);
    await page.addInitScript(RECORDER);
    const document = await PDFDocument.create();
    document.addPage([300, 200]);
    await page.goto("/studio/pdf/editor", { waitUntil: "domcontentloaded" });
    await page.locator('input[type="file"]').first().setInputFiles({ name: "audit.pdf", mimeType: "application/pdf", buffer: Buffer.from(await document.save()) });
    await expect(page.locator(".studio-pdf-preview__stage object")).toBeVisible({ timeout: 15_000 });
    await collect(page, "/studio/pdf/editor (preview)");
    await page.goto("/studio/visual-dna", { waitUntil: "domcontentloaded" });
    await collect(page, "/studio/visual-dna");
    expect(summarize(), JSON.stringify(summarize(), null, 2)).toEqual([]);
  });

  test("an administrator's application loads without violations", async ({ context, page }) => {
    test.setTimeout(15 * 60_000);
    await context.addCookies([
      { name: "jenan_session", value: await createE2ESession(e2eIdentity.admin.email), url: origin, httpOnly: true, sameSite: "Lax" },
      { name: "locale", value: "en", url: origin },
    ]);
    await page.addInitScript(RECORDER);
    const { findings } = await crawl(page, ["/admin", "/admin/dashboard", "/admin/users", "/admin/academy", "/admin/operations"], 70, true, { onVisited: collect });
    expectNoFindings(findings);
    expect(summarize(), JSON.stringify(summarize(), null, 2)).toEqual([]);
  });
});
