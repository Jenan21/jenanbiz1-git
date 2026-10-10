import { expect, test } from "@playwright/test";
import { Document, Packer, Paragraph } from "docx";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { SOFTWARE_EXPERIENCE_ROUTES } from "@/lib/software/software-experience-routes";
import { SOFTWARE_FLOW_ROUTES } from "@/lib/software/software-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";
const acceptanceViewports = [
  { width: 2560, height: 1440 }, { width: 1920, height: 1080 }, { width: 1440, height: 900 },
  { width: 1366, height: 768 }, { width: 1280, height: 800 }, { width: 1024, height: 1366 },
  { width: 820, height: 1180 }, { width: 430, height: 932 }, { width: 390, height: 844 }, { width: 360, height: 800 },
] as const;

async function createPdf(label: string) {
  const document = await PDFDocument.create();
  const page = document.addPage([420, 240]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 40, y: 130, font, size: 18 });
  return Buffer.from(await document.save());
}

test.describe.serial("Jenan Software full flow", () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("completes tools, design, sales, and payroll workflows and renders every route", async ({ context, page }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([
      { name: "jenan_session", value: sessionToken, url: origin, httpOnly: true, sameSite: "Lax" },
      { name: "locale", value: "en", url: origin },
    ]);

    for (const route of SOFTWARE_EXPERIENCE_ROUTES) {
      const response = await page.goto(route.route, { waitUntil: "domcontentloaded" });
      expect(response?.status(), route.route).toBe(200);
      if (route.kind === "design-editor") await expect(page.locator(".studio-flow")).toHaveAttribute("data-studio-route", route.route);
      else await expect(page.locator("[data-software-route]")).toHaveAttribute("data-software-route", route.route);
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, route.route).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const imageConversion = await page.request.post("/api/software/documents", {
      headers: { origin },
      multipart: { action: "imagesToPdf", files: { name: "verified.png", mimeType: "image/png", buffer: png }, orientation: "landscape", pageSize: "LETTER" },
    });
    expect(imageConversion.status()).toBe(200);
    expect(imageConversion.headers()["content-type"]).toContain("application/pdf");

    const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Verified software conversion")] }] }));
    const wordConversion = await page.request.post("/api/software/documents", {
      headers: { origin },
      multipart: { action: "docxToPdf", files: { name: "verified.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docx } },
    });
    expect(wordConversion.status()).toBe(200);
    expect(wordConversion.headers()["content-type"]).toContain("application/pdf");

    const sourcePdf = await createPdf("Verified PDF extraction");
    const pdfToWord = await page.request.post("/api/software/documents", {
      headers: { origin },
      multipart: { action: "pdfToDocx", files: { name: "verified.pdf", mimeType: "application/pdf", buffer: sourcePdf } },
    });
    expect(pdfToWord.status()).toBe(200);
    expect(pdfToWord.headers()["content-type"]).toContain("wordprocessingml.document");

    const pdfToExcel = await page.request.post("/api/software/documents", {
      headers: { origin },
      multipart: { action: "pdfToXlsx", files: { name: "verified.pdf", mimeType: "application/pdf", buffer: sourcePdf } },
    });
    expect(pdfToExcel.status()).toBe(200);
    expect(pdfToExcel.headers()["content-type"]).toContain("spreadsheetml.sheet");

    const sourceWorkbook = new ExcelJS.Workbook();
    sourceWorkbook.addWorksheet("Verified").addRow(["Metric", "Value"]);
    const xlsx = Buffer.from(await sourceWorkbook.xlsx.writeBuffer());
    const excelToPdf = await page.request.post("/api/software/documents", {
      headers: { origin },
      multipart: { action: "xlsxToPdf", files: { name: "verified.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: xlsx } },
    });
    expect(excelToPdf.status()).toBe(200);
    expect(excelToPdf.headers()["content-type"]).toContain("application/pdf");

    const organizationResponse = await page.request.post("/api/software/operations", { headers: { origin }, data: { action: "createOrganization", name: "E2E Software Company" } });
    expect(organizationResponse.status()).toBe(201);

    await page.goto("/software/company", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Branch code").fill("RUH");
    await page.getByPlaceholder("Branch name").fill("Riyadh HQ");
    await page.getByPlaceholder("City").fill("Riyadh");
    const branchResponse = page.waitForResponse((response) => response.url().endsWith("/api/software/operations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Create branch" }).click();
    expect((await branchResponse).status()).toBe(201);
    await expect(page.locator(".software-company-branches__list")).toContainText("Riyadh HQ");
    await page.getByLabel("Default branch").selectOption({ label: "RUH · Riyadh HQ" });
    await page.getByLabel("Invoice prefix").fill("SALE");
    const settingsResponse = page.waitForResponse((response) => response.url().endsWith("/api/software/operations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save settings" }).click();
    expect((await settingsResponse).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText("Operating settings saved");

    await page.goto("/software/sales/customers", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Customer name").fill("E2E Customer");
    await page.getByPlaceholder("Email").fill("buyer@example.test");
    const customerResponse = page.waitForResponse((response) => response.url().endsWith("/api/software/operations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save customer" }).click();
    expect((await customerResponse).status()).toBe(201);
    await expect(page.locator(".software-table")).toContainText("E2E Customer");
    await expect(page.locator(".software-route-outputs")).toContainText("1 records");
    const customerExport = page.waitForEvent("download");
    await page.locator(".software-route-outputs").getByRole("button", { name: "CSV" }).click();
    expect((await customerExport).suggestedFilename()).toBe("jenan-customers.csv");

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
    await expect(page.locator('[data-accounting-statement="income"]')).toContainText("SAR 230.00");
    await expect(page.locator('[data-accounting-statement="income"]')).toContainText("SAR 12,000.00");
    await page.getByRole("button", { name: "Balance sheet" }).click();
    await expect(page.locator('[data-accounting-statement="balance"]')).toContainText("Inventory at cost");
    await expect(page.locator('[data-accounting-statement="balance"]')).toContainText("Balance sheet incomplete");
    await page.getByRole("button", { name: "Cash flow" }).click();
    await expect(page.locator('[data-accounting-statement="cash"]')).toContainText("Invoice receipts");
    await expect(page.locator('[data-accounting-statement="cash"]')).toContainText("Payroll");

    await page.goto("/software/crm", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Opportunity name").fill("E2E Pipeline");
    await page.getByPlaceholder("Expected value").fill("1000");
    await page.getByPlaceholder("Next action").fill("Discovery call");
    const leadResponse = page.waitForResponse((response) => response.url().endsWith("/api/software/operations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Add lead" }).click();
    expect((await leadResponse).status()).toBe(201);
    await expect(page.locator('[data-software-analytics="crm"]')).toContainText("SAR 100.00");
    await expect(page.locator('[data-software-analytics="crm"]')).toContainText("Lead created");

    await page.goto("/software/inventory", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-software-analytics="inventory"]')).toContainText("Inventory value at cost");
    await expect(page.locator('[data-software-analytics="inventory"]')).toContainText("E2E Product");

    await page.goto("/software/purchases", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-software-analytics="purchases"]')).toContainText("Supplier invoices");
    await expect(page.locator('[data-software-analytics="purchases"]')).toContainText("NOT_CONNECTED");

    await page.goto("/software/pos", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-software-analytics="pos"]')).toContainText("Riyadh HQ");

    await page.goto("/software/projects", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-software-analytics="projects"]')).toContainText("Work phases, time, budget, and team");

    await page.goto("/software/reports", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-report-section="sales"]')).toContainText("Sales report");
    for (const report of ["Finance", "HR", "Inventory", "CRM", "Projects"]) {
      await page.getByRole("button", { name: report, exact: true }).click();
      await expect(page.locator(".software-unified-reports")).toHaveAttribute("data-report-section", report.toLocaleLowerCase());
    }

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

  });

  for (const [label, viewports] of [["desktop", acceptanceViewports.slice(0, 5)], ["compact", acceptanceViewports.slice(5)]] as const) {
    test(`keeps approved and operational software routes responsive on ${label} viewports`, async ({ context, page }) => {
      const sessionToken = await createE2ESession(e2eIdentity.user.email);
      await context.addCookies([
        { name: "jenan_session", value: sessionToken, url: origin, httpOnly: true, sameSite: "Lax" },
        { name: "locale", value: "en", url: origin },
      ]);
      for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of ["/software", "/software/files", "/software/files/images-to-pdf", "/software/files/word-to-pdf", "/software/design", "/software/design/cv", "/software/business", "/software/sales/invoices", "/software/accounting", "/software/inventory", "/software/crm", "/software/projects", "/software/pos", "/software/purchases", "/software/company", "/software/hr/payroll", "/software/reports"]) {
        expect((await page.goto(route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
        const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
        expect(layout.scrollWidth, `${route} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
      }
    });
  }
});