import { providerRegistry } from "../../lib/ai/provider-registry";
import { getAISettings, getProviderConfig } from "../../lib/storage/settings-store";
import { googleTranslate, googleTranslateBatch } from "../../lib/translation/google-translate";

export function setupMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { type, data } = message;

    switch (type) {
      case "selection:send":
        // Relay selection context to the side panel via storage
        chrome.storage.session.set({ wa_pending_context: data.context });
        // Open side panel if not open
        if (sender.tab?.id) {
          chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
        }
        sendResponse({ success: true });
        break;

      case "translate:text":
        handleTranslateText(data).then(sendResponse);
        return true; // async response

      case "translate:page-batch":
        handleTranslatePageBatch(data).then(sendResponse);
        return true;

      case "ai-search:page":
        handleAISearchPage(data).then(sendResponse);
        return true;

      case "bookmark:add":
        handleAddBookmark(data).then(() => sendResponse({ success: true }));
        return true;

      case "note:clip":
        handleClipNote(data).then(() => sendResponse({ success: true }));
        return true;

      case "picker:element-selected":
        chrome.storage.session.set({ wa_pending_element: data.elementInfo });
        if (sender.tab?.id) {
          chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
        }
        sendResponse({ success: true });
        break;
    }
  });
}

const LANG_NAMES: Record<string, string> = {
  "zh-CN": "Simplified Chinese",
  "en": "English",
  "ja": "Japanese",
  "ko": "Korean",
  "fr": "French",
  "de": "German",
  "es": "Spanish",
};

async function handleTranslateText(data: { text: string; from: string; to: string }): Promise<{ translated: string }> {
  // Primary: Google Translate (fast, <500ms)
  try {
    const result = await googleTranslate(data.text, data.from, data.to);
    if (result) return { translated: result };
  } catch (err) {
    console.warn("[WA] Google Translate failed, falling back to AI:", err);
  }

  // Fallback: AI translation
  return handleAITranslate(data);
}

async function handleTranslatePageBatch(data: { texts: string[]; from: string; to: string }): Promise<{ translations: string[] }> {
  // Primary: Google Translate (fast)
  try {
    const translations = await googleTranslateBatch(data.texts, data.from, data.to);
    return { translations };
  } catch (err) {
    console.warn("[WA] Google Translate batch failed, falling back to AI:", err);
  }

  // Fallback: AI batch translation
  try {
    const translations = await handleAITranslateBatch(data);
    return { translations };
  } catch (err) {
    console.error("[WA] AI batch translate also failed:", err);
    try { chrome.runtime.sendMessage({ type: "translate:page-error" }); } catch { /* ignore */ }
    return { translations: data.texts.map(() => "") };
  }
}

async function handleAITranslateBatch(data: { texts: string[]; from: string; to: string }): Promise<string[]> {
  const settings = await getAISettings();
  const provider = providerRegistry.get(settings.activeProvider);
  const config = await getProviderConfig(settings.activeProvider);

  if (!provider || !config.apiKey) {
    throw new Error("No AI provider configured");
  }

  const targetLang = LANG_NAMES[data.to] || data.to;
  const translations: string[] = new Array(data.texts.length).fill("");

  // Process in small chunks to avoid API overload (529)
  const chunkSize = 3;
  for (let i = 0; i < data.texts.length; i += chunkSize) {
    const chunk = data.texts.slice(i, i + chunkSize);
    const result = await aiTranslateChunkWithRetry(provider, config, settings.activeModel, chunk, targetLang);
    for (let j = 0; j < result.length; j++) {
      translations[i + j] = result[j];
    }
  }

  return translations;
}

async function aiTranslateChunkWithRetry(
  provider: ReturnType<typeof providerRegistry.get>,
  config: Awaited<ReturnType<typeof getProviderConfig>>,
  model: string,
  texts: string[],
  targetLang: string,
  maxRetries = 3,
): Promise<string[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await aiTranslateChunk(provider!, config, model, texts, targetLang);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Retry on 429/529 (rate limit/overloaded) with exponential backoff
      if ((msg.includes("529") || msg.includes("429")) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  return texts.map(() => "");
}

async function aiTranslateChunk(
  provider: NonNullable<ReturnType<typeof providerRegistry.get>>,
  config: Awaited<ReturnType<typeof getProviderConfig>>,
  model: string,
  texts: string[],
  targetLang: string,
): Promise<string[]> {
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const prompt = `Translate each numbered line below to ${targetLang}. Return ONLY the translations, one per line, with the same number prefix. Do not add explanations.\n\n${numbered}`;

  let result = "";
  const stream = provider.chat(
    { model, messages: [{ role: "user", content: prompt }], temperature: 0.3, timeout: 60000 },
    config,
  );
  for await (const chunk of stream) {
    if (chunk.type === "text" && chunk.content) result += chunk.content;
    if (chunk.type === "error") throw new Error(chunk.error || "AI error");
  }

  const lines = result.trim().split("\n");
  const translations: string[] = new Array(texts.length).fill("");
  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s*(.+)/);
    if (match) {
      const idx = parseInt(match[1], 10) - 1;
      if (idx >= 0 && idx < texts.length) {
        translations[idx] = match[2].trim();
      }
    }
  }
  return translations;
}

async function handleAITranslate(data: { text: string; from: string; to: string }): Promise<{ translated: string }> {
  const settings = await getAISettings();
  const provider = providerRegistry.get(settings.activeProvider);
  const config = await getProviderConfig(settings.activeProvider);

  if (!provider) return { translated: "[Translation error: no AI provider configured.]" };
  if (!config.apiKey) return { translated: "[Translation error: API Key not set.]" };

  const targetLang = LANG_NAMES[data.to] || data.to;
  const prompt = data.from === "auto"
    ? `Translate the following text to ${targetLang}. Only return the translation, no explanations:\n\n${data.text}`
    : `Translate the following text from ${LANG_NAMES[data.from] || data.from} to ${targetLang}. Only return the translation, no explanations:\n\n${data.text}`;

  let result = "";
  try {
    const stream = provider.chat(
      { model: settings.activeModel, messages: [{ role: "user", content: prompt }], temperature: 0.3 },
      config,
    );
    for await (const chunk of stream) {
      if (chunk.type === "text" && chunk.content) result += chunk.content;
      if (chunk.type === "error") return { translated: `[Translation error: ${chunk.error}]` };
    }
  } catch (err) {
    result = `[Translation error: ${err instanceof Error ? err.message : "unknown error"}]`;
  }

  return { translated: result };
}

async function handleAISearchPage(data: { query: string; content: string }): Promise<{ snippets: string[]; error?: string }> {
  const settings = await getAISettings();
  const provider = providerRegistry.get(settings.activeProvider);
  const config = await getProviderConfig(settings.activeProvider);

  if (!provider) return { snippets: [], error: "No AI provider configured." };
  if (!config.apiKey) return { snippets: [], error: "API Key not set." };

  const prompt = `You are a search assistant. The user is searching for: "${data.query}"

Below is text extracted from a web page. Find all passages that are semantically relevant to the user's search intent. The user may use different words than the actual text — match by meaning, not just keywords.

Return ONLY a valid JSON array of exact quotes from the text below. Each quote should be a short phrase or sentence (10-80 characters) that appears verbatim in the text. Return [] if nothing is relevant.

Example response format: ["exact quote one", "exact quote two"]

Page text:
${data.content}`;

  let result = "";
  try {
    const stream = provider.chat(
      { model: settings.activeModel, messages: [{ role: "user", content: prompt }], temperature: 0.1 },
      config,
    );
    for await (const chunk of stream) {
      if (chunk.type === "text" && chunk.content) result += chunk.content;
      if (chunk.type === "error") return { snippets: [], error: chunk.error || "AI error" };
    }

    // Parse JSON from AI response — handle markdown code blocks
    let jsonStr = result.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return { snippets: parsed.filter((s: unknown) => typeof s === "string" && s.length >= 3) };
    }
    return { snippets: [], error: "AI returned invalid format" };
  } catch (err) {
    return { snippets: [], error: err instanceof Error ? err.message : "unknown error" };
  }
}

async function handleAddBookmark(data: { url: string; title: string; favicon?: string }) {
  const { addBookmark } = await import("../../lib/storage/bookmarks-store");
  await addBookmark({ ...data, tags: [] });
}

async function handleClipNote(data: { text: string; url: string; title: string }) {
  const { addNote } = await import("../../lib/storage/notes-store");
  await addNote({
    content: data.text,
    source: {
      url: data.url,
      title: data.title,
      selectedText: data.text,
      clippedAt: Date.now(),
    },
    tags: [],
    isPinned: false,
  });
}
