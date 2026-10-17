import { describe, expect, it } from "vitest";
import { MAIN_NAV, activeNavHref, roleLabel } from "@/lib/navigation/main-nav";

describe("main navigation", () => {
  it("is exactly the five final sections, each with an Arabic and an English name", () => {
    expect(MAIN_NAV.map((item) => item.href)).toEqual(["/projects", "/software", "/business", "/user", "/notifications"]);
    expect(MAIN_NAV.map((item) => item.label[0])).toEqual([
      "المشاريع والاستثمار",
      "البرمجيات والحلول",
      "منظومة الأعمال",
      "بياناتي",
      "الإشعارات",
    ]);
    for (const item of MAIN_NAV) {
      expect(item.label[0]).toMatch(/[\u0600-\u06ff]/);
      expect(item.label[1]).toMatch(/[A-Za-z]/);
    }
    expect(MAIN_NAV.map((item) => item.href)).not.toContain("/admin");
  });

  it("no longer offers the retired home and about items", () => {
    const hrefs = MAIN_NAV.map((item) => item.href);
    expect(hrefs).not.toContain("/dashboard");
    expect(hrefs).not.toContain("/benefits");
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
    expect(activeNavHref("/user/investments")).toBe("/projects");
    expect(activeNavHref("/studio/pdf")).toBe("/software");
  });

  it("highlights nothing on pages that no header item stands for", () => {
    expect(activeNavHref("/dashboard")).toBeUndefined();
    expect(activeNavHref("/programs")).toBeUndefined();
    expect(activeNavHref("/pricing")).toBeUndefined();
    expect(activeNavHref("/benefits")).toBeUndefined();
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
