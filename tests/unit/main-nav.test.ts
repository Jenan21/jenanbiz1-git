import { describe, expect, it } from "vitest";
import { MAIN_NAV, activeNavHref, roleLabel } from "@/lib/navigation/main-nav";

describe("main navigation", () => {
  it("lists the sections once, home first, each with an Arabic and an English name", () => {
    expect(MAIN_NAV[0]?.href).toBe("/dashboard");
    expect(new Set(MAIN_NAV.map((item) => item.href)).size).toBe(MAIN_NAV.length);
    for (const item of MAIN_NAV) {
      expect(item.label[0]).toMatch(/[\u0600-\u06ff]/);
      expect(item.label[1]).toMatch(/[A-Za-z]/);
    }
    expect(MAIN_NAV.map((item) => item.href)).not.toContain("/admin");
  });

  it("marks the section a page belongs to, including pages that live under another path", () => {
    expect(activeNavHref("/projects")).toBe("/projects");
    expect(activeNavHref("/projects/analysis/result")).toBe("/projects");
    expect(activeNavHref("/academy/courses/c1/lesson/1")).toBe("/business");
    expect(activeNavHref("/market/listings")).toBe("/business");
    expect(activeNavHref("/talent/jobs")).toBe("/business");
    expect(activeNavHref("/marketing/leads")).toBe("/business");
    expect(activeNavHref("/software/files")).toBe("/software");
    expect(activeNavHref("/notifications")).toBe("/notifications");
    expect(activeNavHref("/user/onboarding")).toBe("/user");
    expect(activeNavHref("/dashboard")).toBe("/dashboard");
    expect(activeNavHref("/user/investments")).toBe("/projects");
    expect(activeNavHref("/programs")).toBe("/dashboard");
    expect(activeNavHref("/studio/pdf")).toBe("/software");
    expect(activeNavHref("/pricing")).toBe("/benefits");
  });

  it("does not match a section by a shared prefix of its name", () => {
    expect(activeNavHref("/projectsarchive")).toBeUndefined();
    expect(activeNavHref("/marketing-x")).toBeUndefined();
    expect(activeNavHref("/marketing")).toBe("/business");
    expect(activeNavHref("/market")).toBe("/business");
  });

  it("labels the account by role and falls back to member", () => {
    expect(roleLabel("SUPER_ADMIN", 0)).toBe("مالك المنصة");
    expect(roleLabel("ADMIN", 1)).toBe("Administrator");
    expect(roleLabel("EMPLOYEE", 1)).toBe("Platform team");
    expect(roleLabel("USER", 1)).toBe("Member");
    expect(roleLabel(undefined, 0)).toBe("عضو");
    expect(roleLabel("SOMETHING_NEW", 1)).toBe("Member");
  });
});
