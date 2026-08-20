export type MarketDataState = "live" | "stale" | "disconnected" | "error";

export interface MarketInstrument {
  symbol: string;
  price: number;
  percentChange: number | null;
  series: number[];
  datetime: string | null;
}

export interface MarketSnapshot {
  state: MarketDataState;
  provider: string | null;
  updatedAt: string | null;
  staleAt: string | null;
  instruments: MarketInstrument[];
}

export interface MarketProvider {
  readonly id: string;
  isConfigured(): boolean;
  fetchSnapshot(): Promise<MarketInstrument[]>;
}
