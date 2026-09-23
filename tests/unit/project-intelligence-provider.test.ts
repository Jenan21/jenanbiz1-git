import { describe, expect, it, vi } from "vitest";
import { RetryingHttpProjectIntelligenceProvider } from "@/services/projects/project-intelligence-provider";

describe("project intelligence provider", () => {
  it("retries a transient upstream failure before returning JSON", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ value: "verified" }) });
    const provider = new RetryingHttpProjectIntelligenceProvider(fetcher as typeof fetch, { attempts: 2, cacheTtlMs: 1_000 });
    await expect(provider.getJson<{ value: string }>("https://provider.example/indicator")).resolves.toEqual({ value: "verified" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("uses a short-lived cache for repeated identical queries", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ value: "cached" }) });
    const provider = new RetryingHttpProjectIntelligenceProvider(fetcher as typeof fetch, { cacheTtlMs: 1_000 });
    await provider.getJson("https://provider.example/cache");
    await provider.getJson("https://provider.example/cache");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});