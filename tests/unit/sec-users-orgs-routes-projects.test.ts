import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  inviteProjectMember: vi.fn(),
  acceptInvitation: vi.fn(),
  userCanReadProject: vi.fn(),
  createProjectReport: vi.fn(),
  searchProjectIntelligence: vi.fn(),
}));

const provider = new MemoryRateLimitProvider();

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: () => true }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/rate-limit/auth-rate-limit", () => ({ getRateLimitProvider: () => provider }));
vi.mock("@/services/projects/project-report", () => ({ createProjectReport: mocks.createProjectReport }));
vi.mock("@/services/projects/project-invitations", () => ({
  inviteProjectMember: mocks.inviteProjectMember,
  acceptProjectInvitation: mocks.acceptInvitation,
  declineProjectInvitation: vi.fn(),
  revokeProjectInvitation: vi.fn(),
}));
vi.mock("@/services/projects/project-intelligence", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/projects/project-intelligence")>()),
  searchProjectIntelligence: mocks.searchProjectIntelligence,
}));
vi.mock("@/services/projects/project-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/projects/project-service")>()),
  userCanReadProject: mocks.userCanReadProject,
}));

import { POST as postProjects } from "@/app/api/projects/route";
import { GET as getReport } from "@/app/api/projects/[projectId]/report/route";
import { EmailNotVerifiedError } from "@/lib/auth/email-verification-policy";

const projectId = "ckprojectaaaaaaaaaaaaaaaaa";
const prismaFailure = () =>
  new Prisma.PrismaClientKnownRequestError("Invalid `prisma.user.findUnique()` invocation in /app/services/projects/project-service.ts:194:31 SELECT \"email\" FROM \"User\"", { code: "P2022", clientVersion: "7.9.1" });

function reportRequest(query = "") {
  return new Request(`http://localhost/api/projects/${projectId}/report${query}`, { headers: { "x-real-ip": "192.0.2.50" } });
}

function command(body: unknown) {
  return new NextRequest("http://localhost/api/projects", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-real-ip": "192.0.2.51" } });
}

beforeEach(() => {
  provider.clear();
  vi.clearAllMocks();
  mocks.inviteProjectMember.mockReset();
  mocks.acceptInvitation.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.user = { id: "user-1" };
  mocks.userCanReadProject.mockResolvedValue(true);
  mocks.createProjectReport.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  mocks.searchProjectIntelligence.mockResolvedValue({ location: null });
});

describe("project report route", () => {
  it("allows eight reports a minute per user and then answers 429 for that user only", async () => {
    for (let index = 0; index < 8; index += 1) {
      expect((await getReport(reportRequest(), { params: Promise.resolve({ projectId }) })).status).toBe(200);
    }
    const limited = await getReport(reportRequest(), { params: Promise.resolve({ projectId }) });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    await expect(limited.json()).resolves.toEqual({ error: "RATE_LIMITED" });
    expect(mocks.createProjectReport).toHaveBeenCalledTimes(8);

    mocks.user = { id: "user-2" };
    expect((await getReport(reportRequest(), { params: Promise.resolve({ projectId }) })).status).toBe(200);
  });

  it("counts a location report against the same budget and never reaches the providers for a project the user cannot read", async () => {
    mocks.userCanReadProject.mockResolvedValue(false);
    const response = await getReport(reportRequest("?location=Riyadh&countryCode=SA"), { params: Promise.resolve({ projectId }) });
    expect(response.status).toBe(404);
    expect(mocks.searchProjectIntelligence).not.toHaveBeenCalled();
    expect(mocks.createProjectReport).not.toHaveBeenCalled();
  });

  it("calls the providers once for a readable project and bounds what it forwards", async () => {
    const response = await getReport(reportRequest("?location=Riyadh&countryCode=sa&sector=Retail"), { params: Promise.resolve({ projectId }) });
    expect(response.status).toBe(200);
    expect(mocks.searchProjectIntelligence).toHaveBeenCalledTimes(1);
    expect(mocks.searchProjectIntelligence).toHaveBeenCalledWith({ query: "Riyadh", countryCode: "sa", sector: "Retail" });

    const tooLong = await getReport(reportRequest(`?location=${"x".repeat(201)}`), { params: Promise.resolve({ projectId }) });
    expect(tooLong.status).toBe(400);
    const badCountry = await getReport(reportRequest("?location=Riyadh&countryCode=SAU"), { params: Promise.resolve({ projectId }) });
    expect(badCountry.status).toBe(400);
    expect(mocks.searchProjectIntelligence).toHaveBeenCalledTimes(1);
  });

  it("requires a signed-in user before counting anything", async () => {
    mocks.user = null;
    expect((await getReport(reportRequest(), { params: Promise.resolve({ projectId }) })).status).toBe(401);
  });

  it("does not echo a database error", async () => {
    mocks.createProjectReport.mockRejectedValue(prismaFailure());
    const response = await getReport(reportRequest(), { params: Promise.resolve({ projectId }) });
    expect(response.status).toBe(500);
    const body = await response.json() as { message: string };
    expect(body.message).toMatch(/^Report generation failed \(ref [0-9a-f]{8}\)$/);
    expect(JSON.stringify(body)).not.toMatch(/prisma|invocation|SELECT|project-service/i);
  });

  it("keeps the deliberate not-found answer", async () => {
    mocks.createProjectReport.mockRejectedValue(new Error("Project not found"));
    const response = await getReport(reportRequest(), { params: Promise.resolve({ projectId }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ message: "Project not found" });
  });
});

describe("projects command route", () => {
  const invite = (email = "member@example.test") => command({ action: "inviteMember", projectId, email, role: "VIEWER" });

  it("answers a database failure with a generic sentence and a reference, with the same 409 status", async () => {
    mocks.inviteProjectMember.mockRejectedValue(prismaFailure());
    const response = await postProjects(invite());
    expect(response.status).toBe(409);
    const body = await response.json() as { success: boolean; message: string };
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/^Project command failed \(ref [0-9a-f]{8}\)$/);
    expect(JSON.stringify(body)).not.toMatch(/prisma|invocation|SELECT|project-service/i);
  });

  it("still tells the user the deliberate business reasons, with their original status codes", async () => {
    mocks.inviteProjectMember.mockRejectedValueOnce(new Error("Project owner access required"));
    const refused = await postProjects(invite());
    expect(refused.status).toBe(409);
    await expect(refused.json()).resolves.toMatchObject({ message: "Project owner access required" });

    mocks.inviteProjectMember.mockRejectedValueOnce(new Error("Project not found"));
    expect((await postProjects(invite())).status).toBe(404);

    mocks.acceptInvitation.mockRejectedValueOnce(new Error("Invitation not found"));
    const missing = await postProjects(command({ action: "acceptInvitation", invitationId: "ckinvitationaaaaaaaaaaaaaa" }));
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ message: "Invitation not found" });
  });

  it("answers 403 with a stable code when the e-mail address is not verified", async () => {
    mocks.acceptInvitation.mockRejectedValueOnce(new EmailNotVerifiedError());
    const response = await postProjects(command({ action: "acceptInvitation", invitationId: "ckinvitationaaaaaaaaaaaaaa" }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ success: false, code: "EMAIL_NOT_VERIFIED", message: "Verify your e-mail address first" });
  });

  it("no longer accepts the old command that added an account without its consent", async () => {
    const response = await postProjects(command({ action: "addMember", projectId, email: "member@example.test", role: "EDITOR" }));
    expect(response.status).toBe(400);
  });

  it("limits invitations per signed-in user with the existing membership budget", async () => {
    mocks.inviteProjectMember.mockRejectedValue(new Error("Project owner access required"));
    const statuses: number[] = [];
    for (let index = 0; index < 16; index += 1) {
      statuses.push((await postProjects(invite(`guess${index}@example.test`))).status);
    }
    expect(statuses.slice(0, 15).every((status) => status === 409)).toBe(true);
    expect(statuses[15]).toBe(429);
    expect(mocks.inviteProjectMember).toHaveBeenCalledTimes(15);
  });

  it("rejects financial inputs that would loop for ever or overflow instead of computing them", async () => {
    const inputs = { initialInvestment: 10_000, monthlyFixedCosts: 1_000, variableCostPerUnit: 5, pricePerUnit: 20, monthlyUnits: 300, months: 12 };
    const accepted = await postProjects(command({ action: "calculateFeasibility", inputs }));
    expect(accepted.status).toBe(200);

    for (const patch of [{ months: 1_000_000_000 }, { months: 601 }, { monthlyUnits: 1_000_000_001 }, { initialInvestment: 1e300 }]) {
      const rejected = await postProjects(command({ action: "calculateFeasibility", inputs: { ...inputs, ...patch } }));
      expect(rejected.status).toBe(400);
    }
  });

  it("refuses an idea, a place or a name that cannot be understood, with a readable reason, before any record is written", async () => {
    const bodies = [
      { action: "saveProjectAnalysis", projectId, input: { idea: "هههههههههههه", city: "Riyadh", targetAudience: "CONSUMERS" } },
      { action: "saveProjectAnalysis", projectId, input: { idea: "منصة رقمية لتوصيل المنتجات الصحية", city: "aaaaaaaa", targetAudience: "CONSUMERS" } },
      { action: "create", name: "هههههههههههه", description: "منصة رقمية لتوصيل المنتجات الصحية", sector: "Food", countryCode: "SA" },
      { action: "saveProjectLaunchPlan", projectId, payload: { section: "BASICS", data: { projectName: "Jenan", idea: "asdfghjkl qwerty", entityType: "LLC", sector: "Food", city: "Riyadh", targetAudience: "Families", initialCapital: 100000, durationMonths: 12, teamSize: 3 } } },
    ];
    for (const body of bodies) {
      const response = await postProjects(command(body));
      expect(response.status, JSON.stringify(body)).toBe(400);
      const payload = await response.json() as { code?: string; message: string };
      expect(payload.code).toBe("UNREADABLE_TEXT");
      expect(payload.message).toMatch(/[\u0600-\u06ff]/);
    }
  });

  it("keeps the generic answer for other invalid commands", async () => {
    const response = await postProjects(command({ action: "saveProjectAnalysis", projectId, input: { idea: "منصة رقمية لتوصيل المنتجات الصحية", city: "Riyadh", targetAudience: "NOBODY" } }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ success: false, message: "Invalid project command" });
  });
});
