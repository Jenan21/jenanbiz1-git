import type { MarketCategory, MarketInstrument, MarketProvider, MarketRequestContext } from "@/lib/market/contracts";

const localMarketSymbols: Record<string, string> = {
  SA: "TASI",
  AE: "DFMGI",
  US: "SPX",
  GB: "FTSE",
  DE: "DAX",
  FR: "CAC",
  JP: "N225",
  CN: "SSE",
  IN: "NIFTY",
  EG: "EGX30",
};

interface TwelveDataQuote {
  close?: string;
  percent_change?: string;
  datetime?: string;
  status?: string;
}

interface TwelveDataSeries {
  values?: Array<{ close?: string }>;
  status?: string;
}

function finiteNumber(value: unknown) {
  const number = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : null;
}

function batchItem<T>(payload: unknown, symbol: string): T | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const candidate = record[symbol] ?? payload;
  return candidate && typeof candidate === "object" ? (candidate as T) : null;
}

export class TwelveDataProvider implements MarketProvider {
  readonly id = "twelve-data";

  isConfigured() {
    return Boolean(process.env.TWELVE_DATA_API_KEY?.trim());
  }

  async fetchSnapshot(context?: MarketRequestContext): Promise<MarketInstrument[]> {
    const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
    if (!apiKey) throw new Error("MARKET_PROVIDER_NOT_CONFIGURED");

    const countryCode = context?.countryCode ?? "US";
    const configuredLocalSymbol = process.env[`JENAN_LOCAL_MARKET_SYMBOL_${countryCode}`]?.trim();
    const localSymbol = configuredLocalSymbol
      || localMarketSymbols[countryCode]
      || process.env.JENAN_DEFAULT_LOCAL_MARKET_SYMBOL?.trim()
      || "SPX";
    const defaultSymbols: Array<{ symbol: string; category: MarketCategory }> = [
      { symbol: "XAU/USD", category: "metals" },
      { symbol: localSymbol, category: "local-equities" },
      { symbol: "BTC/USD", category: "crypto" },
      { symbol: "DXY", category: "macro" },
    ];
    const configuredSymbols = process.env.JENAN_MARKET_SYMBOLS?.split(",")
      .map((symbol) => symbol.trim())
      .filter(Boolean)
      .slice(0, 4);
    const symbolPlan = configuredSymbols?.length
      ? configuredSymbols.map((symbol, index) => ({
          symbol,
          category: defaultSymbols[index]?.category ?? ("macro" as MarketCategory),
        }))
      : defaultSymbols;
    const symbols = symbolPlan.map(({ symbol }) => symbol);
    const symbolList = symbols.join(",");
    const headers = { Authorization: `apikey ${apiKey}` };
    const [quoteResponse, seriesResponse] = await Promise.all([
      fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbolList)}`, {
        headers,
        cache: "no-store",
      }),
      fetch(
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbolList)}&interval=5min&outputsize=12&timezone=UTC`,
        { headers, cache: "no-store" },
      ),
    ]);

    if (!quoteResponse.ok || !seriesResponse.ok) throw new Error("MARKET_PROVIDER_UNAVAILABLE");
    const [quotePayload, seriesPayload]: [unknown, unknown] = await Promise.all([
      quoteResponse.json(),
      seriesResponse.json(),
    ]);

    const instruments = symbolPlan.flatMap(({ symbol, category }) => {
      const quote = batchItem<TwelveDataQuote>(quotePayload, symbol);
      const timeSeries = batchItem<TwelveDataSeries>(seriesPayload, symbol);
      const price = finiteNumber(quote?.close);
      const percentChange = finiteNumber(quote?.percent_change);
      const series = (timeSeries?.values ?? [])
        .map((point) => finiteNumber(point.close))
        .filter((value): value is number => value !== null)
        .reverse();
      if (price === null || quote?.status === "error" || timeSeries?.status === "error") return [];
      return [{ symbol, price, percentChange, series, datetime: quote?.datetime ?? null, category }];
    });

    if (!instruments.length) throw new Error("MARKET_PROVIDER_EMPTY_RESPONSE");
    return instruments;
  }
}
