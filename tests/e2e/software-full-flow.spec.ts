import { expect, test } from "@playwright/test";

import { SOFTWARE_FLOW_ROUTES } from "@/lib/software/software-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";
const acceptanceViewports = [
  { width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 1024, height: 1366 },
  { width: 820, height: 1180 }, { width: 430, height: 932 }, { width: 390, height: 844 }, { width: 360, height: 800 },
] as const;

test.describe.serial("Jenan Software full flow", () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("completes sales and payroll workflows and renders all 24 routes", async ({ context, page }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([
      { name: "jenan_session", value: sessionToken, url: origin, httpOnly: true, sameSite: "Lax" },
      { name: "locale", value: "en", url: origin },
    ]);
    const organizationResponse = await page.request.post("/api/software/operations", { headers: { origin }, data: { action: "createOrganization", name: "E2E Software Company" } });
    expect(organizationResponse.status()).toBe(201);

    await page.goto("/software/sales/customers", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Customer name").fill("E2E Customer");
    await page.getByPlaceholder("Email").fill("buyer@example.test");
    const customerResponse = page.waitForResponse((response) => response.url().endsWith("/api/software/operations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save customer" }).click();
    expect((await customerResponse).status()).toBe(201);
    await expect(page.locator(".software-table")).toContainText("E2E Customer");

    await page.goto("/software/sales/products", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("SKU").fill("E2E-SKU");
    await page.getByPlaceholder("Product name").fill("E2E Product");
    await page.getByPlaceholder("Sale price").fill("100");
    await page.getByPlaceholder("Cost").fill("60");
    await page.getByPlaceholder("Initial stock").fill("20");
    await page.getByPlaceholder("Reorder level").fill("4");
    const productResponse = page.waitForResponse((response) => response.url().endsWith("/api/software/operations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save product" }).click();
    expect((await productResponse).status()).toBe(201);
    await expect(page.locator(".software-table")).toContainText("E2E Product");

    await page.goto("/software/sales/invoices", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Customer").selectOption({ label: "E2E Customer" });
    await page.getByLabel("Product").selectOption({ label: "E2E-SKU · E2E Product" });
    await page.getByLabel("Quantity").fill("2");
    const invoiceResponse = page.waitForResponse((response) => response.url().endsWith("/api/software/operations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create" }).click();
    expect((await invoiceResponse).status()).toBe(201);
    const invoiceRow = page.locator(".software-table tbody tr").filter({ hasText: "E2E Customer" });
    await expect(invoiceRow).toContainText("SAR 230.00");
    await invoiceRow.locator("select").selectOption("ISSUED");
    const issueResponse = page.waitForResponse((response) => response.url().endsWith("/api/software/operations") && response.request().method() === "POST");
    await invoiceRow.getByRole("button", { name: "Apply" }).click();
    expect((await issueResponse).status()).toBe(200);
    await expect(invoiceRow).toContainText("ISSUED");

    await page.goto("/software/sales/receipts", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Invoice").selectOption({ index: 1 });
    await page.getByPlaceholder("Amount").fill("230");
    await page.getByPlaceholder("Payment reference").fill("E2E-BANK-001");
    const receiptResponse = page.waitForResponse((response) => response.url().endsWith("/api/software/operations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Record collection" }).click();
    expect((await receiptResponse).status()).toBe(201);
    await expect(page.locator(".software-table")).toContainText("E2E-BANK-001");

    await page.goto("/software/hr/employees", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Employee number").fill("EMP-E2E");
    await page.getByPlaceholder("Name").fill("E2E Employee");
    await page.getByPlaceholder("Role title").fill("Operations Manager");
    await page.getByPlaceholder("Monthly salary").fill("12000");
    await page.getByLabel("Hire date").fill("2026-01-01");
    const employeeResponse = page.waitForResponse((response) => response.url().endsWith("/api/software/operations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save employee" }).click();
    expect((await employeeResponse).status()).toBe(201);
    await expect(page.locator(".software-table")).toContainText("E2E Employee");

    await page.goto("/software/hr/payroll", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Period start").fill("2026-09-01");
    await page.getByLabel("Period end").fill("2026-09-30");
    const payrollResponse = page.waitForResponse((response) => response.url().endsWith("/api/software/operations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create draft" }).click();
    expect((await payrollResponse).status()).toBe(201);
    const payrollRow = page.locator(".software-table tbody tr").first();
    await expect(payrollRow).toContainText("DRAFT");
    const postResponse = page.waitForResponse((response) => response.url().endsWith("/api/software/operations") && response.request().method() === "POST");
    await payrollRow.getByRole("button", { name: "Post" }).click();
    expect((await postResponse).status()).toBe(200);
    await expect(payrollRow).toContainText("POSTED");

    await page.goto("/software/accounting", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".software-table")).toContainText("Receipt");
    await expect(page.locator(".software-table")).toContainText("Payroll");

    for (const route of SOFTWARE_FLOW_ROUTES) {
      const response = await page.goto(route.route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), route.route).toBe(200);
      await expect(page.locator(".software-erp")).toBeVisible();
      await expect(page.locator(".software-erp")).toHaveAttribute("data-software-route", route.route);
      await expect(page.locator(".software-erp")).toHaveAttribute("data-software-module", route.id);
      await expect(page.locator(".software-erp")).toHaveAttribute("data-software-section", route.section);
      await expect(page.locator(".software-erp")).toHaveAttribute("data-software-source", "ORGANIZATION_RECORDS");
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, route.route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }

    for (const viewport of acceptanceViewports) {
      await page.setViewportSize(viewport);
      for (const route of ["/software", "/software/sales/invoices", "/software/hr/payroll", "/software/reports"]) {
        expect((await page.goto(route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
        const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
        expect(layout.scrollWidth, `${route} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }
  });
});