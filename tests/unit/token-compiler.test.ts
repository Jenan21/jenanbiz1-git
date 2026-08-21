import { describe, expect, it } from "vitest";
import { compileTokens } from "@/packages/token-compiler/src";

describe("token-compiler", () => {
  it("compiles token groups into css vars and ts module", () => {
    const compiled = compileTokens({
      colors: { brandPrimary: "#00d4ff", textMain: "#f1f5f9" },
      spacing: { sm: 8, md: "16px" },
      radius: { card: 12 },
    });

    expect(compiled.flat["--jenan-color-brand-primary"]).toBe("#00d4ff");
    expect(compiled.flat["--jenan-space-sm"]).toBe("8");
    expect(compiled.cssVariables).toContain("--jenan-radius-card: 12;");
    expect(compiled.tsModule).toContain("export const jenanTokens");
  });
});
