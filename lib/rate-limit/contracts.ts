export interface RateLimitConsumeInput {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

export interface RateLimitProvider {
  consume(input: RateLimitConsumeInput): Promise<RateLimitDecision>;
}

/** Distributed adapters must implement atomic increment and expiry semantics. */
export type DistributedRateLimitProvider = RateLimitProvider;
