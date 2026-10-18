import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  allowed: true,
  run: vi.fn(),
  create: vi.fn(),
  detail: vi.fn(),
  status: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: () => true }));
vi.mock("@/lib/rate-limit/project-rate-limit", () => ({
  checkProjectRateLimit: async () => ({ allowed: mocks.allowed, retryAfterSeconds: 10 }),
}));
vi.mock("@/services/projects/project-analysis", () => ({
  runProjectAnalysis: mocks.run,
  saveProjectAnalysisInput: vi.fn(),
  getProjectAnalysisStatus: mocks.status,
}));
vi.mock("@/services/projects/project-service", async (original) => ({
  ...await original<typeof import("@/services/projects/project-service")>(),
  createProject: mocks.create,
  getUserProject: mocks.detail,
}));

import { POST } from "@/app/api/projects/route";
import { GET as getProject } from "@/app/api/projects/[projectId]/route";
import { GET as getStatus } from "@/app/api/projects/[projectId]/analysis-status/route";

const projectId = "ckprojectaaaaaaaaaaaaaaaaa";
const context = { params: Promise.resolve({ projectId }) };
const request = () => new NextRequest(`http://localhost/api/projects/${projectId}`);
const command = (body: unknown) => new NextRequest("http://localhost/api/projects", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "owner" };
  mocks.allowed = true;
  mocks.run.mockResolvedValue({ projectId, runId: "run-id", inputRevision: "revision", status: "PENDING", reused: false });
});

describe("durable analysis API contracts", () => {
  it("accepts a run immediately with 202 and durable identifiers", async () => {
    const response = await POST(command({ action: "runProjectAnalysis", projectId }));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ success: true, result: { runId: "run-id", projectId, status: "PENDING" } });
    expect(mocks.run).toHaveBeenCalledWith(projectId, "owner");
  });

  it("passes validated UUID create idempotency keys without changing the creation response", async () => {
    mocks.create.mockResolvedValue({ id: projectId });
    const idempotencyKey = crypto.randomUUID();
    expect((await POST(command({ action: "create", name: "Regional logistics", idempotencyKey }))).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey }), "owner");
    expect((await POST(command({ action: "create", name: "Regional logistics", idempotencyKey: "invalid" }))).status).toBe(400);
  });

  it("directly reads one authorized project and returns opaque 404 for missing or inaccessible ids", async () => {
    mocks.detail.mockResolvedValue({ id: projectId, evidenceFiles: [{ sizeBytes: BigInt(42) }] });
    const response = await getProject(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ project: { id: projectId, evidenceFiles: [{ sizeBytes: "42" }] } });
    expect(mocks.detail).toHaveBeenCalledWith(projectId, "owner");
    mocks.detail.mockResolvedValue(null);
    expect((await getProject(request(), context)).status).toBe(404);
  });

  it("returns poll metadata without raw errors, and keeps authentication and rate guards", async () => {
    mocks.status.mockResolvedValue({ status: "FAILED", stage: null, runId: "run-id", updatedAt: "2026-10-18T09:00:00Z", errorCode: "ANALYSIS_FAILED", retryable: true });
    const response = await getStatus(request(), context);
    expect(await response.json()).toMatchObject({ success: true, runId: "run-id", errorCode: "ANALYSIS_FAILED", retryable: true });
    mocks.allowed = false;
    expect((await getStatus(request(), context)).status).toBe(429);
    expect((await getProject(request(), context)).status).toBe(429);
    mocks.user = null;
    expect((await POST(command({ action: "runProjectAnalysis", projectId }))).status).toBe(401);
    expect((await getStatus(request(), context)).status).toBe(401);
    expect((await getProject(request(), context)).status).toBe(401);
  });
});
