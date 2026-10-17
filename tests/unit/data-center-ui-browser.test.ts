import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chromium, expect as browserExpect, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATA_CENTER_SECTIONS, dataCenterHref } from "@/lib/admin/data-center-routes";

const enabled = process.env.DATA_CENTER_UI_BROWSER === "1";
const origin = process.env.DATA_CENTER_UI_ORIGIN ?? "http://127.0.0.1:3103";
const viewports = [[2560, 1440], [1920, 1080], [1440, 900], [1366, 768], [1280, 800], [1024, 1366], [820, 1180], [430, 932], [390, 844], [360, 800]] as const;

describe.runIf(enabled)("authenticated Data Center UI browser acceptance", () => {
  const userId = randomUUID();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const sourceName = `UI source ${suffix}`;
  const typeKey = `ui.${suffix}`;
  const itemTitle = `UI dataset ${suffix}`;
  const categoryKey = `ui-cat.${suffix}`;
  const departmentKey = `ui-dept.${suffix}`;
  let db: Client;
  let browser: Browser;
  let page: Page;
  const errors: string[] = [];

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl || !["localhost", "127.0.0.1", "postgres"].includes(new URL(databaseUrl).hostname)) throw new Error("Browser acceptance requires an explicitly local test database.");
    db = new Client({ connectionString: databaseUrl });
    await db.connect();
    await db.query('INSERT INTO "User" (id,email,status,"systemRole","createdAt","updatedAt") VALUES ($1,$2,\'ACTIVE\',\'ADMIN\',NOW(),NOW())', [userId, `data-center-ui.${suffix}@example.test`]);
    const token = randomBytes(32).toString("base64url");
    await db.query('INSERT INTO "Session" (id,"userId","tokenHash","expiresAt","createdAt","updatedAt") VALUES ($1,$2,$3,NOW()+INTERVAL \'1 hour\',NOW(),NOW())', [randomUUID(), userId, createHash("sha256").update(token).digest("hex")]);
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: "jenan_session", value: token, url: origin }]);
    page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
  }, 30000);

  afterAll(async () => {
    if (!db) return;
    try {
      // Keep immutable evidence intact: archive local fixtures, never disable database triggers.
      const items = await db.query('SELECT id,status FROM "DataCenterItem" WHERE "createdById"=$1', [userId]);
      for (const item of items.rows) {
        if (item.status === "ARCHIVED") continue;
        const command = async (status: string) => {
          const response = await page.request.post(`${origin}/api/admin/data-center`, { headers: { origin }, data: { action: "transition-item", itemId: item.id, status, reason: "Local browser acceptance fixture cleanup" } });
          expect(response.ok()).toBe(true);
        };
        if (item.status === "IN_REVIEW") await command("DRAFT");
        await command("ARCHIVED");
      }
      await db.query('DELETE FROM "DataCenterSource" s WHERE s."ownerId"=$1 AND NOT EXISTS (SELECT 1 FROM "DataCenterItem" i WHERE i."sourceId"=s.id)', [userId]);
      await db.query('DELETE FROM "DataCenterType" t WHERE t.key=$1 AND NOT EXISTS (SELECT 1 FROM "DataCenterItem" i WHERE i."typeKey"=t.key)', [typeKey]);
      await db.query('DELETE FROM "DataCenterCategory" c WHERE c.key=$1 AND NOT EXISTS (SELECT 1 FROM "DataCenterType" t WHERE t."categoryKey"=c.key)', [categoryKey]);
      await db.query('DELETE FROM "DataCenterDepartment" d WHERE d.key=$1 AND NOT EXISTS (SELECT 1 FROM "DataCenterType" t WHERE t."departmentKey"=d.key)', [departmentKey]);
    } finally {
      await db.query('DELETE FROM "Session" WHERE "userId"=$1', [userId]);
      await db.query('UPDATE "User" SET status=\'SUSPENDED\',"systemRole"=\'USER\',"updatedAt"=NOW() WHERE id=$1', [userId]);
      await browser?.close();
      await db.end();
    }
  }, 30000);

  async function goto(section: (typeof DATA_CENTER_SECTIONS)[number]["key"]) {
    await page.goto(`${origin}${dataCenterHref(section)}`, { waitUntil: "networkidle" });
    await browserExpect(page.getByTestId("data-center-workspace")).toHaveAttribute("data-section", section);
    await browserExpect(page.locator('[data-testid="data-center-workspace"] [aria-busy]')).toHaveAttribute("aria-busy", "false");
  }
  async function submitForm(title: string, fields: Record<string, string>, selects: Record<string, string> = {}) {
    const form = page.getByRole("form", { name: title });
    for (const [name, value] of Object.entries(fields)) await form.locator(`[name="${name}"]`).fill(value);
    for (const [name, value] of Object.entries(selects)) await form.locator(`[name="${name}"]`).selectOption(value);
    await form.getByRole("button", { name: title, exact: true }).click();
    await browserExpect(page.getByText(/تم حفظ الإجراء في مركز البيانات/)).toBeVisible();
  }
  async function inspect() {
    await page.locator("article").filter({ hasText: itemTitle }).getByRole("button", { name: "التفاصيل", exact: true }).click();
    await browserExpect(page.getByRole("heading", { name: "تفاصيل السجل والإصدارات" })).toBeVisible();
  }

  it("creates, reviews, approves, publishes, retrieves and exports an actual persisted record", async () => {
    await goto("settings");
    await page.getByRole("button", { name: "تسجيل فئة", exact: true }).click();
    await submitForm("تسجيل فئة", { key: categoryKey, label: `UI category ${suffix}` });
    await page.getByRole("button", { name: "تسجيل قسم", exact: true }).click();
    await submitForm("تسجيل قسم", { key: departmentKey, label: `UI department ${suffix}` });
    await page.getByRole("button", { name: "تسجيل نوع", exact: true }).click();
    await submitForm("تسجيل نوع", { key: typeKey, label: `UI Type ${suffix}`, categoryKey, departmentKey }, { layer: "DATA", requiresIndependentReview: "false" });
    await goto("sources");
    await page.getByRole("button", { name: "إضافة مصدر", exact: true }).click();
    await submitForm("إضافة مصدر", { name: sourceName, owner: "UI acceptance fixture", license: "Test content, redistribution allowed" }, { scope: "PLATFORM", allowExport: "true" });
    const source = await db.query('SELECT id FROM "DataCenterSource" WHERE name=$1 AND "ownerId"=$2', [sourceName, userId]);
    await goto("data");
    await page.getByRole("button", { name: "إنشاء سجل", exact: true }).click();
    const form = page.getByRole("form", { name: "إنشاء سجل" });
    await browserExpect(form.locator('[name="sourceId"] option').filter({ hasText: sourceName })).toHaveCount(1);
    await submitForm("إنشاء سجل", { title: itemTitle, content: `Searchable evidence ${suffix}` }, { sourceId: source.rows[0].id, typeKey, layer: "DATA" });
    await inspect();
    await page.getByRole("button", { name: "تغيير الحالة / النشر", exact: true }).click();
    await submitForm("تغيير حالة السجل", { reason: "Request human review of test evidence" }, { status: "IN_REVIEW" });
    await inspect();
    await page.getByRole("button", { name: "مراجعة بشرية", exact: true }).click();
    await submitForm("قرار المراجعة البشرية", { notes: "Fixture evidence reviewed; remains explicitly unverified" }, { decision: "APPROVED" });
    for (const status of ["APPROVED", "PUBLISHED"]) {
      await inspect();
      await page.getByRole("button", { name: "تغيير الحالة / النشر", exact: true }).click();
      await submitForm("تغيير حالة السجل", { reason: `Human decision: ${status}` }, { status });
    }
    await goto("robot-knowledge");
    await page.locator('form').filter({ has: page.locator('[name="mode"]') }).locator('[name="query"]').fill(suffix);
    await page.getByRole("button", { name: "استرجاع المعرفة", exact: true }).click();
    await browserExpect(page.getByText("النتائج: 1", { exact: true })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير JSON", exact: true }).click();
    const exported = await download;
    expect(exported.suggestedFilename()).toBe("jenan-pro-data-center.json");
    const stream = await exported.createReadStream();
    let content = "";
    for await (const chunk of stream) content += chunk.toString();
    expect(content).toContain(itemTitle);
  }, 180000);

  it("loads all fifteen pages and checks every required viewport after API loading", async () => {
    const serviceErrors: string[] = [];
    for (const section of DATA_CENTER_SECTIONS) {
      await goto(section.key);
      if (await page.getByTestId("data-center-workspace").getByRole("alert").count()) serviceErrors.push(`${section.key}: ${await page.getByTestId("data-center-workspace").getByRole("alert").allTextContents()}`);
      const formAction = section.key === "data" ? "إنشاء سجل" : section.key === "sources" ? "إضافة مصدر" : section.key === "settings" ? "تسجيل نوع" : null;
      if (formAction) {
        await page.getByRole("button", { name: formAction, exact: true }).click();
        await browserExpect(page.getByRole("form", { name: formAction })).toBeVisible();
      }
      if (process.env.DATA_CENTER_UI_SCREENSHOTS && ["overview", "data", "sources"].includes(section.key)) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({ path: `${process.env.DATA_CENTER_UI_SCREENSHOTS}/${section.key}.png`, fullPage: true });
      }
      for (const [width, height] of viewports) {
        await page.setViewportSize({ width, height });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${section.key} at ${width}x${height}`).toBe(true);
      }
    }
    expect(errors).toEqual([]);
    expect(serviceErrors).toEqual([]);
  }, 240000);
});
