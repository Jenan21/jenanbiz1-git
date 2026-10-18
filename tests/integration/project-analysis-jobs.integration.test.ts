import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createProject, getUserProject, listUserProjectsPage } from "@/services/projects/project-service";
import {
  claimProjectAnalysisJob,
  executeProjectAnalysisJob,
  findActiveAnalysisProjectId,
  getProjectAnalysisStatus,
  recoverProjectAnalysisJobs,
  runProjectAnalysis,
  saveProjectAnalysisInput,
} from "@/services/projects/project-analysis";
import { searchProjectIntelligence, type ProjectIntelligenceResult } from "@/services/projects/project-intelligence";

vi.mock("@/services/projects/project-intelligence", () => ({ searchProjectIntelligence: vi.fn() }));

const provider = vi.mocked(searchProjectIntelligence);
const input = { idea: "A source-backed regional logistics marketplace.", city: "Riyadh", targetAudience: "BUSINESSES" as const };
const intelligence: ProjectIntelligenceResult = {
  location: { latitude: 24.7, longitude: 46.6, label: "Riyadh" },
  population: { value: null, year: null },
  purchasingPower: { value: null, year: null, metric: "GNI" },
  costInflation: { value: null, year: null, metric: "CPI" },
  competitors: [], sources: [], limitations: ["Local data requires review"],
};
let userId: string;
let outsiderId: string;
const projectIds: string[] = [];

beforeAll(async () => {
  userId = (await db.user.create({ data: { email: `analysis-jobs-${crypto.randomUUID()}@example.test`, status: "ACTIVE" } })).id;
  outsiderId = (await db.user.create({ data: { email: `analysis-outsider-${crypto.randomUUID()}@example.test`, status: "ACTIVE" } })).id;
});
beforeEach(() => { provider.mockReset().mockResolvedValue(intelligence); });
afterAll(async () => {
  for (const projectId of projectIds) {
    await db.operationsJob.deleteMany({ where: { kind: "PROJECT_ANALYSIS", payload: { path: ["projectId"], equals: projectId } } });
  }
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.user.deleteMany({ where: { id: { in: [userId, outsiderId].filter(Boolean) } } });
  await db.$disconnect();
});

async function project() {
  const created = await createProject({ name: `Durable analysis ${crypto.randomUUID().slice(0, 8)}` }, userId);
  projectIds.push(created.id);
  await saveProjectAnalysisInput(created.id, input, userId);
  return created.id;
}

describe("durable project analysis jobs", () => {
  it("atomically deduplicates concurrent creation and enqueue without calling providers in HTTP", async () => {
    const idempotencyKey = crypto.randomUUID();
    const projects = await Promise.all(Array.from({ length: 4 }, () =>
      createProject({ name: "Idempotent analysis creation", idempotencyKey }, userId)));
    expect(new Set(projects.map((item) => item.id)).size).toBe(1);
    const id = projects[0].id;
    projectIds.push(id);
    await saveProjectAnalysisInput(id, input, userId);
    const runs = await Promise.all(Array.from({ length: 6 }, () => runProjectAnalysis(id, userId)));
    expect(new Set(runs.map((item) => item.runId)).size).toBe(1);
    expect(runs.filter((item) => !item.reused)).toHaveLength(1);
    expect(provider).not.toHaveBeenCalled();
    expect(await getProjectAnalysisStatus(id, userId)).toMatchObject({ status: "PENDING", runId: runs[0].runId, retryable: false });
    const claims = await Promise.all([claimProjectAnalysisJob(), claimProjectAnalysisJob()]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const executionStartedAt = Date.now();
    await executeProjectAnalysisJob(claims.find((claim) => claim !== null)!);
    const providerOptions = provider.mock.calls[0][2]!;
    expect(providerOptions.deadlineAt).toBeLessThan(executionStartedAt + 50_000);
    expect(providerOptions.deadlineAt).toBeGreaterThan(executionStartedAt);
    expect(providerOptions.signal).toBeInstanceOf(AbortSignal);
    expect(providerOptions.signal?.aborted).toBe(true);
    expect(await getProjectAnalysisStatus(id, userId)).toMatchObject({ status: "COMPLETED" });
    const saved = await saveProjectAnalysisInput(id, { ...input }, userId);
    expect(saved.analysisStudy).toMatchObject({ status: "COMPLETED", runId: runs[0].runId });
    expect(await runProjectAnalysis(id, userId)).toMatchObject({ runId: runs[0].runId, reused: true });
    expect(await db.projectIntelligenceSnapshot.count({ where: { projectId: id } })).toBe(1);
  });

  it("preserves the same active input but fences all writes from a superseded revision", async () => {
    const id = await project();
    const run = await runProjectAnalysis(id, userId);
    const claimed = (await claimProjectAnalysisJob())!;
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    provider.mockImplementationOnce(async () => {
      started();
      await new Promise<void>((resolve) => { release = resolve; });
      return intelligence;
    });
    const executing = executeProjectAnalysisJob(claimed);
    await startedPromise;
    expect((await saveProjectAnalysisInput(id, input, userId)).analysisStudy).toMatchObject({ runId: run.runId, status: "PROCESSING" });
    await saveProjectAnalysisInput(id, { ...input, city: "Jeddah" }, userId);
    const replacement = await runProjectAnalysis(id, userId);
    expect(replacement.runId).not.toBe(run.runId);
    expect(replacement.inputRevision).not.toBe(run.inputRevision);
    release();
    await executing;
    expect(await getProjectAnalysisStatus(id, userId)).toMatchObject({ runId: replacement.runId, status: "PENDING" });
    expect(await db.projectIntelligenceSnapshot.count({ where: { projectId: id } })).toBe(0);
    await executeProjectAnalysisJob((await claimProjectAnalysisJob())!);
    expect(await getProjectAnalysisStatus(id, userId)).toMatchObject({ status: "COMPLETED" });
  });

  it("reclaims expired leases using a new token and prevents the old executor overwriting results", async () => {
    const id = await project();
    await runProjectAnalysis(id, userId);
    const old = (await claimProjectAnalysisJob())!;
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    provider.mockImplementationOnce(async () => {
      started();
      await new Promise<void>((resolve) => { release = resolve; });
      return intelligence;
    });
    const executing = executeProjectAnalysisJob(old);
    await startedPromise;
    await db.operationsJob.update({ where: { id: old.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    const reclaimed = (await claimProjectAnalysisJob())!;
    expect(reclaimed.id).toBe(old.id);
    expect(reclaimed.leaseToken).not.toBe(old.leaseToken);
    expect(reclaimed.attempts).toBe(2);
    await executeProjectAnalysisJob(reclaimed);
    release();
    await executing;
    expect(await getProjectAnalysisStatus(id, userId)).toMatchObject({ status: "COMPLETED" });
    expect(await db.projectIntelligenceSnapshot.count({ where: { projectId: id } })).toBe(1);
  });

  it("bounds retries and persists only public failure codes, then allows an explicit retry", async () => {
    const id = await project();
    const run = await runProjectAnalysis(id, userId);
    provider.mockRejectedValue(new Error("Secret provider token=DO_NOT_PERSIST"));
    for (let attempt = 1; attempt <= 3; attempt++) {
      await executeProjectAnalysisJob((await claimProjectAnalysisJob())!);
      await db.operationsJob.update({ where: { id: run.runId! }, data: { availableAt: new Date() } });
    }
    expect(await claimProjectAnalysisJob()).toBeNull();
    expect(await getProjectAnalysisStatus(id, userId)).toMatchObject({ status: "FAILED", errorCode: "ANALYSIS_FAILED", retryable: true });
    const job = await db.operationsJob.findUniqueOrThrow({ where: { id: run.runId! } });
    expect(job.attempts).toBe(3);
    expect(job.lastError).toBe("ANALYSIS_FAILED");
    expect(JSON.stringify((await getUserProject(id, userId))?.analysisStudy)).not.toContain("DO_NOT_PERSIST");
    const retry = await runProjectAnalysis(id, userId);
    expect(retry.runId).not.toBe(run.runId);
    provider.mockResolvedValue(intelligence);
    await executeProjectAnalysisJob((await claimProjectAnalysisJob())!);
  });

  it("fails exhausted abandoned leases but never age-fails a live lease", async () => {
    const id = await project();
    await runProjectAnalysis(id, userId);
    const claim = (await claimProjectAnalysisJob())!;
    await db.operationsJob.update({ where: { id: claim.id }, data: { attempts: 3 } });
    await recoverProjectAnalysisJobs();
    expect(await getProjectAnalysisStatus(id, userId)).toMatchObject({ status: "PENDING" });
    await db.operationsJob.update({ where: { id: claim.id }, data: { leaseExpiresAt: new Date(Date.now() - 1000) } });
    await recoverProjectAnalysisJobs();
    expect(await getProjectAnalysisStatus(id, userId)).toMatchObject({ status: "FAILED", retryable: true });
  });

  it("recovers pre-queue PROCESSING studies and keeps outsider access opaque", async () => {
    const id = await project();
    await db.project.update({
      where: { id }, data: { analysisStudy: { version: 1, status: "PROCESSING", input } },
    });
    await recoverProjectAnalysisJobs();
    expect(await getProjectAnalysisStatus(id, userId)).toMatchObject({ status: "PENDING", runId: expect.any(String) });
    expect(await getProjectAnalysisStatus(id, outsiderId)).toBeNull();
    expect(await getUserProject(id, outsiderId)).toBeNull();
    await expect(runProjectAnalysis(id, outsiderId)).rejects.toThrow("Project not found");
    await expect(saveProjectAnalysisInput(id, input, outsiderId)).rejects.toThrow("Project not found");
    await executeProjectAnalysisJob((await claimProjectAnalysisJob())!);
  });

  it("recovers missing-job run ids and retires malformed legacy input without blocking valid jobs", async () => {
    const id = await project();
    const invalidId = await project();
    await db.project.update({ where: { id }, data: { analysisStudy: { version: 1, status: "PROCESSING", runId: crypto.randomUUID(), input } } });
    await db.project.update({ where: { id: invalidId }, data: { analysisStudy: { version: 1, status: "PROCESSING" } } });
    await recoverProjectAnalysisJobs();
    expect(await getProjectAnalysisStatus(invalidId, userId)).toMatchObject({ status: "FAILED", errorCode: "ANALYSIS_INPUT_REQUIRED", retryable: false });
    expect(await getProjectAnalysisStatus(id, userId)).toMatchObject({ status: "PENDING", runId: expect.any(String) });
    await executeProjectAnalysisJob((await claimProjectAnalysisJob())!);
    expect(await getProjectAnalysisStatus(id, userId)).toMatchObject({ status: "COMPLETED" });
  });

  it("reads a durable project directly even when it is outside the first hundred list entries", async () => {
    const id = await project();
    const run = await runProjectAnalysis(id, userId);
    const prefix = crypto.randomUUID();
    const rows = Array.from({ length: 101 }, (_, index) => ({
      id: crypto.randomUUID(), createdById: userId, name: `Newer ${index}`, slug: `${prefix}-${index}`,
    }));
    projectIds.push(...rows.map((item) => item.id));
    await db.project.createMany({ data: rows });
    const firstHundred = await db.project.findMany({ where: { createdById: userId }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true } });
    expect(firstHundred.some((item) => item.id === id)).toBe(false);
    expect((await getUserProject(id, userId))?.id).toBe(id);
    const active = await listUserProjectsPage(userId, { limit: 1, offset: 0, analysisStatus: ["PENDING", "PROCESSING"] });
    expect(active.projects.map((item) => item.id)).toEqual([id]);
    expect(active.page.total).toBe(1);
    expect(active.projects[0].analysisStudy).toMatchObject({ runId: run.runId });
    expect(await findActiveAnalysisProjectId(userId)).toBe(id);
    expect(await findActiveAnalysisProjectId(outsiderId)).toBeNull();
    const unscheduled = await project();
    expect((await listUserProjectsPage(userId, { limit: 10, offset: 0, analysisStatus: ["PENDING", "PROCESSING"] })).projects.map((item) => item.id)).not.toContain(unscheduled);
    expect(await findActiveAnalysisProjectId(userId)).toBe(id);
    await executeProjectAnalysisJob((await claimProjectAnalysisJob())!);
    expect(await findActiveAnalysisProjectId(userId)).toBeNull();
  });
});
