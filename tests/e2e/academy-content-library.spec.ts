import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { cleanE2EIdentities, createE2ESession, queryE2E, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;

test.describe.serial("academy approved content library", () => {
  test.setTimeout(120_000);
  const resourceIds: string[] = [];

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EAdmin();
    await seedE2EUser();
  });

  test.afterAll(async () => {
    if (resourceIds.length) await queryE2E('DELETE FROM "AcademyResource" WHERE id = ANY($1::text[])', [resourceIds]);
    await cleanE2EIdentities();
  });

  test("creates, approves, searches, and renders sourced study content", async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminToken = await createE2ESession(e2eIdentity.admin.email);
    await adminContext.addCookies([{ name: "jenan_session", value: adminToken, url: origin }]);
    const slug = `e2e-study-${randomUUID()}`;
    const created = await adminContext.request.post("/api/academy/library", {
      headers: { origin },
      data: {
        action: "createResource",
        authorName: "E2E Research Desk",
        category: "Operations",
        content: { body: "Verified academy study content." },
        kind: "STUDY",
        references: [{ title: "Verified reference", url: "https://example.com/reference", source: "Example Registry" }],
        slug,
        sourceName: "Example Registry",
        sourcePublishedAt: "2026-09-01T00:00:00.000Z",
        sourceUrl: "https://example.com/source",
        summary: "Approved study summary",
        title: "E2E Verified Academy Study",
      },
    });
    expect(created.status()).toBe(201);
    const resourceId = (await created.json()).result.id as string;
    resourceIds.push(resourceId);
    const approved = await adminContext.request.post("/api/academy/library", { headers: { origin }, data: { action: "reviewResource", resourceId, approvalState: "APPROVED" } });
    expect(approved.status()).toBe(200);
    await adminContext.close();

    const userContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const userToken = await createE2ESession(e2eIdentity.user.email);
    await userContext.addCookies([{ name: "jenan_session", value: userToken, url: origin }]);
    const payload = await (await userContext.request.get("/api/academy/library?kind=STUDY&query=Verified")).json();
    expect(payload.resources).toHaveLength(1);
    const page = await userContext.newPage();
    expect((await page.goto(`/academy/studies?resource=${slug}`, { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "E2E Verified Academy Study" })).toBeVisible();
    await expect(page.getByText("Example Registry", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Verified academy study content.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await userContext.close();
  });
});