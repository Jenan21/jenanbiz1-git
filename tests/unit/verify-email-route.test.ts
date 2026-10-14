import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1", email: "person@example.test" } as { id: string; email: string } | null,
  validOrigin: true,
  limiter: vi.fn(),
  request: vi.fn(),
  confirm: vi.fn(),
  status: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: (task: () => unknown) => void task() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mocks.user }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: () => mocks.validOrigin, getRequestContext: () => ({ ipAddress: "192.0.2.1" }) }));
vi.mock("@/lib/rate-limit/auth-rate-limit", () => ({ checkAuthRateLimit: mocks.limiter }));
vi.mock("@/services/auth/email-verification-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/auth/email-verification-service")>()),
  requestEmailVerification: mocks.request,
  confirmEmailVerification: mocks.confirm,
  getEmailVerificationStatus: mocks.status,
}));

import { GET, POST } from "@/app/api/auth/verify-email/route";
import { EmailVerificationError } from "@/services/auth/email-verification-service";

const post = (body: unknown) => new NextRequest("http://localhost/api/auth/verify-email", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.user = { id: "user-1", email: "person@example.test" };
  mocks.validOrigin = true;
  mocks.limiter.mockResolvedValue({ allowed: true });
  mocks.status.mockResolvedValue({ verified: false });
});

describe("verify-email route", () => {
  it("answers 401 without a session and never reaches the service", async () => {
    mocks.user = null;
    expect((await GET()).status).toBe(401);
    expect((await POST(post({ action: "request" }))).status).toBe(401);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.limiter).not.toHaveBeenCalled();
  });

  it("reports the status of the signed-in account only", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ email: "person@example.test", required: false, verified: false });
  });

  it("rejects a foreign origin and a request over the limit", async () => {
    mocks.validOrigin = false;
    expect((await POST(post({ action: "request" }))).status).toBe(403);
    mocks.validOrigin = true;
    mocks.limiter.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });
    const limited = await POST(post({ action: "request" }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("42");
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("validates the command and the shape of the code", async () => {
    expect((await POST(post({ action: "nope" }))).status).toBe(400);
    expect((await POST(post({ action: "confirm", code: "12345" }))).status).toBe(400);
    expect((await POST(post({ action: "confirm", code: "12345a" }))).status).toBe(400);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("requests a code for the signed-in account and confirms one", async () => {
    mocks.request.mockResolvedValue({ delivery: "email", expiresAt: null, resendAfterSeconds: 60 });
    const requested = await POST(post({ action: "request" }));
    expect(requested.status).toBe(200);
    expect(mocks.request).toHaveBeenCalledWith("user-1", { ipAddress: "192.0.2.1" }, undefined, expect.any(Function));
    await expect(requested.json()).resolves.toMatchObject({ email: "person@example.test", delivery: "email" });

    mocks.confirm.mockResolvedValue({ verified: true, alreadyVerified: false });
    const confirmed = await POST(post({ action: "confirm", code: "123456" }));
    expect(confirmed.status).toBe(200);
    await expect(confirmed.json()).resolves.toEqual({ verified: true, alreadyVerified: false });
    expect(mocks.confirm).toHaveBeenCalledWith("user-1", "123456", { ipAddress: "192.0.2.1" });
  });

  it("maps the service's refusals to stable codes", async () => {
    mocks.confirm.mockRejectedValueOnce(new EmailVerificationError("INVALID_OR_EXPIRED_CODE"));
    const invalid = await POST(post({ action: "confirm", code: "123456" }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ error: "INVALID_OR_EXPIRED_CODE" });

    mocks.request.mockRejectedValueOnce(new EmailVerificationError("TOO_SOON", 30));
    const soon = await POST(post({ action: "request" }));
    expect(soon.status).toBe(429);
    expect(soon.headers.get("retry-after")).toBe("30");

    mocks.request.mockRejectedValueOnce(new EmailVerificationError("ALREADY_VERIFIED"));
    const already = await POST(post({ action: "request" }));
    expect(already.status).toBe(200);
    await expect(already.json()).resolves.toEqual({ verified: true, alreadyVerified: true });

    mocks.request.mockRejectedValueOnce(new EmailVerificationError("ACCOUNT_UNAVAILABLE"));
    expect((await POST(post({ action: "request" }))).status).toBe(403);
  });

  it("does not echo an unexpected failure", async () => {
    mocks.confirm.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const response = await POST(post({ action: "confirm", code: "123456" }));
    expect(response.status).toBe(500);
    const text = JSON.stringify(await response.json());
    expect(text).toBe('{"error":"VERIFICATION_FAILED"}');
  });
});
