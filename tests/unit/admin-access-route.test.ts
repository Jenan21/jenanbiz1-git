import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: null as { systemRole: string } | null }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mocks.user }));

import { GET } from "@/app/api/auth/admin-access/route";

beforeEach(() => {
  mocks.user = null;
});

describe("admin access probe", () => {
  it("refuses a visitor without a session like every other private route", async () => {
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "AUTHENTICATION_REQUIRED" });
  });

  it("is true only for administrators and the platform owner", async () => {
    for (const [role, expected] of [["USER", false], ["EMPLOYEE", false], ["MANAGER", false], ["ELITE_COMMITTEE", false], ["ADMIN", true], ["SUPER_ADMIN", true]] as const) {
      mocks.user = { systemRole: role };
      await expect((await GET()).json(), role).resolves.toEqual({ admin: expected });
    }
  });

  it("reveals nothing but the yes or no", async () => {
    mocks.user = { systemRole: "SUPER_ADMIN" };
    expect(Object.keys(await (await GET()).json() as object)).toEqual(["admin"]);
  });
});
