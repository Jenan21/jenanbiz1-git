import { describe, expect, it } from "vitest";
import { isPublicRegistrationAllowed } from "@/lib/auth/registration-policy";

describe("isPublicRegistrationAllowed", () => {
  it("closes public registration by default in production", () => {
    expect(isPublicRegistrationAllowed({ NODE_ENV: "production" })).toBe(false);
  });

  it("requires explicit production opt-in and remains available for local testing", () => {
    expect(isPublicRegistrationAllowed({ NODE_ENV: "production", ALLOW_PUBLIC_REGISTRATION: "true" })).toBe(true);
    expect(isPublicRegistrationAllowed({ NODE_ENV: "development" })).toBe(true);
  });
});