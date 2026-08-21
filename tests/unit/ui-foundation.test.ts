import { describe, expect, it } from "vitest";
import {
  canSubmitForm,
  createTypographyProfile,
  getIconPath,
  getMotionTokens,
  getShellLayout,
  listRegisteredIcons,
  resolveMotionLevel,
  validateTextField,
} from "@/packages/ui-foundation/src";

describe("ui-foundation engines", () => {
  it("creates Arabic typography profile with RTL direction", () => {
    const profile = createTypographyProfile("ar", "rtl");
    expect(profile.direction).toBe("rtl");
    expect(profile.body.family).toBe("Cairo");
    expect(profile.body.lineHeight).toBeGreaterThan(1.7);
  });

  it("resolves icon registry deterministically", () => {
    const icons = listRegisteredIcons();
    expect(icons).toContain("sparkles");
    expect(getIconPath("mail")).toContain("M4 6h16v12H4z");
  });

  it("returns known shell presets", () => {
    const auth = getShellLayout("auth");
    const admin = getShellLayout("admin");
    expect(auth.columns).toBe(3);
    expect(admin.hasSidebar).toBe(true);
  });

  it("validates forms and submit eligibility", () => {
    const issues = validateTextField("a", {
      name: "displayName",
      required: true,
      minLength: 2,
    });
    expect(issues.length).toBe(1);
    expect(canSubmitForm("idle", issues)).toBe(false);
    expect(canSubmitForm("loading", [])).toBe(false);
    expect(canSubmitForm("idle", [])).toBe(true);
  });

  it("applies reduced motion tokens", () => {
    const level = resolveMotionLevel(true);
    expect(level).toBe("reduced");
    const tokens = getMotionTokens(level);
    expect(tokens.every((t) => t.durationMs <= 100)).toBe(true);
  });
});
