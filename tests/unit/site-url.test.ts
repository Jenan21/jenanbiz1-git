import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "@/lib/platform/site-url";

describe("resolveSiteUrl", () => {
  it("follows the configured public origin", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_APP_URL: "https://jenanpro.sa" }).href).toBe("https://jenanpro.sa/");
    expect(resolveSiteUrl({ NEXT_PUBLIC_APP_URL: "https://jenan-pro-private.vercel.app" }).href).toBe(
      "https://jenan-pro-private.vercel.app/",
    );
  });

  it("keeps only the origin and ignores whitespace, paths and trailing slashes", () => {
    expect(resolveSiteUrl({ NEXT_PUBLIC_APP_URL: "  https://jenanpro.sa/ar/home?x=1  " }).href).toBe("https://jenanpro.sa/");
  });

  it("falls back to the local origin when unset, blank or malformed", () => {
    for (const value of [undefined, "", "   ", "not a url", "jenanpro.sa"]) {
      expect(resolveSiteUrl({ NEXT_PUBLIC_APP_URL: value }).href, String(value)).toBe("http://localhost:3000/");
    }
    expect(resolveSiteUrl({}).href).toBe("http://localhost:3000/");
  });
});
