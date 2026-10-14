import { afterEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { sanitizeSentryEvent, sentryOptions } from "@/lib/observability/sentry";

afterEach(() => vi.unstubAllEnvs());

describe("Sentry configuration", () => {
  it("only enables monitoring in production with a DSN", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(sentryOptions("https://public@example.com/1").enabled).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    expect(sentryOptions(undefined).enabled).toBe(false);
    expect(sentryOptions("").enabled).toBe(false);
    expect(sentryOptions("https://public@example.com/1").enabled).toBe(true);
  });

  it("disables PII and tracing and installs the privacy filter", () => {
    const options = sentryOptions(undefined);
    expect(options.sendDefaultPii).toBe(false);
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    });
    expect(options.tracesSampleRate).toBe(0);
    expect(options.beforeSend).toBe(sanitizeSentryEvent);
  });

  it("removes private request, user, console and custom payloads while preserving the stack", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: { url: "https://example.com/auth?code=private", headers: { authorization: "private" }, cookies: { session: "private" }, data: { password: "private" } },
      user: { email: "private@example.com", ip_address: "127.0.0.1" },
      breadcrumbs: [{ message: "private input" }],
      extra: { businessInput: "private" },
      contexts: { nextjs: { request_path: "/api/auth/oauth/google/callback?code=private&state=private", router_path: "/api/auth/oauth/[provider]/callback" } },
      exception: { values: [{ type: "Error", value: "Controlled test", stacktrace: { frames: [{ filename: "app.js", lineno: 1 }] } }] },
      release: "test-release",
    };
    const sanitized = sanitizeSentryEvent(event);
    expect(sanitized).not.toHaveProperty("request");
    expect(sanitized).not.toHaveProperty("user");
    expect(sanitized).not.toHaveProperty("breadcrumbs");
    expect(sanitized).not.toHaveProperty("extra");
    expect(sanitized.contexts?.nextjs).not.toHaveProperty("request_path");
    expect(sanitized.contexts?.nextjs?.router_path).toBe("/api/auth/oauth/[provider]/callback");
    expect(sanitized.exception?.values?.[0].stacktrace?.frames?.[0].filename).toBe("app.js");
    expect(sanitized.release).toBe("test-release");
    expect(() => sanitizeSentryEvent({ type: undefined })).not.toThrow();
  });
});
