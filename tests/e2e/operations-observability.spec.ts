import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { cleanE2EIdentities, createE2ESession, queryE2E, seedE2EAdmin } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? "3101"}`;

test.describe.serial("operations observability UI", () => {
  test.setTimeout(120_000);
  let queueId = ""; let workerId = ""; let backupId = ""; const traceId = randomUUID();
  test.beforeAll(async () => { await cleanE2EIdentities(); await seedE2EAdmin(); });
  test.afterAll(async () => {
    await queryE2E('DELETE FROM "OperationalAlert" WHERE "traceId" = $1', [traceId]);
    await queryE2E('DELETE FROM "OperationalIncident" WHERE "traceId" = $1', [traceId]);
    await queryE2E('DELETE FROM "SystemLog" WHERE "traceId" = $1', [traceId]);
    if (queueId) await queryE2E('DELETE FROM "OperationsQueue" WHERE id = $1', [queueId]);
    if (workerId) await queryE2E('DELETE FROM "WorkerNode" WHERE id = $1', [workerId]);
    if (backupId) await queryE2E('DELETE FROM "BackupRecord" WHERE id = $1', [backupId]);
    await cleanE2EIdentities();
  });

  test("tracks worker, dead-letter incident, logs, backup and restore drill", async ({ context, page }) => {
    const token = await createE2ESession(e2eIdentity.admin.email);
    await context.addCookies([{ name: "jenan_session", value: token, url: origin }]);
    async function post(data: Record<string, unknown>) { const response = await page.request.post("/api/admin/observability-ops", { headers: { origin }, data }); expect(response.status()).toBe(200); return response.json(); }
    workerId = (await post({ action: "heartbeat", activeJobs: 0, key: `worker-${traceId}`, loadPercent: 10, name: "E2E Worker", status: "ONLINE", traceId })).result.id;
    queueId = (await post({ action: "ensureQueue", concurrency: 1, key: `queue-${traceId}`, name: "E2E Queue" })).result.id;
    const jobId = (await post({ action: "enqueue", idempotencyKey: `job-${traceId}`, kind: "MISSION", maxAttempts: 1, queueId, traceId })).result.id;
    await post({ action: "lease", queueId, workerId });
    expect((await post({ action: "failJob", error: "Permanent E2E failure", jobId })).result.status).toBe("DEAD_LETTER");
    await post({ action: "recordLog", level: "INFO", message: "E2E trace log", source: "e2e", traceId });
    backupId = (await post({ action: "recordBackup", checksum: "sha256:e2e", provider: "local-test", sizeBytes: 1024, status: "SUCCEEDED", storageKey: `backup-${traceId}` })).result.id;
    await post({ action: "recordRestoreDrill", backupId, evidence: { verified: true }, status: "SUCCEEDED", target: "isolated-e2e" });

    const snapshot = (await (await page.request.get("/api/admin/observability-ops")).json()).snapshot;
    expect(snapshot.jobs.find((item: { id: string }) => item.id === jobId).status).toBe("DEAD_LETTER");
    expect(snapshot.incidents.some((item: { traceId: string }) => item.traceId === traceId)).toBe(true);
    for (const route of ["/observability/workers", "/observability/queues", "/observability/alerts", "/observability/logs", "/observability/backups"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".mission-engine-console")).toBeVisible();
      await expect(page.locator(".admin-ops-panel").first()).toBeVisible();
    }
  });
});