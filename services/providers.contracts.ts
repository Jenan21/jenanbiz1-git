export interface MarketTicker {
  symbol: string;
  price: number;
  changePercent: number;
  source: string;
  timestampIso: string;
}

export interface MarketDataProvider {
  readonly name: string;
  fetchTickers(symbols: readonly string[]): Promise<MarketTicker[]>;
}

export interface DocumentStorageProvider {
  readonly name: string;
  upload(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  download(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
