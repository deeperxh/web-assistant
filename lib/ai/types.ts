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
}

export interface SelectionContext {
  text: string;
  url: string;
  title: string;
}

export interface ChatParams {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatChunk {
  type: "text" | "error" | "done";
  content?: string;
  error?: string;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
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
