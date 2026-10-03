import { expect, test } from "@playwright/test";

import { cleanE2EIdentities, createE2ESession, queryE2E, seedE2EAdmin } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;

test.describe.serial("mission engine API and command center", () => {
  test.setTimeout(120_000);
  let missionId = "";
  let robotId = "";

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EAdmin();
  });

  test.afterAll(async () => {
    if (missionId) {
      await queryE2E('DELETE FROM "Evidence" WHERE "missionId" = $1', [missionId]);
      await queryE2E('DELETE FROM "CostRecord" WHERE "missionId" = $1', [missionId]);
      await queryE2E('DELETE FROM "Mission" WHERE id = $1', [missionId]);
    }
    if (robotId) await queryE2E('DELETE FROM "Robot" WHERE id = $1', [robotId]);
    await cleanE2EIdentities();
  });

  test("persists and renders the controlled mission lifecycle", async ({ context, page }) => {
    const token = await createE2ESession(e2eIdentity.admin.email);
    await context.addCookies([{ name: "jenan_session", value: token, url: origin }]);
    const missionResponse = await page.request.post("/api/admin/operations-center", { headers: { origin }, data: { action: "createMission", name: `E2E Engine Mission ${Date.now()}`, requiredIntelligence: 50 } });
    missionId = (await missionResponse.json()).result.id as string;
    const robotResponse = await page.request.post("/api/admin/robots", { headers: { origin }, data: { name: `E2E Engine Robot ${Date.now()}`, team: "Mission QA", mission: "Mission engine evidence" } });
    robotId = (await robotResponse.json()).robot.id as string;

    const runResponse = await page.request.post("/api/admin/mission-engine", { headers: { origin }, data: { action: "createRun", missionId } });
    expect(runResponse.status()).toBe(200);
    const runId = (await runResponse.json()).result.id as string;
    expect((await page.request.post("/api/admin/mission-engine", { headers: { origin }, data: { action: "addSubtask", key: "prepare", runId, sequence: 1, title: "Prepare evidence" } })).status()).toBe(200);
    expect((await page.request.post("/api/admin/mission-engine", { headers: { origin }, data: { action: "queueRun", runId } })).status()).toBe(200);
    expect((await page.request.post("/api/admin/mission-engine", { headers: { origin }, data: { action: "startRun", runId } })).status()).toBe(200);
    expect((await page.request.post("/api/admin/mission-engine", { headers: { origin }, data: { action: "recordEvidence", description: "E2E verified evidence", robotId, runId, type: "RESULT", verified: true } })).status()).toBe(200);
    expect((await page.request.post("/api/admin/mission-engine", { headers: { origin }, data: { action: "recordCost", computeCostMinor: 25, currency: "USD", provider: "INTERNAL", runId } })).status()).toBe(200);
    const approvalResponse = await page.request.post("/api/admin/mission-engine", { headers: { origin }, data: { action: "requestApproval", gate: "FINAL_OUTPUT", runId } });
    const approvalId = (await approvalResponse.json()).result.approvals[0].id as string;
    expect((await page.request.post("/api/admin/mission-engine", { headers: { origin }, data: { action: "decideApproval", approvalId, approve: true, rationale: "E2E approval accepted" } })).status()).toBe(200);
    const completed = await page.request.post("/api/admin/mission-engine", { headers: { origin }, data: { action: "completeRun", output: { result: "accepted" }, runId } });
    expect(completed.status()).toBe(200);

    const snapshot = await (await page.request.get(`/api/admin/mission-engine?runId=${runId}`)).json();
    expect(snapshot.run.status).toBe("COMPLETED");
    expect(snapshot.run.evidence).toHaveLength(1);
    expect(snapshot.run.costs).toHaveLength(1);
    expect(snapshot.run.history.length).toBeGreaterThanOrEqual(7);

    await page.goto("/missions", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".mission-engine-console")).toBeVisible();
    await expect(page.getByText(snapshot.run.traceId, { exact: false }).first()).toBeVisible();
  });
});