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
  test.setTimeout(240_000);

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
    const csvDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV", exact: true }).click();
    expect((await csvDownload).suggestedFilename()).toBe("E2E sheet.csv");

    await page.goto("/studio/logo", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Project title").fill("E2E identity");
    await page.getByLabel("Brand name").fill("Verified Studio");
    await page.getByLabel("Initials").fill("VS");
    const pngDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "PNG", exact: true }).click();
    expect((await pngDownload).suggestedFilename()).toBe("E2E identity.png");

    await page.goto("/studio/pdf/editor", { waitUntil: "domcontentloaded" });
    const mergeForm = page.locator(".studio-pdf-editor form").filter({ hasText: "Merge files" });
    await mergeForm.locator('input[type="file"]').setInputFiles([
      { name: "studio-one.pdf", mimeType: "application/pdf", buffer: await createPdf("Studio one") },
      { name: "studio-two.pdf", mimeType: "application/pdf", buffer: await createPdf("Studio two") },
    ]);
    const pdfDownload = page.waitForEvent("download");
    await mergeForm.getByRole("button", { name: "Merge and download" }).click();
    expect((await pdfDownload).suggestedFilename()).toBe("jenan-merged.pdf");
    await expect(page.getByRole("status")).toContainText("created and downloaded");

    for (const route of STUDIO_FLOW_ROUTES) {
      const response = await page.goto(route.href, { waitUntil: "domcontentloaded" });
      expect(response?.status(), route.href).toBe(200);
      await expect(page.locator(".studio-flow")).toBeVisible();
      await expect(page.locator(".studio-flow__nav a.is-active")).toHaveAttribute("href", route.href);
      const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
      expect(layout.scrollWidth, route.href).toBeLessThanOrEqual(layout.viewportWidth + 1);
    }

    for (const viewport of acceptanceViewports) {
      await page.setViewportSize(viewport);
      for (const route of ["/studio", "/studio/docs", "/studio/sheets", "/studio/history"]) {
        expect((await page.goto(route, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
        const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
        expect(layout.scrollWidth, `${route} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
      }
    }
  });
});