import { providerRegistry } from "../../lib/ai/provider-registry";
import { getAISettings, getProviderConfig } from "../../lib/storage/settings-store";
import type { ChatChunk } from "../../lib/ai/types";

export function setupAIGateway() {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "ai-chat") return;

    let abortController: AbortController | null = null;

    port.onMessage.addListener(async (msg) => {
      // Keep-alive ping
      if (msg.type === "ping") {
        port.postMessage({ type: "pong" });
        return;
      }

      // Cancel current stream
      if (msg.type === "cancel") {
        abortController?.abort();
        return;
      }

      // Start chat
      if (msg.type === "chat") {
        const { provider: providerId, model, messages, temperature } = msg;
        const provider = providerRegistry.get(providerId);

        if (!provider) {
          port.postMessage({ type: "error", error: `Unknown provider: ${providerId}` } satisfies ChatChunk);
          return;
        }

        const config = await getProviderConfig(providerId);
        abortController = new AbortController();

        try {
          const stream = provider.chat(
            { model, messages, temperature, signal: abortController.signal },
            config,
          );

          for await (const chunk of stream) {
            try {
              port.postMessage(chunk);
            } catch {
              // Port disconnected
              break;
            }
          }
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AbortError") {
            port.postMessage({ type: "done" } satisfies ChatChunk);
          } else {
            const message = err instanceof Error ? err.message : "Unknown error";
            port.postMessage({ type: "error", error: message } satisfies ChatChunk);
          }
        } finally {
          abortController = null;
        }
      }
    });

    port.onDisconnect.addListener(() => {
      abortController?.abort();
      abortController = null;
    });
  });
}
