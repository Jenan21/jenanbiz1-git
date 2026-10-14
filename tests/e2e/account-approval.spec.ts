import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { cleanE2EIdentities, createE2ESession, queryE2E, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";
const runId = process.env.E2E_RUN_ID ?? "local";
const applicantEmail = `e2e.user.pending.${runId}@example.test`;

test.describe.serial("Account approval", () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await seedE2EAdmin();
    await queryE2E(
      `INSERT INTO "User" (id, email, status, "systemRole", "createdAt", "updatedAt") VALUES ($1, $2, 'PENDING', 'USER', NOW(), NOW())`,
      [randomUUID(), applicantEmail],
    );
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("the register panel explains that the request waits for approval and offers no way to continue", async ({ context, page }) => {
    await context.addCookies([{ name: "locale", value: "en", url: origin }]);
    // The server answers like a public site that requires approval; the panel must show the waiting message.
    await page.route("**/api/auth/register", (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ status: "PENDING_APPROVAL" }) }));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/register");
    await expect(page.locator("#access-panel")).toBeVisible();
    await page.locator("#auth-name").fill("Waiting Person");
    await page.locator("#auth-email").fill("waiting.person@example.test");
    await page.locator('input[name="password"]').fill("Correct-horse-battery-12");
    await page.locator('input[name="confirmPassword"]').fill("Correct-horse-battery-12");
    await page.locator('input[name="terms"]').check({ force: true });
    await page.locator("#auth-register-form button[type=submit]").click();
    const pending = page.getByTestId("registration-pending");
    await expect(pending).toBeVisible();
    await expect(pending).toContainText("Registration request received");
    await expect(pending).toContainText("waiting for the owner's approval");
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.locator("#auth-register-form")).toHaveCount(0);
    await expect(pending.getByRole("link", { name: "Back to the home page" })).toHaveAttribute("href", "/");
  });

  test("the sign-in panel tells a waiting account to wait", async ({ context, page }) => {
    await context.addCookies([{ name: "locale", value: "en", url: origin }]);
    await page.route("**/api/auth/login", (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "PENDING_APPROVAL" }) }));
    await page.goto("/login");
    await page.locator("#auth-login-identifier").fill("waiting.person@example.test");
    await page.locator('input[name="password"]').fill("Correct-horse-battery-12");
    await page.locator("#auth-login-form button[type=submit]").click();
    await expect(page.locator(".auth-status[data-state=error]")).toContainText("waiting for the owner's approval");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an administrator sees the waiting request and approves it", async ({ browser }) => {
    const admin = await browser.newContext({ baseURL: origin, locale: "en-US", viewport: { width: 1440, height: 1000 } });
    try {
      await admin.addCookies([
        { name: "locale", value: "en", url: origin },
        { name: "jenan_session", value: await createE2ESession(e2eIdentity.admin.email), url: origin, httpOnly: true, sameSite: "Lax" },
      ]);
      const page = await admin.newPage();
      await page.goto("/admin/users");
      const card = page.getByTestId("pending-accounts");
      const row = card.getByTestId("pending-account").filter({ hasText: applicantEmail });
      await expect(row).toBeVisible({ timeout: 60_000 });
      await row.getByRole("button", { name: "Approve" }).click();
      await expect(card.getByRole("status")).toContainText(`${applicantEmail} approved`);
      await expect(row).toHaveCount(0);

      const status = await queryE2E<{ status: string }>(`SELECT status FROM "User" WHERE email = $1`, [applicantEmail]);
      expect(status.rows[0]?.status).toBe("ACTIVE");
      const audit = await queryE2E<{ n: string }>(`SELECT count(*)::text AS n FROM "AuditLog" WHERE action = 'account.approved' AND "entityId" IN (SELECT id FROM "User" WHERE email = $1)`, [applicantEmail]);
      expect(audit.rows[0]?.n).toBe("1");
    } finally {
      await admin.close();
    }
  });

  test("a member cannot reach the approval commands", async ({ browser }) => {
    const member = await browser.newContext({ baseURL: origin });
    try {
      await member.addCookies([{ name: "jenan_session", value: await createE2ESession(e2eIdentity.user.email), url: origin, httpOnly: true, sameSite: "Lax" }]);
      const response = await member.request.post("/api/admin/users", { headers: { origin }, data: { action: "approve", userId: "anything" } });
      expect(response.status()).toBe(403);
    } finally {
      await member.close();
    }
  });
});
