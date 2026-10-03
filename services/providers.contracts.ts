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

export interface EmailProvider {
  readonly name: string;
  send(input: { subject: string; text: string; to: string; traceId: string }): Promise<{ messageId: string }>;
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: { amountMinor: number; currency: string; idempotencyKey: string; metadata?: Record<string, string> }): Promise<{ externalId: string; status: string }>;
  refund(input: { amountMinor?: number; externalId: string; idempotencyKey: string }): Promise<{ status: string }>;
  verifyWebhook(payload: Uint8Array, signature: string): Promise<unknown>;
}

export interface AIExecutionProvider {
  readonly name: string;
  execute(input: { model: string; payload: unknown; traceId: string }): Promise<{ inputTokens: number; latencyMs: number; output: unknown; outputTokens: number }>;
}

export interface ManagedRedisProvider {
  readonly name: string;
  delete(key: string): Promise<void>;
  get(key: string): Promise<string | null>;
  increment(key: string, ttlSeconds: number): Promise<number>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}

export interface SocialVerificationProvider {
  readonly name: string;
  verify(input: { accountUrl: string; platform: string; userId: string }): Promise<{ evidence?: unknown; verified: boolean }>;
}

export interface MonitoringProvider {
  readonly name: string;
  emitAlert(input: { severity: string; title: string; traceId?: string }): Promise<{ externalId?: string }>;
  emitMetric(input: { name: string; tags?: Record<string, string>; value: number }): Promise<void>;
}

export interface BackupStorageProvider {
  readonly name: string;
  delete(key: string): Promise<void>;
  download(key: string): Promise<Uint8Array>;
  upload(key: string, bytes: Uint8Array, checksum: string): Promise<void>;
}
