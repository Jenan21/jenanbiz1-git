import type { MarketProvider } from "@/lib/market/contracts";

const globalForMarketProviders = globalThis as typeof globalThis & {
  jenanMarketProvider?: MarketProvider | null;
};

/**
 * Runtime hook for the future Admin Command Center provider registry.
 * Login never owns provider credentials or selects a vendor directly.
 */
export function getRegisteredMarketProvider(): MarketProvider | null {
  return globalForMarketProviders.jenanMarketProvider ?? null;
}

export function setRegisteredMarketProvider(provider: MarketProvider | null) {
  globalForMarketProviders.jenanMarketProvider = provider;
}
