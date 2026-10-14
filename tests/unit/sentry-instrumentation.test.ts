import { afterEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { onRequestError, register } from "@/instrumentation";

vi.mock("@sentry/nextjs", () => ({
  init: vi.fn(),
  captureRequestError: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("Sentry runtime hooks", () => {
  it.each(["nodejs", "edge"])("initializes the %s runtime with the server DSN", async (runtime) => {
    vi.stubEnv("NEXT_RUNTIME", runtime);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SENTRY_DSN", "https://server@example.com/2");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://browser@example.com/1");
    await register();
    expect(Sentry.init).toHaveBeenCalledOnce();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: "https://server@example.com/2", enabled: true }));
  });

  it("falls back to the public DSN on the server", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://browser@example.com/1");
    await register();
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: "https://browser@example.com/1" }));
  });

  it("exports Next's request error hook", () => {
    expect(onRequestError).toBe(Sentry.captureRequestError);
  });

  it("initializes the browser with only its public DSN and exports the navigation hook", async () => {
    vi.stubEnv("SENTRY_DSN", "https://server@example.com/2");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://browser@example.com/1");
    const client = await import("@/instrumentation-client");
    expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: "https://browser@example.com/1" }));
    expect(client.onRouterTransitionStart).toBe(Sentry.captureRouterTransitionStart);
  });
});
