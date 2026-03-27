import type { AIProvider, ChatParams, ChatChunk, ProviderConfig, AIModel } from "./types";
import { parseSSEStream } from "./stream-parser";

export class AnthropicCompatibleProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly models: AIModel[];
  private defaultBaseUrl: string;

  constructor(options: {
    id: string;
    name: string;
    models: AIModel[];
    defaultBaseUrl: string;
  }) {
    this.id = options.id;
    this.name = options.name;
    this.models = options.models;
    this.defaultBaseUrl = options.defaultBaseUrl;
  }

  async *chat(params: ChatParams, config: ProviderConfig): AsyncGenerator<ChatChunk> {
    let baseUrl = (config.baseUrl || this.defaultBaseUrl).replace(/\/+$/, "");

    // Separate system message from conversation
    const systemMsg = params.messages.find((m) => m.role === "system");
    const messages = params.messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: params.model,
      messages,
      max_tokens: params.maxTokens || 4096,
      temperature: params.temperature ?? 0.7,
      stream: true,
    };
    if (systemMsg) {
      body.system = systemMsg.content;
    }

    // Build URL — smart path detection
    let url: string;
    if (baseUrl.endsWith("/v1/messages")) {
      url = baseUrl;
    } else if (baseUrl.endsWith("/v1")) {
      url = `${baseUrl}/messages`;
    } else {
      url = `${baseUrl}/v1/messages`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey || "",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let errorMsg: string;
      if (text.startsWith("<") || text.startsWith("<!")) {
        // Got HTML back — almost certainly a wrong URL
        errorMsg = `HTTP ${response.status} — check your API Base URL (current: ${url})`;
      } else if (response.status === 401) {
        errorMsg = `HTTP 401 Unauthorized — check your API Key`;
      } else if (response.status === 404) {
        errorMsg = `HTTP 404 Not Found — check your API Base URL (current: ${url})`;
      } else {
        // Try to extract JSON error message
        let detail = text.slice(0, 200);
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

    for await (const parsed of parseSSEStream(reader)) {
      const event = parsed as {
        type: string;
        index?: number;
        delta?: { type?: string; text?: string; thinking?: string };
        content_block?: { type?: string };
      };

      if (event.type === "content_block_delta") {
        // Handle text delta (normal response)
        if (event.delta?.type === "text_delta" && event.delta.text) {
          yield { type: "text", content: event.delta.text };
        }
        // Also handle bare .text (some providers)
        else if (event.delta?.text && !event.delta?.type) {
          yield { type: "text", content: event.delta.text };
        }
        // Skip thinking_delta, signature_delta silently
      }
    }

    yield { type: "done" };
  }
}

export const anthropicProvider = new AnthropicCompatibleProvider({
  id: "anthropic",
  name: "Anthropic (Claude)",
  defaultBaseUrl: "https://api.anthropic.com",
  models: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", maxTokens: 200000 },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", maxTokens: 200000 },
    { id: "claude-opus-4-20250514", name: "Claude Opus 4", maxTokens: 200000 },
  ],
});

export const minimaxAnthropicProvider = new AnthropicCompatibleProvider({
  id: "minimax-anthropic",
  name: "MiniMax (Anthropic)",
  defaultBaseUrl: "https://api.minimaxi.com/anthropic",
  models: [
    { id: "MiniMax-M2.7", name: "MiniMax M2.7", maxTokens: 131072 },
    { id: "MiniMax-Text-01", name: "MiniMax Text 01", maxTokens: 131072 },
  ],
});
