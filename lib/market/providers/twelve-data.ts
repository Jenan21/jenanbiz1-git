import type { MarketInstrument, MarketProvider } from "@/lib/market/contracts";

const defaultSymbols = ["XAU/USD", "WTI/USD", "BTC/USD", "DXY"] as const;

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

  async fetchSnapshot(): Promise<MarketInstrument[]> {
    const apiKey = process.env.TWELVE_DATA_API_KEY?.trim();
    if (!apiKey) throw new Error("MARKET_PROVIDER_NOT_CONFIGURED");

    const symbols = (process.env.JENAN_MARKET_SYMBOLS?.split(",") ?? defaultSymbols)
      .map((symbol) => symbol.trim())
      .filter(Boolean)
      .slice(0, 4);
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

    const instruments = symbols.flatMap((symbol) => {
      const quote = batchItem<TwelveDataQuote>(quotePayload, symbol);
      const timeSeries = batchItem<TwelveDataSeries>(seriesPayload, symbol);
      const price = finiteNumber(quote?.close);
      const percentChange = finiteNumber(quote?.percent_change);
      const series = (timeSeries?.values ?? [])
        .map((point) => finiteNumber(point.close))
        .filter((value): value is number => value !== null)
        .reverse();
      if (price === null || quote?.status === "error" || timeSeries?.status === "error") return [];
      return [{ symbol, price, percentChange, series, datetime: quote?.datetime ?? null }];
    });

    if (!instruments.length) throw new Error("MARKET_PROVIDER_EMPTY_RESPONSE");
    return instruments;
  }
}
