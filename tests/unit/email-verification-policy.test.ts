import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { EmailNotVerifiedError, emailVerificationRequired, requireVerifiedEmail } from "@/lib/auth/email-verification-policy";
import type { DbExecutor } from "@/lib/db";

const executorFor = (emailVerifiedAt: Date | null | undefined) =>
  ({ user: { findUnique: vi.fn().mockResolvedValue(emailVerifiedAt === undefined ? null : { emailVerifiedAt }) } }) as unknown as DbExecutor;

describe("email verification policy", () => {
  it("is off while the platform is private and on after the public launch", () => {
    expect(emailVerificationRequired({})).toBe(false);
    expect(emailVerificationRequired({ PUBLIC_LAUNCH: "pending" })).toBe(false);
    expect(emailVerificationRequired({ PUBLIC_LAUNCH: "approved" })).toBe(true);
  });

  it("lets the owner decide explicitly, in either direction", () => {
    expect(emailVerificationRequired({ REQUIRE_EMAIL_VERIFICATION: "true" })).toBe(true);
    expect(emailVerificationRequired({ REQUIRE_EMAIL_VERIFICATION: " TRUE " })).toBe(true);
    expect(emailVerificationRequired({ REQUIRE_EMAIL_VERIFICATION: "false", PUBLIC_LAUNCH: "approved" })).toBe(false);
  });

  it("does not even read the account while verification is not required", async () => {
    const executor = executorFor(null);
    await expect(requireVerifiedEmail("user-1", executor, {})).resolves.toBeUndefined();
    expect(executor.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an unverified or missing account and accepts a verified one", async () => {
    const env = { REQUIRE_EMAIL_VERIFICATION: "true" };
    await expect(requireVerifiedEmail("user-1", executorFor(null), env)).rejects.toBeInstanceOf(EmailNotVerifiedError);
    await expect(requireVerifiedEmail("user-1", executorFor(undefined), env)).rejects.toBeInstanceOf(EmailNotVerifiedError);
    await expect(requireVerifiedEmail("user-1", executorFor(new Date()), env)).resolves.toBeUndefined();
  });

  it("carries a stable code that is safe to show", () => {
    const error = new EmailNotVerifiedError();
    expect(error).toMatchObject({ code: "EMAIL_NOT_VERIFIED", name: "EmailNotVerifiedError", message: "Verify your e-mail address first" });
  });
});
