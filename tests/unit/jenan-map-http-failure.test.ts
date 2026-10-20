import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/authorization", () => ({ hasPlatformAdminAccess: vi.fn() }));
vi.mock("@/lib/auth/request", () => ({ hasValidOrigin: vi.fn() }));
vi.mock("@/lib/rate-limit/route-rate-limit", () => ({ enforceRouteRateLimit: vi.fn() }));

import { MapError } from "@/services/jenan-map/contracts";
import { failure } from "@/services/jenan-map/http";

describe("a map route that fails", () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => log.mockRestore());

  it("answers a coded outcome with exactly its code and status, and does not treat it as a fault", async () => {
    const response = failure(new MapError("PRIVATE_STORAGE_REQUIRED", 503));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "PRIVATE_STORAGE_REQUIRED" });
    expect(failure(new MapError("INVALID_RELEASE_ID", 400)).status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });

  it("logs an unexpected error for the operator and tells the client nothing about it", async () => {
    const cause = new Error("connect ECONNREFUSED 10.0.0.7:5432");
    const response = failure(cause);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "MAP_UNAVAILABLE" });
    expect(log).toHaveBeenCalledExactlyOnceWith("jenan-map request failed", cause);
  });
});
