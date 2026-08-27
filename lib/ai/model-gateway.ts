export type ModelProvider = "openai" | "anthropic" | "meta" | "fallback";

export type ModelRequest = {
  taskType: "design" | "analysis" | "coding" | "general";
  prompt: string;
  preferredProvider?: ModelProvider;
};

export type ModelResponse = {
  provider: ModelProvider;
  model: string;
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

export interface AIModel {
  provider: ModelProvider;
  model: string;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type FetchFunction = (input: string, init: RequestInit) => Promise<FetchResponse>;

class OpenAIResponsesModel implements AIModel {
  provider = "openai" as const;

  constructor(
    public model: string,
    private readonly apiKey: string,
    private readonly fetcher: FetchFunction = fetch,
  ) {}

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const started = Date.now();
    const response = await this.fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, input: request.prompt }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`);
    const data = await response.json() as { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } };
    return {
      provider: this.provider,
      model: this.model,
      text: data.output_text ?? "",
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      latencyMs: Date.now() - started,
    };
  }
}

class AnthropicMessagesModel implements AIModel {
  provider = "anthropic" as const;

  constructor(
    public model: string,
    private readonly apiKey: string,
    private readonly fetcher: FetchFunction = fetch,
  ) {}

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const started = Date.now();
    const response = await this.fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, max_tokens: 1_024, messages: [{ role: "user", content: request.prompt }] }),
    });
    if (!response.ok) throw new Error(`Anthropic request failed with status ${response.status}`);
    const data = await response.json() as { content?: Array<{ type?: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    return {
      provider: this.provider,
      model: this.model,
      text: data.content?.find((block) => block.type === "text")?.text ?? "",
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      latencyMs: Date.now() - started,
    };
  }
}

class OpenAICompatibleModel implements AIModel {
  provider = "meta" as const;

  constructor(
    public model: string,
    private readonly endpoint: string,
    private readonly apiKey?: string,
    private readonly fetcher: FetchFunction = fetch,
  ) {}

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const started = Date.now();
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: this.model, messages: [{ role: "user", content: request.prompt }] }),
    });
    if (!response.ok) throw new Error(`Llama-compatible request failed with status ${response.status}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return {
      provider: this.provider,
      model: this.model,
      text: data.choices?.[0]?.message?.content ?? "",
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - started,
    };
  }
}

class FallbackModel implements AIModel {
  provider = "fallback" as const;
  model = "jenan-safe-fallback";

  async complete(request: ModelRequest): Promise<ModelResponse> {
    const started = Date.now();
    return {
      provider: this.provider,
      model: this.model,
      text: `Fallback response for ${request.taskType}: ${request.prompt.slice(0, 240)}`,
      inputTokens: request.prompt.length,
      outputTokens: 0,
      latencyMs: Date.now() - started,
    };
  }
}

export class ModelGateway {
  private readonly models = new Map<ModelProvider, AIModel>();
  private readonly fallback = new FallbackModel();

  register(model: AIModel) {
    this.models.set(model.provider, model);
    return this;
  }

  select(request: ModelRequest) {
    return (request.preferredProvider && this.models.get(request.preferredProvider)) || this.models.get(this.providerFor(request.taskType)) || this.fallback;
  }

  async complete(request: ModelRequest) {
    return this.select(request).complete(request);
  }

  private providerFor(taskType: ModelRequest["taskType"]): ModelProvider {
    if (taskType === "design" || taskType === "general") return "openai";
    if (taskType === "analysis") return "anthropic";
    return "meta";
  }
}

export function createConfiguredModelGateway(environment = process.env) {
  const gateway = new ModelGateway();
  if (environment.OPENAI_API_KEY) {
    gateway.register(new OpenAIResponsesModel(environment.OPENAI_MODEL ?? "gpt-4.1-mini", environment.OPENAI_API_KEY));
  }
  if (environment.ANTHROPIC_API_KEY) {
    gateway.register(new AnthropicMessagesModel(environment.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest", environment.ANTHROPIC_API_KEY));
  }
  if (environment.LLAMA_API_URL) {
    gateway.register(new OpenAICompatibleModel(environment.LLAMA_MODEL ?? "llama", environment.LLAMA_API_URL, environment.LLAMA_API_KEY));
  }
  return gateway;
}
