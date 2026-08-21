import type { MarketProvider, MarketRequestContext, MarketSnapshot } from "@/lib/market/contracts";
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

const defaultContext: MarketRequestContext = {
  countryCode: null,
  countrySource: "unavailable",
};

function cacheKey(provider: MarketProvider, context: MarketRequestContext) {
  return `${provider.id}:${context.countryCode ?? "global"}`;
}

function disconnectedSnapshot(context: MarketRequestContext): MarketSnapshot {
  return { state: "disconnected", provider: null, updatedAt: null, staleAt: null, instruments: [], audience: context };
}

async function refresh(provider: MarketProvider, now: number, context: MarketRequestContext, key: string): Promise<MarketSnapshot> {
  try {
    const instruments = await provider.fetchSnapshot(context);
    const updatedAt = new Date(now).toISOString();
    const snapshot: MarketSnapshot = {
      state: "live",
      provider: provider.id,
      updatedAt,
      staleAt: null,
      instruments,
      audience: context,
    };
    cache.set(key, { fetchedAt: now, snapshot });
    return snapshot;
  } catch {
    const cached = cache.get(key);
    if (cached && now - cached.fetchedAt <= staleForMs) {
      return {
        ...cached.snapshot,
        state: "stale",
        staleAt: new Date(now).toISOString(),
      };
    }
    return { state: "error", provider: provider.id, updatedAt: null, staleAt: null, instruments: [], audience: context };
  }
}

export async function getMarketSnapshot(
  provider: MarketProvider | null = getRegisteredMarketProvider(),
  now = Date.now(),
  context: MarketRequestContext = defaultContext,
): Promise<MarketSnapshot> {
  if (!provider || !provider.isConfigured()) return disconnectedSnapshot(context);
  const key = cacheKey(provider, context);
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt <= freshForMs) return cached.snapshot;

  const existing = pending.get(key);
  if (existing) return existing;
  const request = refresh(provider, now, context, key).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
