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

  it("does not retry permanent HTTP failures or expose upstream details", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const provider = new RetryingHttpProjectIntelligenceProvider(fetcher as typeof fetch);
    await expect(provider.getJson("https://provider.example/missing")).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE", status: 404 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("honors Retry-After without exceeding the shared deadline or hammering the origin", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers({ "retry-after": "60" }) });
    const provider = new RetryingHttpProjectIntelligenceProvider(fetcher as typeof fetch);
    await expect(provider.getJson("https://provider.example/throttled", { deadlineAt: Date.now() + 100 })).rejects.toMatchObject({ status: 429 });
    await expect(provider.getJson("https://provider.example/other", { deadlineAt: Date.now() + 100 })).rejects.toMatchObject({ status: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("supports HTTP-date Retry-After and a pre-expired deadline", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 503, headers: new Headers({ "retry-after": new Date(Date.now() + 60_000).toUTCString() }) });
    const provider = new RetryingHttpProjectIntelligenceProvider(fetcher as typeof fetch);
    await expect(provider.getJson("https://provider.example/busy", { deadlineAt: Date.now() + 100 })).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(provider.getJson("https://another.example/expired", { deadlineAt: Date.now() - 1 })).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("aborts a slow source within the request budget", async () => {
    const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }));
    const provider = new RetryingHttpProjectIntelligenceProvider(fetcher as typeof fetch, { attempts: 1, timeoutMs: 15 });
    await expect(provider.getJson("https://provider.example/slow")).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("propagates cancellation instead of treating a lost lease as missing data", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    const provider = new RetryingHttpProjectIntelligenceProvider(fetcher);
    await expect(provider.getJson("https://provider.example/cancelled", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});