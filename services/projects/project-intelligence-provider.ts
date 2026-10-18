export type IntelligenceRequestOptions = { signal?: AbortSignal; deadlineAt?: number; timeoutMs?: number };

export interface ProjectIntelligenceProvider {
  getJson<T>(url: string, options?: IntelligenceRequestOptions): Promise<T>;
}

export class IntelligenceSourceUnavailableError extends Error {
  readonly code = "SOURCE_UNAVAILABLE";
  constructor(readonly status?: number) {
    super("Project intelligence source is unavailable");
  }
}

type CachedResponse = { expiresAt: number; value: unknown };
type Fetcher = typeof fetch;

export class RetryingHttpProjectIntelligenceProvider implements ProjectIntelligenceProvider {
  private readonly cache = new Map<string, CachedResponse>();
  private readonly throttledUntil = new Map<string, number>();

  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly options: { cacheTtlMs?: number; attempts?: number; timeoutMs?: number } = {},
  ) {}

  async getJson<T>(url: string, options: IntelligenceRequestOptions = {}): Promise<T> {
    options.signal?.throwIfAborted();
    const now = Date.now();
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > now) return cached.value as T;

    const origin = new URL(url).origin;
    const deadlineAt = options.deadlineAt ?? now + 25_000;
    const attempts = this.options.attempts ?? 2;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      options.signal?.throwIfAborted();
      const waitMs = Math.max(0, (this.throttledUntil.get(origin) ?? 0) - Date.now());
      if (waitMs > 0 && Date.now() + waitMs >= deadlineAt) throw new IntelligenceSourceUnavailableError(429);
      if (waitMs) await this.wait(waitMs, options.signal);
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) throw new IntelligenceSourceUnavailableError();
      const timeoutSignal = AbortSignal.timeout(Math.max(1, Math.min(remainingMs, options.timeoutMs ?? this.options.timeoutMs ?? 10_000)));
      const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
      let retryDelay = attempt * 200;
      try {
        const response = await this.fetcher(url, {
          signal,
          headers: { accept: "application/json", "user-agent": "JenanPRO-project-intelligence/1.0" },
          cache: "no-store",
        });
        if (!response.ok) {
          const retryAfter = response.headers?.get("retry-after");
          if (retryAfter) {
            const seconds = Number(retryAfter);
            const until = Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000 : Date.parse(retryAfter);
            if (Number.isFinite(until)) retryDelay = Math.max(retryDelay, until - Date.now());
          }
          if (response.status === 429 || response.status === 503) {
            this.throttledUntil.set(origin, Date.now() + retryDelay);
          }
          throw new IntelligenceSourceUnavailableError(response.status);
        }
        const value = await response.json() as T;
        signal.throwIfAborted();
        if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(url, { value, expiresAt: Date.now() + (this.options.cacheTtlMs ?? 300_000) });
        return value;
      } catch (error) {
        options.signal?.throwIfAborted();
        const permanent = error instanceof IntelligenceSourceUnavailableError && error.status !== undefined
          && error.status !== 408 && error.status !== 429 && error.status < 500;
        if (permanent || attempt === attempts || Date.now() + retryDelay >= deadlineAt) {
          throw error instanceof IntelligenceSourceUnavailableError ? error : new IntelligenceSourceUnavailableError();
        }
        await this.wait(retryDelay, options.signal);
      }
    }
    throw new IntelligenceSourceUnavailableError();
  }

  private async wait(milliseconds: number, signal?: AbortSignal) {
    const { setTimeout } = await import("node:timers/promises");
    await setTimeout(milliseconds, undefined, { signal });
  }
}

const globalForProjectIntelligence = globalThis as typeof globalThis & { projectIntelligenceProvider?: ProjectIntelligenceProvider };

export function getProjectIntelligenceProvider() {
  if (!globalForProjectIntelligence.projectIntelligenceProvider) {
    globalForProjectIntelligence.projectIntelligenceProvider = new RetryingHttpProjectIntelligenceProvider();
  }
  return globalForProjectIntelligence.projectIntelligenceProvider;
}

export function setProjectIntelligenceProvider(provider: ProjectIntelligenceProvider) {
  globalForProjectIntelligence.projectIntelligenceProvider = provider;
}