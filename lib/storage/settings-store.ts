import type { AISettings } from "../ai/types";
import { DEFAULT_AI_SETTINGS } from "../ai/types";

const SETTINGS_KEY = "wa_ai_settings";

export async function getAISettings(): Promise<AISettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_AI_SETTINGS, ...result[SETTINGS_KEY] };
}

export async function saveAISettings(settings: Partial<AISettings>): Promise<void> {
  const current = await getAISettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...current, ...settings },
  });
}

export async function getProviderConfig(providerId: string) {
  const settings = await getAISettings();
  return settings.providers[providerId] || {};
}
