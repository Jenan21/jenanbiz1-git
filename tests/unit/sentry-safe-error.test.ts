import { afterEach, describe, expect, it, vi } from "vitest";
import { captureException } from "@sentry/nextjs";
import { publicErrorMessage } from "@/lib/http/safe-error";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("safe-error Sentry reporting", () => {
  it("reports unexpected errors with the existing reference without changing the response", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new TypeError("Unexpected failure");
    const message = publicErrorMessage(error);
    const reference = message.match(/\(ref ([a-f0-9]{8})\)$/)?.[1];
    expect(reference).toBeDefined();
    expect(message).toBe(`The request could not be completed. (ref ${reference})`);
    expect(captureException).toHaveBeenCalledWith(error, { tags: { reference } });
  });

  it("does not report expected validation or email verification errors", () => {
    expect(publicErrorMessage(new Error("Choose a project name."))).toBe("Choose a project name.");
    const verification = Object.assign(new Error("Verify your email."), { name: "EmailNotVerifiedError", code: "EMAIL_NOT_VERIFIED" });
    expect(publicErrorMessage(verification)).toBe("Verify your email.");
    expect(captureException).not.toHaveBeenCalled();
  });
});
