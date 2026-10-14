import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_LENGTH, passwordProblem, passwordProblemMessage } from "@/lib/auth/password-policy";
import { registerSchema } from "@/lib/auth/validation";

const registration = { displayName: "Test Person", email: "test.person@example.test", locale: "en", language: "en", countryCode: "SA" } as const;

describe("password policy (four characters, one capital letter)", () => {
  it("accepts a short password that has a capital letter", () => {
    for (const value of ["Abcd", "aBcd", "abcD", "A123", "Jenan2030", "ABCD", "Ab!x", "كلمةA"]) {
      expect(passwordProblem(value), value).toBeNull();
    }
  });

  it("asks for four characters and for a capital letter, nothing more", () => {
    expect(passwordProblem("")).toBe("TOO_SHORT");
    expect(passwordProblem("Abc")).toBe("TOO_SHORT");
    expect(passwordProblem("abcd")).toBe("NO_UPPERCASE");
    expect(passwordProblem("1234")).toBe("NO_UPPERCASE");
    expect(passwordProblem("abcdefghijklmnop1!")).toBe("NO_UPPERCASE");
  });

  it("keeps an upper bound so hashing work stays bounded", () => {
    expect(passwordProblem("A".repeat(PASSWORD_MAX_LENGTH))).toBeNull();
    expect(passwordProblem("A".repeat(PASSWORD_MAX_LENGTH + 1))).toBe("TOO_LONG");
  });

  it("gives a message in both languages", () => {
    expect(passwordProblemMessage("NO_UPPERCASE", "ar")).toContain("حرف كبير");
    expect(passwordProblemMessage("TOO_SHORT", "en")).toContain("4");
  });

  it("is enforced by the registration schema", () => {
    expect(registerSchema.safeParse({ ...registration, password: "Abcd" }).success).toBe(true);
    expect(registerSchema.safeParse({ ...registration, password: "abcd" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...registration, password: "Abc" }).success).toBe(false);
  });
});
