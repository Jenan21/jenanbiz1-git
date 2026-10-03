import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { STUDIO_FLOW_ROUTES } from "@/lib/studio/studio-routes";
import { cleanE2EIdentities, createE2ESession, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";
const acceptanceViewports = [
  { width: 2560, height: 1440 },
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1024, height: 1366 },
  { width: 820, height: 1180 },
  { width: 430, height: 932 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
] as const;

async function createPdf(label: string) {
  const document = await PDFDocument.create();
  const page = document.addPage([420, 240]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 40, y: 130, font, size: 18 });
  return Buffer.from(await document.save());
}

test.describe.serial("Jenan Studio full flow", () => {
  test.setTimeout(600_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("saves and restores versions, exports supported formats, and renders every route", async ({ context, page }) => {
    const sessionToken = await createE2ESession(e2eIdentity.user.email);
    await context.addCookies([
      { name: "jenan_session", value: sessionToken, url: origin, httpOnly: true, sameSite: "Lax" },
      { name: "locale", value: "en", url: origin },
    ]);

    await page.goto("/studio/docs", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".studio-editor--docs")).toBeVisible();
    await page.getByLabel("Project title").fill("E2E operations memo");
    await page.getByLabel("Document content").fill("Version one: approved operating direction.");
    await page.getByLabel("Document header").fill("Verified operations");
    await page.getByLabel("Document footer").fill("Controlled document");
    await page.getByLabel("Document style").selectOption("editorial");
    await expect(page.locator(".studio-paper")).toHaveClass(/studio-paper--editorial/);
    await expect(page.locator(".studio-paper > header")).toHaveText("Verified operations");
    await expect(page.locator(".studio-paper > footer")).toHaveText("Controlled document");
    const docxDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "DOCX", exact: true }).click();
    expect((await docxDownload).suggestedFilename()).toBe("E2E operations memo.docx");
    const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/studio/documents") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save version" }).click();
    expect((await createResponse).status()).toBe(201);
    await expect(page.getByRole("status")).toContainText("Version 1 saved");

    await page.getByLabel("Document content").fill("Version two: revised operating direction.");
    const updateResponse = page.waitForResponse((response) => response.url().endsWith("/api/studio/documents") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save version" }).click();
    expect((await updateResponse).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText("Version 2 saved");

    await page.goto("/studio/history", { waitUntil: "domcontentloaded" });
    const documentRecord = page.locator(".studio-history__documents article").filter({ hasText: "E2E operations memo" });
    await expect(documentRecord).toBeVisible();
    await documentRecord.locator("summary").click();
    const restoreResponse = page.waitForResponse((response) => response.url().endsWith("/api/studio/documents") && response.request().method() === "POST");
    await documentRecord.locator("details button").filter({ hasText: "v1" }).click();
    expect((await restoreResponse).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText("Version 1 restored as version 3");
    const historyPayload = await (await page.request.get("/api/studio/documents?kind=DOCS")).json();
    const restored = historyPayload.documents.find((document: { title: string }) => document.title === "E2E operations memo");
    expect(restored.currentVersion).toBe(3);
    expect(restored.content.body).toContain("Version one");

    await page.goto("/studio/sheets", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Project title").fill("E2E sheet");
    await page.getByLabel("Cell 2-1").fill("Verified row");
    await page.getByLabel("Cell 2-2").fill("10");
    await page.getByLabel("Cell 3-2").fill("=B2*2");
    await expect(page.locator(".studio-sheet-grid td").filter({ has: page.getByLabel("Cell 3-2") }).locator("small")).toHaveText("20");
    await expect(page.locator(".studio-sheet-kpis")).toContainText("30");
    await expect(page.locator(".studio-sheet-kpis")).toContainText("15");
    await page.getByLabel("Filter column 1").selectOption("0");
    await page.getByLabel("Filter value 1").fill("Verified");
    await expect(page.locator(".studio-sheet-grid tr")).toHaveCount(2);
    await expect(page.locator(".studio-sheet-kpis")).toContainText("1");
    const csvDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV", exact: true }).click();
    expect((await csvDownload).suggestedFilename()).toBe("E2E sheet.csv");
    const xlsxDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "XLSX", exact: true }).click();
    expect((await xlsxDownload).suggestedFilename()).toBe("E2E sheet.xlsx");

    await page.goto("/studio/presentations", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Project title").fill("E2E presentation");
    await page.getByLabel("Slide title").fill("Verified operations");
    await page.getByLabel("Slide content").fill("Evidence, execution, and measurable outcomes.");
    await page.getByLabel("Slide layout").selectOption("statement");
    await page.getByRole("button", { name: "Paper brief" }).click();
    await expect(page.locator(".studio-slide")).toHaveClass(/studio-slide--theme-paper/);
    await page.getByLabel("Slide chart data").fill("Q1:20,Q2:35");
    await expect(page.locator(".studio-slide__chart > span")).toHaveCount(2);
    const pptxDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "PPTX", exact: true }).click();
    expect((await pptxDownload).suggestedFilename()).toBe("E2E presentation.pptx");

    await page.goto("/studio/logo", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Project title").fill("E2E identity");
    await page.getByLabel("Brand name").fill("Verified Studio");
    await page.getByLabel("Initials").fill("VS");
    const pngDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "PNG", exact: true }).click();
    expect((await pngDownload).suggestedFilename()).toBe("E2E identity.png");
    const svgDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "SVG", exact: true }).click();
    expect((await svgDownload).suggestedFilename()).toBe("E2E identity.svg");

    await page.goto("/studio/pdf/editor", { waitUntil: "domcontentloaded" });
    const mergeForm = page.locator(".studio-pdf-editor form").filter({ hasText: "Merge files" });
    await mergeForm.locator('input[type="file"]').setInputFiles([
      { name: "studio-one.pdf", mimeType: "application/pdf", buffer: await createPdf("Studio one") },
      { name: "studio-two.pdf", mimeType: "application/pdf", buffer: await createPdf("Studio two") },
    ]);
    await expect(page.locator(".studio-pdf-preview__pages li")).toHaveCount(2);
    await expect(page.locator(".studio-pdf-preview__stage object")).toHaveAttribute("data", /^blob:/);
    await expect(page.locator(".studio-pdf-preview__plan")).toContainText("Merge PDF");
    const pdfDownload = page.waitForEvent("download");
    await mergeForm.getByRole("button", { name: "Merge and download" }).click();
    expect((await pdfDownload).suggestedFilename()).toBe("jenan-merged.pdf");
    await expect(page.getByRole("status")).toContainText("created and downloaded");
    const advancedForm = page.locator(".studio-pdf-advanced");
    await advancedForm.getByLabel("PDF operation").selectOption("rotate");
    await advancedForm.locator('input[type="file"]').setInputFiles({ name: "studio-rotate.pdf", mimeType: "application/pdf", buffer: await createPdf("Rotate me") });
    const rotateDownload = page.waitForEvent("download");
    await advancedForm.getByRole("button", { name: "Process and download" }).click();
    expect((await rotateDownload).suggestedFilename()).toBe("jenan-rotate.pdf");

    await page.goto("/studio/pdf", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".studio-pdf-catalog__signals article")).toHaveCount(4);
    await expect(page.locator(".studio-tool-card")).toHaveCount(11);
    await expect(page.locator(".studio-pdf-output")).toContainText("PDF");
    await expect(page.locator(".studio-pdf-catalog__action").getByRole("link")).toHaveAttribute("href", "/studio/pdf/editor");
    await expect(page.getByRole("link", { name: /Redaction/ })).toBeVisible();

    const expectedOutputs = new Map([
      ["dashboard", "NONE"], ["pdf", "PDF"], ["pdf-editor", "PDF"], ["docs", "DOCX,PRINT_PDF"], ["sheets", "XLSX,CSV,PRINT_PDF"],
      ["presentations", "PPTX,PRINT_PDF"], ["logo", "PNG,SVG,PRINT_PDF"], ["letterhead", "DOCX,PRINT_PDF"], ["cv", "PRINT_PDF"], ["history", "VERSIONING"],
    ]);

    for (const route of STUDIO_FLOW_ROUTES) {
      const response = await page.goto(route.href, { waitUntil: "domcontentloaded" });
      expect(response?.status(), route.href).toBe(200);
      await expect(page.locator(".studio-flow")).toBeVisible();
      await expect(page.locator(".studio-flow")).toHaveAttribute("data-studio-route", route.href);
      await expect(page.locator(".studio-flow")).toHaveAttribute("data-studio-tool", route.id);
      await expect(page.locator(".studio-flow")).toHaveAttribute("data-studio-output", expectedOutputs.get(route.id)!);
      await expect(page.locator(".studio-flow__nav a.is-active")).toHaveAttribute("href", route.href);
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, route.href).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }

    for (const viewport of acceptanceViewports) {
      await page.setViewportSize(viewport);
      for (const route of STUDIO_FLOW_ROUTES) {
        expect((await page.goto(route.href, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
        const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
        expect(layout.scrollWidth, `${route.href} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }
  });
});