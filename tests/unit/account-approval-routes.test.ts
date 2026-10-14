import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "admin-1", systemRole: "ADMIN" } as { id: string; systemRole: string } | null,
  validOrigin: true,
  limiter: vi.fn(),
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  registerPending: vi.fn(),
  notify: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  list: vi.fn(),
  setSessionCookie: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: (task: () => unknown) => void task() }));
vi.mock("@/lib/db", () => ({ db: { user: { findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => mocks.user, setSessionCookie: mocks.setSessionCookie }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: () => mocks.validOrigin, getRequestContext: () => ({ ipAddress: "192.0.2.1" }) }));
vi.mock("@/lib/rate-limit/auth-rate-limit", () => ({ checkAuthRateLimit: mocks.limiter }));
vi.mock("@/services/auth/auth.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/auth/auth.service")>()),
  registerUser: mocks.registerUser,
  loginUser: mocks.loginUser,
}));
vi.mock("@/services/auth/account-approval-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/auth/account-approval-service")>()),
  registerPendingUser: mocks.registerPending,
  notifyOwnersOfPendingAccount: mocks.notify,
  approveAccount: mocks.approve,
  rejectAccount: mocks.reject,
  listPendingAccounts: mocks.list,
}));

import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as listUsers, POST as decide } from "@/app/api/admin/users/route";
import { AccountApprovalError } from "@/services/auth/account-approval-service";
import { AuthenticationError } from "@/services/auth/auth.service";

const body = { displayName: "New Person", email: "new.person@example.test", password: "Correct-horse-battery-12", locale: "en", language: "en", countryCode: "SA" };
const json = (url: string, payload: unknown) => new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.user = { id: "admin-1", systemRole: "ADMIN" };
  mocks.validOrigin = true;
  mocks.limiter.mockResolvedValue({ allowed: true });
  mocks.notify.mockResolvedValue({ sent: 1 });
  mocks.list.mockResolvedValue([]);
});

afterEach(() => vi.unstubAllEnvs());

describe("registration while approval is required", () => {
  beforeEach(() => vi.stubEnv("REQUIRE_ACCOUNT_APPROVAL", "true"));

  it("answers 202, sets no cookie and starts no session", async () => {
    mocks.registerPending.mockResolvedValue({ id: "u1", email: body.email, profile: { displayName: body.displayName } });
    const response = await register(json("/api/auth/register", body));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ status: "PENDING_APPROVAL" });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.setSessionCookie).not.toHaveBeenCalled();
    expect(mocks.registerUser).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith({ displayName: body.displayName, email: body.email, id: "u1" });
  });

  it("still reports a duplicate address and bad input like before", async () => {
    mocks.registerPending.mockRejectedValue(new AuthenticationError("DUPLICATE_EMAIL"));
    expect((await register(json("/api/auth/register", body))).status).toBe(409);
    expect((await register(json("/api/auth/register", { ...body, password: "short" }))).status).toBe(400);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("does not let a failed owner notice break the registration", async () => {
    mocks.registerPending.mockResolvedValue({ id: "u2", email: body.email, profile: null });
    mocks.notify.mockRejectedValue(new Error("mail down"));
    expect((await register(json("/api/auth/register", body))).status).toBe(202);
  });
});

describe("registration while approval is not required", () => {
  it("keeps signing the new person in", async () => {
    vi.stubEnv("REQUIRE_ACCOUNT_APPROVAL", "false");
    mocks.registerUser.mockResolvedValue({ user: { id: "u3", email: body.email, profile: null }, token: "t", expiresAt: new Date(Date.now() + 1000) });
    const response = await register(json("/api/auth/register", body));
    expect(response.status).toBe(201);
    expect(mocks.setSessionCookie).toHaveBeenCalledTimes(1);
    expect(mocks.registerPending).not.toHaveBeenCalled();
  });
});

describe("sign-in of a waiting account", () => {
  it("answers 403 with a stable code, and 401 for a wrong password", async () => {
    mocks.loginUser.mockRejectedValueOnce(new AuthenticationError("PENDING_APPROVAL"));
    const waiting = await login(json("/api/auth/login", { email: body.email, password: body.password }));
    expect(waiting.status).toBe(403);
    await expect(waiting.json()).resolves.toEqual({ error: "PENDING_APPROVAL" });
    expect(waiting.headers.get("set-cookie")).toBeNull();

    mocks.loginUser.mockRejectedValueOnce(new AuthenticationError("INVALID_CREDENTIALS"));
    expect((await login(json("/api/auth/login", { email: body.email, password: "wrong-wrong-wrong" }))).status).toBe(401);
  });
});

describe("admin approval route", () => {
  it("refuses everybody who is not an administrator, and cross-site requests", async () => {
    mocks.user = null;
    expect((await decide(json("/api/admin/users", { action: "approve", userId: "u1" }))).status).toBe(403);
    expect((await listUsers()).status).toBe(403);
    mocks.user = { id: "member-1", systemRole: "USER" };
    expect((await decide(json("/api/admin/users", { action: "approve", userId: "u1" }))).status).toBe(403);
    mocks.user = { id: "admin-1", systemRole: "ADMIN" };
    mocks.validOrigin = false;
    expect((await decide(json("/api/admin/users", { action: "approve", userId: "u1" }))).status).toBe(403);
    expect(mocks.approve).not.toHaveBeenCalled();
    expect(mocks.reject).not.toHaveBeenCalled();
  });

  it("validates the command", async () => {
    for (const payload of [null, {}, { action: "delete", userId: "u1" }, { action: "approve" }, { action: "approve", userId: "" }, { action: "approve", userId: "x".repeat(65) }]) {
      expect((await decide(json("/api/admin/users", payload))).status).toBe(400);
    }
    expect(mocks.approve).not.toHaveBeenCalled();
  });

  it("approves and declines on behalf of the signed-in administrator", async () => {
    mocks.approve.mockResolvedValue({ id: "u1", email: "a@example.test", notified: "email" });
    mocks.reject.mockResolvedValue({ id: "u2" });
    const approved = await decide(json("/api/admin/users", { action: "approve", userId: "u1" }));
    expect(approved.status).toBe(200);
    await expect(approved.json()).resolves.toMatchObject({ success: true, result: { id: "u1" } });
    expect(mocks.approve).toHaveBeenCalledWith("u1", "admin-1", expect.objectContaining({ schedule: expect.any(Function) }));
    expect((await decide(json("/api/admin/users", { action: "reject", userId: "u2" }))).status).toBe(200);
    expect(mocks.reject).toHaveBeenCalledWith("u2", "admin-1");
  });

  it("answers 409 when the account is not waiting and never echoes internals", async () => {
    mocks.approve.mockRejectedValueOnce(new AccountApprovalError());
    const conflict = await decide(json("/api/admin/users", { action: "approve", userId: "u1" }));
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ success: false, message: "This account is not waiting for approval" });

    mocks.approve.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432 at /app/services/x.ts:12:3'));
    const failure = await decide(json("/api/admin/users", { action: "approve", userId: "u1" }));
    expect(failure.status).toBe(409);
    expect(JSON.stringify(await failure.json())).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|\.ts:\d+/);
  });
});
