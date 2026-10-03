import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/projects/[projectId]/report/route";
import { getCurrentUser } from "@/lib/auth/session";
import { getUserProject } from "@/services/projects/project-service";
import { createProjectReport } from "@/services/projects/project-report";
import { searchProjectIntelligence } from "@/services/projects/project-intelligence";
import { checkProjectRateLimit } from "@/lib/rate-limit/project-rate-limit";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/services/projects/project-service", () => ({ getUserProject: vi.fn() }));
vi.mock("@/services/projects/project-report", () => ({ createProjectReport: vi.fn() }));
vi.mock("@/services/projects/project-intelligence", () => ({ searchProjectIntelligence: vi.fn() }));
vi.mock("@/lib/rate-limit/project-rate-limit", () => ({ checkProjectRateLimit: vi.fn() }));

const context = { params: Promise.resolve({ projectId: "project-id" }) };
const request = (query = "") => new NextRequest(`https://app.test/api/projects/project-id/report${query}`);

describe("project report authorization and resource limits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner" } as never);
    vi.mocked(getUserProject).mockResolvedValue({ id: "project-id" } as never);
    vi.mocked(checkProjectRateLimit).mockResolvedValue({ allowed: true } as never);
    vi.mocked(createProjectReport).mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  });
  it("rejects an anonymous request before rendering or external research", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await GET(request("?location=Riyadh"), context)).status).toBe(401);
    expect(createProjectReport).not.toHaveBeenCalled();
    expect(searchProjectIntelligence).not.toHaveBeenCalled();
  });
  it("authorizes project access before calling the external provider", async () => {
    vi.mocked(getUserProject).mockResolvedValue(null);
    expect((await GET(request("?location=Riyadh"), context)).status).toBe(404);
    expect(checkProjectRateLimit).not.toHaveBeenCalled();
    expect(searchProjectIntelligence).not.toHaveBeenCalled();
    expect(createProjectReport).not.toHaveBeenCalled();
  });
  it("limits reports and validates the external-query length", async () => {
    vi.mocked(checkProjectRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 60 } as never);
    const denied = await GET(request("?location=Riyadh"), context);
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("60");
    expect(createProjectReport).not.toHaveBeenCalled();
    expect(searchProjectIntelligence).not.toHaveBeenCalled();
    vi.mocked(checkProjectRateLimit).mockResolvedValue({ allowed: true } as never);
    expect((await GET(request(`?location=${"a".repeat(201)}`), context)).status).toBe(400);
  });
  it("keeps successful downloads private and hides rendering/provider errors", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    vi.mocked(createProjectReport).mockRejectedValue(new Error("private database detail"));
    const failed = await GET(request(), context);
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("private database detail");
  });
});
