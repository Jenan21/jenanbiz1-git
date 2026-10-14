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
  /** Set when the backing store could not be reached and `allowed` is a fail-closed default rather than a measurement. */
  degraded?: boolean;
}

export interface RateLimitProvider {
  consume(input: RateLimitConsumeInput): Promise<RateLimitDecision>;
  /** Reads the counter without consuming a slot; `allowed` tells whether another attempt would be let through. */
  peek?(input: RateLimitConsumeInput): Promise<RateLimitDecision>;
  isReady(): Promise<boolean>;
}

/** Distributed adapters must implement atomic increment and expiry semantics. */
export type DistributedRateLimitProvider = RateLimitProvider;
