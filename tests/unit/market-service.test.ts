import { describe, expect, it, vi } from "vitest";
import type { MarketInstrument, MarketProvider } from "@/lib/market/contracts";
import { setRegisteredMarketProvider } from "@/lib/market/provider-registry";
import { getMarketSnapshot } from "@/lib/market/service";

const instruments: MarketInstrument[] = [
  { symbol: "BTC/USD", price: 100, percentChange: 1.2, series: [97, 99, 100], datetime: "2026-08-13" },
];

function provider(id: string, configured = true): MarketProvider & { fetchSnapshot: ReturnType<typeof vi.fn> } {
  return {
    id,
    isConfigured: () => configured,
    fetchSnapshot: vi.fn(async () => instruments),
  };
}

describe("market server cache and truthful state", () => {
  it("defaults to disconnected when the central registry has no provider", async () => {
    setRegisteredMarketProvider(null);
    await expect(getMarketSnapshot()).resolves.toEqual({
      state: "disconnected",
      provider: null,
      updatedAt: null,
      staleAt: null,
      instruments: [],
      audience: { countryCode: null, countrySource: "unavailable" },
    });
  });

  it("reports disconnected without invoking an unconfigured provider", async () => {
    const source = provider("unconfigured", false);
    await expect(getMarketSnapshot(source, 1_000)).resolves.toMatchObject({ state: "disconnected", instruments: [] });
    expect(source.fetchSnapshot).not.toHaveBeenCalled();
  });

  it("serves a fresh snapshot from the server cache", async () => {
    const source = provider("fresh-cache");
    const first = await getMarketSnapshot(source, 10_000);
    const second = await getMarketSnapshot(source, 20_000);
    expect(first.state).toBe("live");
    expect(second).toEqual(first);
    expect(source.fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it("keeps server cache entries isolated by the visitor country", async () => {
    const source = provider("country-cache");
    const sa = { countryCode: "SA", countrySource: "vercel" as const };
    const us = { countryCode: "US", countrySource: "vercel" as const };
    await getMarketSnapshot(source, 10_000, sa);
    await getMarketSnapshot(source, 20_000, sa);
    await getMarketSnapshot(source, 20_000, us);
    expect(source.fetchSnapshot).toHaveBeenCalledTimes(2);
    expect(source.fetchSnapshot).toHaveBeenNthCalledWith(1, sa);
    expect(source.fetchSnapshot).toHaveBeenNthCalledWith(2, us);
  });

  it("returns the last trusted snapshot as stale when refresh fails", async () => {
    const source = provider("stale-cache");
    await getMarketSnapshot(source, 10_000);
    source.fetchSnapshot.mockRejectedValueOnce(new Error("offline"));
    await expect(getMarketSnapshot(source, 50_000)).resolves.toMatchObject({
      state: "stale",
      instruments,
      updatedAt: new Date(10_000).toISOString(),
      staleAt: new Date(50_000).toISOString(),
    });
  });

  it("reports error when no trusted snapshot exists", async () => {
    const source = provider("hard-error");
    source.fetchSnapshot.mockRejectedValueOnce(new Error("offline"));
    await expect(getMarketSnapshot(source, 10_000)).resolves.toMatchObject({ state: "error", instruments: [] });
  });
});
