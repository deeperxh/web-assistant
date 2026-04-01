export interface AIModel {
  id: string;
  name: string;
  maxTokens: number;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  context?: SelectionContext;
  timestamp: number;
  toolCalls?: { name: string; input: Record<string, unknown> }[];
}

export interface SelectionContext {
  text: string;
  url: string;
  title: string;
}

export interface PageContext {
  url: string;
  title: string;
  content: string;
}

// --- Tool Use Types ---

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface ChatParams {
  model: string;
  messages: { role: string; content: string | ContentBlock[] }[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  tools?: ToolDefinition[];
}

export interface ChatChunk {
  type: "text" | "error" | "done" | "tool_call" | "tool_status";
  content?: string;
  error?: string;
  toolCallId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolState?: "running" | "completed" | "failed";
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly format: "anthropic" | "openai";
  readonly models: AIModel[];
  chat(params: ChatParams, config: ProviderConfig): AsyncGenerator<ChatChunk>;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  provider: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  url?: string;
  pageTitle?: string;
}

export interface AISettings {
  providers: Record<string, ProviderConfig>;
  activeProvider: string;
  activeModel: string;
  temperature: number;
  translationTargetLang: string;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  providers: {},
  activeProvider: "openai",
  activeModel: "gpt-4o",
  temperature: 0.7,
  translationTargetLang: "zh-CN",
};
