import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { MemoryRateLimitProvider } from "@/lib/rate-limit/memory-provider";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  inviteOrganizationMember: vi.fn(),
  acceptOrganizationInvitation: vi.fn(),
  createFinancialEntry: vi.fn(),
  listFinancialEntries: vi.fn(),
  updateOrganizationProgramStatus: vi.fn(),
  createFleetVehicle: vi.fn(),
  createFieldAssignment: vi.fn(),
  createJobPosting: vi.fn(),
  listJobPostings: vi.fn(),
  updateJobPostingStatus: vi.fn(),
  listOwnedJobApplications: vi.fn(),
  listMyJobApplications: vi.fn(),
  listSavedJobs: vi.fn(),
  getTalentProfile: vi.fn(),
  listDiscoverableTalent: vi.fn(),
  listTalentMatches: vi.fn(),
  listSoftwareOrganizations: vi.fn(),
  listEmployerTalentResources: vi.fn(),
  getSoftwareCompany: vi.fn(),
  listSalesWorkspace: vi.fn(),
  listSoftwareOperations: vi.fn(),
  listSoftwareHr: vi.fn(),
  listSoftwareHrForMember: vi.fn(),
  postPayrollRun: vi.fn(),
}));

const provider = new MemoryRateLimitProvider();

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: () => true }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/rate-limit/auth-rate-limit", () => ({ getRateLimitProvider: () => provider }));
vi.mock("@/services/programs/people-service", () => ({
  acceptOrganizationInvitation: mocks.acceptOrganizationInvitation,
  inviteOrganizationMember: mocks.inviteOrganizationMember,
  listOrganizationMembers: vi.fn(),
  listPendingOrganizationInvitations: vi.fn(),
}));
vi.mock("@/services/programs/financial-entry-service", () => ({
  createFinancialEntry: mocks.createFinancialEntry,
  listFinancialEntries: mocks.listFinancialEntries,
}));
vi.mock("@/services/programs/organization-program-service", () => ({
  activateOrganizationProgram: vi.fn(),
  createOrganizationForUser: vi.fn(),
  listOrganizationPrograms: vi.fn(),
  updateOrganizationProgramStatus: mocks.updateOrganizationProgramStatus,
}));
vi.mock("@/services/programs/fleet-service", () => ({
  createFleetVehicle: mocks.createFleetVehicle,
  listFleetVehicles: vi.fn(),
  updateFleetVehicleStatus: vi.fn(),
}));
vi.mock("@/services/programs/field-operations-service", () => ({
  createFieldAssignment: mocks.createFieldAssignment,
  listFieldAssignees: vi.fn(),
  listFieldAssignments: vi.fn(),
  updateFieldAssignmentStatus: vi.fn(),
}));
vi.mock("@/services/talent/job-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/talent/job-service")>()),
  createJobPosting: mocks.createJobPosting,
  getTalentProfile: mocks.getTalentProfile,
  listDiscoverableTalent: mocks.listDiscoverableTalent,
  listJobPostings: mocks.listJobPostings,
  listMyJobApplications: mocks.listMyJobApplications,
  listOwnedJobApplications: mocks.listOwnedJobApplications,
  listSavedJobs: mocks.listSavedJobs,
  listTalentMatches: mocks.listTalentMatches,
  updateJobPostingStatus: mocks.updateJobPostingStatus,
}));
vi.mock("@/services/talent/employer-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/talent/employer-service")>()),
  listEmployerTalentResources: mocks.listEmployerTalentResources,
}));
vi.mock("@/services/software/software-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/software/software-access")>()),
  getSoftwareCompany: mocks.getSoftwareCompany,
  listSoftwareOrganizations: mocks.listSoftwareOrganizations,
}));
vi.mock("@/services/software/sales-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/software/sales-service")>()),
  listSalesWorkspace: mocks.listSalesWorkspace,
  summarizeSalesWorkspace: () => ({}),
}));
vi.mock("@/services/software/operations-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/software/operations-service")>()),
  listSoftwareOperations: mocks.listSoftwareOperations,
  summarizeSoftwareOperations: () => ({}),
}));
vi.mock("@/services/software/hr-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/software/hr-service")>()),
  listSoftwareHr: mocks.listSoftwareHr,
  listSoftwareHrForMember: mocks.listSoftwareHrForMember,
  postPayrollRun: mocks.postPayrollRun,
}));

import { GET as getOperations, POST as postOperations } from "@/app/api/software/operations/route";
import { GET as getTalent, POST as postTalent } from "@/app/api/talent/route";
import { POST as postPrograms } from "@/app/api/programs/route";
import { POST as postField } from "@/app/api/programs/field/route";
import { POST as postFinance } from "@/app/api/programs/finance/route";
import { POST as postFleet } from "@/app/api/programs/fleet/route";
import { POST as postPeople } from "@/app/api/programs/people/route";

const cuid = "ckorganizationaaaaaaaaaaaa";
const prismaFailure = () =>
  new Prisma.PrismaClientKnownRequestError("Invalid `prisma.financialEntry.create()` invocation in /app/services/x.ts:12:3 INSERT INTO \"FinancialEntry\" integer out of range", { code: "P2020", clientVersion: "7.9.1" });
const sanitized = (fallback: string) => new RegExp(`^${fallback} \\(ref [0-9a-f]{8}\\)$`);
const leaks = /prisma|invocation|INSERT INTO|out of range|\/app\/services/i;

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  provider.clear();
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.user = { id: "user-1" };
});

describe("people route: member lookups", () => {
  it("meters invitations per signed-in user, leaves other commands alone and keeps users apart", async () => {
    mocks.inviteOrganizationMember.mockResolvedValue({ id: "membership" });
    mocks.acceptOrganizationInvitation.mockResolvedValue({ id: "membership" });
    const invite = (index: number) => postPeople(post("/api/programs/people", { action: "invite", organizationId: cuid, email: `guess${index}@example.test` }));

    const statuses: number[] = [];
    for (let index = 0; index < 16; index += 1) statuses.push((await invite(index)).status);
    expect(statuses.slice(0, 15).every((status) => status === 201)).toBe(true);
    expect(statuses[15]).toBe(429);
    expect(mocks.inviteOrganizationMember).toHaveBeenCalledTimes(15);

    expect((await postPeople(post("/api/programs/people", { action: "acceptInvitation", membershipId: cuid }))).status).toBe(200);

    mocks.user = { id: "user-2" };
    expect((await invite(99)).status).toBe(201);
  });

  it("keeps the lookup message the interface needs but not a database error", async () => {
    mocks.inviteOrganizationMember.mockRejectedValueOnce(new Error("Registered user not found"));
    const unknown = await postPeople(post("/api/programs/people", { action: "invite", organizationId: cuid, email: "nobody@example.test" }));
    expect(unknown.status).toBe(403);
    await expect(unknown.json()).resolves.toMatchObject({ message: "Registered user not found" });

    mocks.inviteOrganizationMember.mockRejectedValueOnce(prismaFailure());
    const failed = await postPeople(post("/api/programs/people", { action: "invite", organizationId: cuid, email: "member@example.test" }));
    expect(failed.status).toBe(409);
    const body = await failed.json() as { message: string };
    expect(body.message).toMatch(sanitized("People command failed"));
    expect(body.message).not.toMatch(leaks);
  });
});

describe("programs routes", () => {
  it("answer database failures generically and keep the deliberate refusals readable", async () => {
    mocks.createFinancialEntry.mockRejectedValueOnce(prismaFailure());
    const finance = await postFinance(post("/api/programs/finance", { organizationId: cuid, type: "INCOME", amountMinor: 100, currency: "SAR", description: "Entry", occurredAt: new Date().toISOString() }));
    expect(finance.status).toBe(403);
    const financeBody = await finance.json() as { message: string };
    expect(financeBody.message).toMatch(sanitized("Financial entry could not be created"));
    expect(financeBody.message).not.toMatch(leaks);

    mocks.createFinancialEntry.mockRejectedValueOnce(new Error("Organization permission required: finance.write"));
    const refused = await postFinance(post("/api/programs/finance", { organizationId: cuid, type: "INCOME", amountMinor: 100, currency: "SAR", description: "Entry", occurredAt: new Date().toISOString() }));
    expect(refused.status).toBe(403);
    await expect(refused.json()).resolves.toMatchObject({ message: "Organization permission required: finance.write" });

    mocks.createFleetVehicle.mockRejectedValueOnce(prismaFailure());
    const fleet = await postFleet(post("/api/programs/fleet", { action: "create", organizationId: cuid, label: "Van", plateNumber: "ABC-123" }));
    expect((await fleet.json() as { message: string }).message).toMatch(sanitized("Fleet command failed"));

    mocks.createFieldAssignment.mockRejectedValueOnce(prismaFailure());
    const field = await postField(post("/api/programs/field", { action: "create", organizationId: cuid, title: "Visit" }));
    expect((await field.json() as { message: string }).message).toMatch(sanitized("Field operations command failed"));
  });

  it("report a refused status change as 403 and an unexpected failure as before (404), never with the database text", async () => {
    mocks.updateOrganizationProgramStatus.mockRejectedValueOnce(new Error("Organization owner access required"));
    const refused = await postPrograms(post("/api/programs", { action: "updateStatus", organizationId: cuid, programId: cuid, status: "SUSPENDED" }));
    expect(refused.status).toBe(403);
    await expect(refused.json()).resolves.toMatchObject({ message: "Organization owner access required" });

    mocks.updateOrganizationProgramStatus.mockRejectedValueOnce(prismaFailure());
    const failed = await postPrograms(post("/api/programs", { action: "updateStatus", organizationId: cuid, programId: cuid, status: "SUSPENDED" }));
    expect(failed.status).toBe(404);
    expect((await failed.json() as { message: string }).message).toMatch(sanitized("Programs command failed"));
  });
});

describe("talent route", () => {
  it("refuses filters that are not part of the contract instead of passing them to the database", async () => {
    const response = await getTalent(new NextRequest("http://localhost/api/talent?workMode=NOT_A_MODE"));
    expect(response.status).toBe(400);
    expect(mocks.listJobPostings).not.toHaveBeenCalled();
    expect((await getTalent(new NextRequest("http://localhost/api/talent?status=nope"))).status).toBe(400);
    expect((await getTalent(new NextRequest(`http://localhost/api/talent?search=${"x".repeat(161)}`))).status).toBe(400);
  });

  it("forwards valid filters and leaves paging to the service when the numbers are missing or not numbers", async () => {
    for (const mock of [mocks.listOwnedJobApplications, mocks.listMyJobApplications, mocks.listSavedJobs, mocks.listDiscoverableTalent, mocks.listSoftwareOrganizations]) mock.mockResolvedValue([]);
    mocks.listJobPostings.mockResolvedValue([]);
    mocks.getTalentProfile.mockResolvedValue({ profile: null, cvDocuments: [] });
    mocks.listTalentMatches.mockResolvedValue({ candidateMatches: [], employerMatches: [] });
    mocks.listEmployerTalentResources.mockResolvedValue({ shortlists: [], supportTickets: [] });

    const response = await getTalent(new NextRequest("http://localhost/api/talent?workMode=HYBRID&status=PUBLISHED&limit=abc&offset=999999999999"));
    expect(response.status).toBe(200);
    expect(mocks.listJobPostings).toHaveBeenCalledWith("user-1", expect.objectContaining({ workMode: "HYBRID", status: "PUBLISHED", limit: Number.NaN, offset: 999_999_999_999 }));
  });

  it("bounds salaries to what an integer column can hold", async () => {
    const posting = { action: "create", title: "Operations lead", description: "A role description that is comfortably longer than twenty characters.", workMode: "REMOTE" };
    mocks.createJobPosting.mockResolvedValue({ id: "posting" });
    expect((await postTalent(post("/api/talent", { ...posting, salaryMinMinor: 1, salaryMaxMinor: 3_000_000_000 }))).status).toBe(400);
    expect((await postTalent(post("/api/talent", { ...posting, salaryMinMinor: 1, salaryMaxMinor: 2_000_000_000 }))).status).toBe(201);
    expect(mocks.createJobPosting).toHaveBeenCalledTimes(1);
  });

  it("answers a database failure generically and keeps the 404 for a missing record", async () => {
    mocks.updateJobPostingStatus.mockRejectedValueOnce(prismaFailure());
    const failed = await postTalent(post("/api/talent", { action: "updateStatus", jobPostingId: cuid, status: "PUBLISHED" }));
    expect(failed.status).toBe(409);
    const body = await failed.json() as { message: string };
    expect(body.message).toMatch(sanitized("Talent command failed"));
    expect(body.message).not.toMatch(leaks);

    mocks.updateJobPostingStatus.mockRejectedValueOnce(new Error("Job posting not found"));
    const missing = await postTalent(post("/api/talent", { action: "updateStatus", jobPostingId: cuid, status: "PUBLISHED" }));
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ message: "Job posting not found" });
  });
});

describe("software operations route", () => {
  function workspaceMocks() {
    mocks.listSoftwareOrganizations.mockResolvedValue([{ isOwner: false, organization: { id: cuid, name: "Org" } }]);
    mocks.getSoftwareCompany.mockResolvedValue({ id: cuid, currentUserIsOwner: false, members: [] });
    mocks.listSalesWorkspace.mockResolvedValue({});
    mocks.listSoftwareOperations.mockResolvedValue({});
  }

  it("builds the workspace with the member-aware HR section, never the owner-only reader", async () => {
    workspaceMocks();
    mocks.listSoftwareHrForMember.mockResolvedValue({ employees: [], attendance: [], leaveRequests: [], payrollRuns: [], reviews: [] });
    const response = await getOperations(new NextRequest(`http://localhost/api/software/operations?organizationId=${cuid}`));
    expect(response.status).toBe(200);
    const body = await response.json() as { workspace: { hr: { employees: unknown[] } } };
    expect(body.workspace.hr.employees).toEqual([]);
    expect(mocks.listSoftwareHrForMember).toHaveBeenCalledWith(cuid, "user-1");
    expect(mocks.listSoftwareHr).not.toHaveBeenCalled();
  });

  it("does not echo a database error from the workspace and keeps the 403 for a refused member", async () => {
    workspaceMocks();
    mocks.listSoftwareHrForMember.mockRejectedValueOnce(prismaFailure());
    const failed = await getOperations(new NextRequest(`http://localhost/api/software/operations?organizationId=${cuid}`));
    expect(failed.status).toBe(404);
    const body = await failed.json() as { message: string };
    expect(body.message).toMatch(sanitized("Software workspace failed"));
    expect(body.message).not.toMatch(leaks);

    mocks.listSoftwareHrForMember.mockRejectedValueOnce(new Error("Active organization membership required"));
    const refused = await getOperations(new NextRequest(`http://localhost/api/software/operations?organizationId=${cuid}`));
    expect(refused.status).toBe(403);
  });

  it("answers command failures generically and keeps the readable business refusals", async () => {
    mocks.postPayrollRun.mockRejectedValueOnce(prismaFailure());
    const failed = await postOperations(post("/api/software/operations", { action: "postPayroll", organizationId: cuid, payrollRunId: cuid }));
    expect(failed.status).toBe(409);
    expect((await failed.json() as { message: string }).message).toMatch(sanitized("Software command failed"));

    mocks.postPayrollRun.mockRejectedValueOnce(new Error("Payroll run has already been posted"));
    const duplicate = await postOperations(post("/api/software/operations", { action: "postPayroll", organizationId: cuid, payrollRunId: cuid }));
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({ message: "Payroll run has already been posted" });

    mocks.postPayrollRun.mockRejectedValueOnce(new Error("Organization owner access required"));
    expect((await postOperations(post("/api/software/operations", { action: "postPayroll", organizationId: cuid, payrollRunId: cuid }))).status).toBe(403);
  });
});
