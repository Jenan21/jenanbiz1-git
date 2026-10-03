export interface ProjectIntelligenceProvider {
  getJson<T>(url: string): Promise<T>;
}

type CachedResponse = { expiresAt: number; value: unknown };
type Fetcher = typeof fetch;

export class RetryingHttpProjectIntelligenceProvider implements ProjectIntelligenceProvider {
  private readonly cache = new Map<string, CachedResponse>();

  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly options: { cacheTtlMs?: number; attempts?: number; timeoutMs?: number } = {},
  ) {}

  async getJson<T>(url: string): Promise<T> {
    const now = Date.now();
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > now) return cached.value as T;

    const attempts = this.options.attempts ?? 2;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 5_000);
      try {
        const response = await this.fetcher(url, {
          signal: controller.signal,
          headers: { accept: "application/json", "user-agent": "JenanBIZ-project-intelligence/1.0" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`External provider returned ${response.status}`);
        const value = await response.json() as T;
        this.cache.set(url, { value, expiresAt: Date.now() + (this.options.cacheTtlMs ?? 300_000) });
        return value;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 150));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("External provider request failed");
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