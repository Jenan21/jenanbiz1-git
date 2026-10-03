import { expect, test } from "@playwright/test";

import { cleanE2EIdentities, createE2ESession, queryE2E, seedE2EAdmin } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;

test.describe.serial("knowledge versioning API and UI", () => {
  test.setTimeout(120_000);
  let knowledgeId = "";

  test.beforeAll(async () => { await cleanE2EIdentities(); await seedE2EAdmin(); });
  test.afterAll(async () => {
    if (knowledgeId) await queryE2E('DELETE FROM "SharedKnowledge" WHERE id = $1', [knowledgeId]);
    await cleanE2EIdentities();
  });

  test("creates versions, reviews, diffs, and rolls back without deleting history", async ({ context, page }) => {
    const token = await createE2ESession(e2eIdentity.admin.email);
    await context.addCookies([{ name: "jenan_session", value: token, url: origin }]);
    const created = await page.request.post("/api/admin/intelligence-knowledge", { headers: { origin }, data: { action: "create", confidence: 70, content: "Baseline line", source: "E2E Registry", sourcePublishedAt: "2026-09-01T00:00:00.000Z", sourceUrl: "https://example.com/v1", title: "E2E Versioned Knowledge" } });
    expect(created.status()).toBe(201);
    knowledgeId = (await created.json()).result.id as string;
    expect((await page.request.post("/api/admin/intelligence-knowledge", { headers: { origin }, data: { action: "createVersion", changeSummary: "Verified update", confidence: 85, content: "Updated line", knowledgeId, source: "E2E Registry", sourcePublishedAt: "2026-09-02T00:00:00.000Z", sourceUrl: "https://example.com/v2", title: "E2E Versioned Knowledge" } })).status()).toBe(201);
    expect((await page.request.post("/api/admin/intelligence-knowledge", { headers: { origin }, data: { action: "review", knowledgeId, notes: "Verified by E2E reviewer", state: "APPROVED" } })).status()).toBe(200);
    const diff = await (await page.request.get(`/api/admin/intelligence-knowledge?knowledgeId=${knowledgeId}&from=1&to=2`)).json();
    expect(diff.diff.lines[0]).toMatchObject({ before: "Baseline line", after: "Updated line", changed: true });
    expect((await page.request.post("/api/admin/intelligence-knowledge", { headers: { origin }, data: { action: "rollback", knowledgeId, reason: "Restore baseline", targetVersion: 1 } })).status()).toBe(200);
    const snapshot = await (await page.request.get(`/api/admin/intelligence-knowledge?knowledgeId=${knowledgeId}`)).json();
    expect(snapshot.knowledge.currentVersion).toBe(3);
    expect(snapshot.knowledge.versions).toHaveLength(3);
    expect(snapshot.knowledge.versions[0].rollbackFrom).toBe(1);

    await page.goto("/intelligence/versions", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".mission-engine-console")).toBeVisible();
    await expect(page.getByText("E2E Versioned Knowledge", { exact: true }).first()).toBeVisible();
  });
});