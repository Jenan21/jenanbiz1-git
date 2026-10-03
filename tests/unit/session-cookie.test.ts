import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSessionCookie, setSessionCookie, SESSION_COOKIE } from "@/lib/auth/session";

const { set } = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set }) }));
vi.mock("@/services/auth/auth.service", () => ({ getSessionUser: vi.fn() }));

describe("session cookie protections", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each(["production", "development"] as const)("preserves protected attributes in %s on creation and removal", async (environment) => {
    vi.stubEnv("NODE_ENV", environment);
    const expires = new Date(Date.now() + 60_000);
    const attributes = { httpOnly: true, sameSite: "lax", secure: environment === "production", path: "/" };
    await setSessionCookie("test-session-value", expires);
    expect(set).toHaveBeenLastCalledWith(SESSION_COOKIE, "test-session-value", { ...attributes, expires });
    await clearSessionCookie();
    expect(set).toHaveBeenLastCalledWith(SESSION_COOKIE, "", { ...attributes, expires: new Date(0) });
  });
});
