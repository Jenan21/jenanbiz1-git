import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn(), hasPlatformAdminAccess: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: auth.getCurrentUser }));
vi.mock("@/lib/auth/authorization", () => ({ hasPlatformAdminAccess: auth.hasPlatformAdminAccess }));
vi.mock("@/components/admin/admin-shell", () => ({ AdminShell: ({ children }: { children: ReactNode }) => children }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); },
  forbidden: () => { throw new Error("FORBIDDEN"); },
}));

import JenanMapAdminLayout from "./layout";

describe("Jenan PRO Map server-side admin boundary", () => {
  beforeEach(() => {
    auth.getCurrentUser.mockReset();
    auth.hasPlatformAdminAccess.mockReset();
  });

  it("redirects unauthenticated visitors before rendering admin controls", async () => {
    auth.getCurrentUser.mockResolvedValue(null);
    await expect(JenanMapAdminLayout({ children: "secret" })).rejects.toThrow("REDIRECT:/auth?next=%2Fadmin%2Fjenan-map");
    expect(auth.hasPlatformAdminAccess).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-admin accounts", async () => {
    auth.getCurrentUser.mockResolvedValue({ systemRole: "USER" });
    auth.hasPlatformAdminAccess.mockReturnValue(false);
    await expect(JenanMapAdminLayout({ children: "secret" })).rejects.toThrow("FORBIDDEN");
    expect(auth.hasPlatformAdminAccess).toHaveBeenCalledWith("USER");
  });

  it("allows platform admins through the existing authorization helper", async () => {
    auth.getCurrentUser.mockResolvedValue({ systemRole: "ADMIN" });
    auth.hasPlatformAdminAccess.mockReturnValue(true);
    const result = await JenanMapAdminLayout({ children: "admin-content" });
    expect(result.props.children).toBe("admin-content");
  });
});
