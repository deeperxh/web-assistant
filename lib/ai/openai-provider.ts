import type { AIProvider, ChatParams, ChatChunk, ProviderConfig, AIModel } from "./types";
import { parseSSEStream } from "./stream-parser";

/**
 * OpenAI-compatible provider.
 * Also works with OpenRouter, custom endpoints, and any OpenAI-compatible API.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly format = "openai" as const;
  readonly models: AIModel[];
  private defaultBaseUrl: string;
  private extraHeaders: Record<string, string>;

  constructor(options: {
    id: string;
    name: string;
    models: AIModel[];
    defaultBaseUrl: string;
    extraHeaders?: Record<string, string>;
  }) {
    this.id = options.id;
    this.name = options.name;
    this.models = options.models;
    this.defaultBaseUrl = options.defaultBaseUrl;
    this.extraHeaders = options.extraHeaders || {};
  }

  async *chat(params: ChatParams, config: ProviderConfig): AsyncGenerator<ChatChunk> {
    const baseUrl = config.baseUrl || this.defaultBaseUrl;
    const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

    const timeout = AbortSignal.timeout(30000);
    const signal = params.signal
      ? AbortSignal.any([params.signal, timeout])
      : timeout;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(config.apiKey || "").replace(/[^\x20-\x7E]/g, "")}`,
          ...this.extraHeaders,
        },
        body: JSON.stringify({
          model: params.model,
          messages: params.messages,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens,
          stream: true,
          ...(params.tools && params.tools.length > 0
            ? {
                tools: params.tools.map((t) => ({
                  type: "function",
                  function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.input_schema,
                  },
                })),
              }
            : {}),
        }),
        signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("abort") || msg.includes("Abort")) {
        throw err;
      }
      yield { type: "error", error: `Network error: ${msg} (URL: ${url})` };
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let errorMsg: string;
      if (text.startsWith("<") || text.startsWith("<!")) {
        errorMsg = `HTTP ${response.status} — check your API Base URL (current: ${url})`;
      } else if (response.status === 401) {
        errorMsg = `HTTP 401 Unauthorized — check your API Key`;
      } else if (response.status === 404) {
        errorMsg = `HTTP 404 Not Found — check your API Base URL (current: ${url})`;
      } else {
        let detail = text.slice(0, 200) || response.statusText;
        try {
          const json = JSON.parse(text);
          detail = json.error?.message || json.message || detail;
        } catch { /* use raw text */ }
        errorMsg = `API ${response.status}: ${detail}`;
      }
      yield { type: "error", error: errorMsg };
      return;
    }

    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();

    // State for tracking tool calls
    const toolCalls = new Map<number, { id: string; name: string; args: string }>();
    let finishReason = "";

    for await (const parsed of parseSSEStream(reader)) {
      const obj = parsed as {
        choices?: {
          delta?: {
            content?: string;
            tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
          };
          finish_reason?: string;
        }[];
      };

      const delta = obj.choices?.[0]?.delta;
      const fr = obj.choices?.[0]?.finish_reason;
      if (fr) finishReason = fr;

      if (delta?.content) {
        yield { type: "text", content: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (!toolCalls.has(tc.index)) {
            toolCalls.set(tc.index, { id: tc.id || "", name: tc.function?.name || "", args: "" });
          }
          const entry = toolCalls.get(tc.index)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }
    }

    // Emit accumulated tool calls
    for (const [, tc] of toolCalls) {
      let input: Record<string, unknown> = {};
      try { input = tc.args ? JSON.parse(tc.args) : {}; } catch { /* empty */ }
      yield { type: "tool_call", toolCallId: tc.id, toolName: tc.name, toolInput: input };
    }

    const stopReason = finishReason === "tool_calls" ? "tool_use" : finishReason;
    yield { type: "done", content: stopReason };
  }
}

export const openaiProvider = new OpenAICompatibleProvider({
  id: "openai",
  name: "OpenAI",
  defaultBaseUrl: "https://api.openai.com",
  models: [
    { id: "gpt-4o", name: "GPT-4o", maxTokens: 128000 },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", maxTokens: 128000 },
    { id: "gpt-4.1", name: "GPT-4.1", maxTokens: 1047576 },
    { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", maxTokens: 1047576 },
  ],
});

export const openrouterProvider = new OpenAICompatibleProvider({
  id: "openrouter",
  name: "OpenRouter",
  defaultBaseUrl: "https://openrouter.ai/api",
  models: [
    { id: "openai/gpt-4o", name: "GPT-4o", maxTokens: 128000 },
    { id: "anthropic/claude-sonnet-4-20250514", name: "Claude Sonnet 4", maxTokens: 200000 },
    { id: "google/gemini-2.5-pro-preview", name: "Gemini 2.5 Pro", maxTokens: 1048576 },
    { id: "deepseek/deepseek-chat-v3", name: "DeepSeek V3", maxTokens: 131072 },
  ],
});

export const ollamaProvider = new OpenAICompatibleProvider({
  id: "ollama",
  name: "Ollama (Local)",
  defaultBaseUrl: "http://localhost:11434",
  models: [
    { id: "llama3.1", name: "Llama 3.1", maxTokens: 131072 },
    { id: "qwen2.5", name: "Qwen 2.5", maxTokens: 32768 },
    { id: "deepseek-r1", name: "DeepSeek R1", maxTokens: 131072 },
  ],
});

export const customProvider = new OpenAICompatibleProvider({
  id: "custom",
  name: "自定义 (OpenAI 格式)",
  defaultBaseUrl: "http://localhost:8000",
  models: [
    { id: "default", name: "Default", maxTokens: 32768 },
  ],
});
