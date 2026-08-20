import type { MarketProvider, MarketSnapshot } from "@/lib/market/contracts";
import { getRegisteredMarketProvider } from "@/lib/market/provider-registry";

const freshForMs = 30_000;
const staleForMs = 5 * 60_000;

interface CachedMarketSnapshot {
  fetchedAt: number;
  snapshot: MarketSnapshot;
}

const globalForMarket = globalThis as typeof globalThis & {
  jenanMarketCache?: Map<string, CachedMarketSnapshot>;
  jenanMarketPending?: Map<string, Promise<MarketSnapshot>>;
};

const cache = globalForMarket.jenanMarketCache ?? new Map<string, CachedMarketSnapshot>();
const pending = globalForMarket.jenanMarketPending ?? new Map<string, Promise<MarketSnapshot>>();
globalForMarket.jenanMarketCache = cache;
globalForMarket.jenanMarketPending = pending;

function disconnectedSnapshot(): MarketSnapshot {
  return { state: "disconnected", provider: null, updatedAt: null, staleAt: null, instruments: [] };
}

async function refresh(provider: MarketProvider, now: number): Promise<MarketSnapshot> {
  try {
    const instruments = await provider.fetchSnapshot();
    const updatedAt = new Date(now).toISOString();
    const snapshot: MarketSnapshot = {
      state: "live",
      provider: provider.id,
      updatedAt,
      staleAt: null,
      instruments,
    };
    cache.set(provider.id, { fetchedAt: now, snapshot });
    return snapshot;
  } catch {
    const cached = cache.get(provider.id);
    if (cached && now - cached.fetchedAt <= staleForMs) {
      return {
        ...cached.snapshot,
        state: "stale",
        staleAt: new Date(now).toISOString(),
      };
    }
    return { state: "error", provider: provider.id, updatedAt: null, staleAt: null, instruments: [] };
  }
}

export async function getMarketSnapshot(
  provider: MarketProvider | null = getRegisteredMarketProvider(),
  now = Date.now(),
): Promise<MarketSnapshot> {
  if (!provider || !provider.isConfigured()) return disconnectedSnapshot();
  const cached = cache.get(provider.id);
  if (cached && now - cached.fetchedAt <= freshForMs) return cached.snapshot;

  const existing = pending.get(provider.id);
  if (existing) return existing;
  const request = refresh(provider, now).finally(() => pending.delete(provider.id));
  pending.set(provider.id, request);
  return request;
}
