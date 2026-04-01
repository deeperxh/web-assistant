import type { AIProvider, ChatParams, ChatChunk, ProviderConfig, AIModel } from "./types";
import { parseSSEStream } from "./stream-parser";

export class AnthropicCompatibleProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly format = "anthropic" as const;
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
    if (params.tools && params.tools.length > 0) {
      body.tools = params.tools;
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

    // Combine user abort signal with a configurable timeout
    const timeout = AbortSignal.timeout(params.timeout || 30000);
    const signal = params.signal
      ? AbortSignal.any([params.signal, timeout])
      : timeout;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": (config.apiKey || "").replace(/[^\x20-\x7E]/g, ""),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("abort") || msg.includes("Abort")) {
        throw err; // let caller handle abort
      }
      yield { type: "error", error: `Network error: ${msg} (URL: ${url})` };
      return;
    }

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

    // State for tracking tool use blocks
    let currentToolId = "";
    let currentToolName = "";
    let toolInputJson = "";
    let stopReason = "";

    for await (const parsed of parseSSEStream(reader)) {
      const event = parsed as {
        type: string;
        index?: number;
        delta?: { type?: string; text?: string; thinking?: string; partial_json?: string; stop_reason?: string };
        content_block?: { type?: string; id?: string; name?: string };
      };

      if (event.type === "content_block_start") {
        if (event.content_block?.type === "tool_use") {
          currentToolId = event.content_block.id || "";
          currentToolName = event.content_block.name || "";
          toolInputJson = "";
        }
      }

      if (event.type === "content_block_delta") {
        if (event.delta?.type === "text_delta" && event.delta.text) {
          yield { type: "text", content: event.delta.text };
        }
        else if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
          toolInputJson += event.delta.partial_json;
        }
        // Also handle bare .text (some providers)
        else if (event.delta?.text && !event.delta?.type) {
          yield { type: "text", content: event.delta.text };
        }
        // Skip thinking_delta, signature_delta silently
      }

      if (event.type === "content_block_stop" && currentToolId) {
        let input: Record<string, unknown> = {};
        try { input = toolInputJson ? JSON.parse(toolInputJson) : {}; } catch { /* empty */ }
        yield { type: "tool_call", toolCallId: currentToolId, toolName: currentToolName, toolInput: input };
        currentToolId = "";
        currentToolName = "";
        toolInputJson = "";
      }

      if (event.type === "message_delta") {
        stopReason = event.delta?.stop_reason || stopReason;
      }
    }

    yield { type: "done", content: stopReason };
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
