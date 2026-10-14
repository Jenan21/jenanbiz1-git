import { describe, expect, it } from "vitest";
import { resolvePostSignInPath } from "@/lib/auth/redirect";

const origin = "https://jenanpro.sa";

describe("resolvePostSignInPath", () => {
  it("keeps same-site paths with their query and hash", () => {
    expect(resolvePostSignInPath("/projects/start", origin)).toBe("/projects/start");
    expect(resolvePostSignInPath("/market/listings?kind=BUSINESS&q=%D9%85", origin)).toBe("/market/listings?kind=BUSINESS&q=%D9%85");
    expect(resolvePostSignInPath("/studio/pdf/editor?tool=convert#top", origin)).toBe("/studio/pdf/editor?tool=convert#top");
  });

  it("falls back for every way of naming another origin", () => {
    for (const hostile of [
      "//evil.com",
      "///evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "\\\\evil.com",
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r/evil.com",
      "/\u0000/evil.com",
      "https://evil.com",
      "http://evil.com/path",
      "javascript:alert(1)",
      "data:text/html,x",
      "evil.com",
      "",
    ]) {
      expect(resolvePostSignInPath(hostile, origin), JSON.stringify(hostile)).toBe("/dashboard");
    }
  });

  it("falls back for missing, oversized or malformed input", () => {
    expect(resolvePostSignInPath(null, origin)).toBe("/dashboard");
    expect(resolvePostSignInPath(undefined, origin)).toBe("/dashboard");
    expect(resolvePostSignInPath(`/${"a".repeat(600)}`, origin)).toBe("/dashboard");
    expect(resolvePostSignInPath("/ok", "not an origin")).toBe("/dashboard");
  });

  it("uses a custom fallback when asked", () => {
    expect(resolvePostSignInPath("//evil.com", origin, "/user/onboarding")).toBe("/user/onboarding");
  });

  it("never resolves to another origin, whatever the input", () => {
    const candidates = ["/a", "//a", "/\\a", "/%09/a", "/%2F/a", "/./a", "/../a", "/a?b=//c", "/a#//b"];
    for (const candidate of candidates) {
      const result = resolvePostSignInPath(candidate, origin);
      expect(new URL(result, origin).origin, candidate).toBe(origin);
    }
  });
});
