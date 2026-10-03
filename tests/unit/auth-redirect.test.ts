import { describe, expect, it } from "vitest";
import { safeAuthRedirect } from "@/lib/auth/redirect";

describe("post-login redirect", () => {
  it.each([
    null, "", "//attacker.test", "/\\attacker.test", "/\t/attacker.test",
    "/\n/attacker.test", "/\r/attacker.test", "https://attacker.test",
    "javascript:alert(1)",
    new URLSearchParams("next=/%5Cattacker.test").get("next"),
    new URLSearchParams("next=/%09/attacker.test").get("next"),
  ])("rejects unsafe destination %j", (value) => {
    expect(safeAuthRedirect(value, "https://app.test")).toBe("/dashboard");
  });

  it("preserves local routes, query parameters and fragments", () => {
    expect(safeAuthRedirect("/account?tab=projects#recent", "https://app.test")).toBe("/account?tab=projects#recent");
  });
});
