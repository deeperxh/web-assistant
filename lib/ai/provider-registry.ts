import type { AIProvider } from "./types";
import { openaiProvider, openrouterProvider, ollamaProvider, customProvider } from "./openai-provider";
import { anthropicProvider, minimaxAnthropicProvider } from "./anthropic-provider";

class ProviderRegistry {
  private providers = new Map<string, AIProvider>();

  constructor() {
    this.register(openaiProvider);
    this.register(anthropicProvider);
    this.register(minimaxAnthropicProvider);
    this.register(openrouterProvider);
    this.register(ollamaProvider);
    this.register(customProvider);
  }

  register(provider: AIProvider) {
    this.providers.set(provider.id, provider);
  }

  get(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  getAll(): AIProvider[] {
    return Array.from(this.providers.values());
  }
}

export const providerRegistry = new ProviderRegistry();
