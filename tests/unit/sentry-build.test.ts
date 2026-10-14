import { afterEach, describe, expect, it, vi } from "vitest";
import { withSentryConfig } from "@sentry/nextjs/config";

vi.mock("@sentry/nextjs/config", () => ({ withSentryConfig: vi.fn((config) => config) }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("Sentry build safety", () => {
  it.each([
    ["", "", false],
    ["", "actual-project", false],
    ["test-only-placeholder", "", false],
    ["test-only-placeholder", "actual-project", true],
  ])("gates uploads with token=%s and project=%s", async (token, project, enabled) => {
    vi.stubEnv("SENTRY_AUTH_TOKEN", token);
    vi.stubEnv("SENTRY_PROJECT", project);
    vi.stubEnv("SENTRY_RELEASE", "test-commit-sha");
    await import("@/next.config");
    expect(withSentryConfig).toHaveBeenCalledWith(
      expect.not.objectContaining({ productionBrowserSourceMaps: true }),
      expect.objectContaining({
        org: "jenanpro",
        telemetry: false,
        sourcemaps: { disable: !enabled, deleteSourcemapsAfterUpload: true },
        release: { name: "test-commit-sha", create: enabled, finalize: enabled },
      }),
    );
  });
});
