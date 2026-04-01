import { providerRegistry } from "../../lib/ai/provider-registry";
import { getProviderConfig } from "../../lib/storage/settings-store";
import { TOOL_DEFINITIONS, executeTool } from "../../lib/ai/tools";
import type { ChatChunk, ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock } from "../../lib/ai/types";

const MAX_TOOL_ITERATIONS = 5;

export function setupAIGateway() {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "ai-chat") return;

    let abortController: AbortController | null = null;

    port.onMessage.addListener(async (msg) => {
      if (msg.type === "ping") {
        port.postMessage({ type: "pong" });
        return;
      }

      if (msg.type === "cancel") {
        abortController?.abort();
        return;
      }

      if (msg.type === "chat") {
        const { provider: providerId, model, messages, temperature } = msg;
        const provider = providerRegistry.get(providerId);

        if (!provider) {
          safePost(port, { type: "error", error: `Unknown provider: ${providerId}` });
          return;
        }

        const config = await getProviderConfig(providerId);
        abortController = new AbortController();

        // Mutable copy of messages for the agentic loop
        const apiMessages = [...messages];
        let iteration = 0;

        try {
          while (iteration < MAX_TOOL_ITERATIONS) {
            iteration++;

            const callTimeout = AbortSignal.timeout(60000);
            const signal = AbortSignal.any([abortController!.signal, callTimeout]);

            const stream = provider.chat(
              { model, messages: apiMessages, temperature, signal, tools: TOOL_DEFINITIONS },
              config,
            );

            let textContent = "";
            const toolCalls: { id: string; name: string; input: Record<string, unknown> }[] = [];
            let stopReason = "";

            for await (const chunk of stream) {
              if (chunk.type === "text") {
                textContent += chunk.content || "";
                safePost(port, chunk);
              } else if (chunk.type === "tool_call") {
                toolCalls.push({
                  id: chunk.toolCallId!,
                  name: chunk.toolName!,
                  input: chunk.toolInput!,
                });
              } else if (chunk.type === "done") {
                stopReason = chunk.content || "";
              } else if (chunk.type === "error") {
                safePost(port, chunk);
                return;
              }
            }

            // No tool calls → normal completion
            if (stopReason !== "tool_use" || toolCalls.length === 0) {
              safePost(port, { type: "done" } satisfies ChatChunk);
              return;
            }

            // --- Tool execution ---

            // Build assistant content blocks for the API messages
            if (provider.format === "openai") {
              // OpenAI format: assistant message with tool_calls, then separate tool messages
              apiMessages.push({
                role: "assistant",
                content: textContent || "",
                tool_calls: toolCalls.map((tc) => ({
                  id: tc.id,
                  type: "function",
                  function: { name: tc.name, arguments: JSON.stringify(tc.input) },
                })),
              } as any);
            } else {
              // Anthropic format: structured content blocks
              const assistantContent: ContentBlock[] = [];
              if (textContent) assistantContent.push({ type: "text", text: textContent } satisfies TextBlock);
              for (const tc of toolCalls) {
                assistantContent.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input } satisfies ToolUseBlock);
              }
              apiMessages.push({ role: "assistant", content: assistantContent });
            }

            // Execute each tool
            const toolResults: ToolResultBlock[] = [];
            for (const tc of toolCalls) {
              safePost(port, {
                type: "tool_status",
                toolName: tc.name,
                toolInput: tc.input,
                toolState: "running",
              } satisfies ChatChunk);

              try {
                const result = await executeTool(tc.name, tc.input);
                toolResults.push({ type: "tool_result", tool_use_id: tc.id, content: result });
                safePost(port, {
                  type: "tool_status",
                  toolName: tc.name,
                  toolInput: tc.input,
                  toolState: "completed",
                } satisfies ChatChunk);
              } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                toolResults.push({ type: "tool_result", tool_use_id: tc.id, content: `Error: ${errMsg}` });
                safePost(port, {
                  type: "tool_status",
                  toolName: tc.name,
                  toolInput: tc.input,
                  toolState: "failed",
                } satisfies ChatChunk);
              }
            }

            // Append tool results to API messages
            if (provider.format === "openai") {
              for (const tr of toolResults) {
                apiMessages.push({
                  role: "tool",
                  tool_call_id: tr.tool_use_id,
                  content: tr.content,
                } as any);
              }
            } else {
              apiMessages.push({ role: "user", content: toolResults as ContentBlock[] });
            }

            // Loop continues → next iteration calls provider.chat() again
          }

          // Exhausted max iterations → finish gracefully
          safePost(port, { type: "done" } satisfies ChatChunk);
        } catch (err: unknown) {
          if (err instanceof Error && err.name === "AbortError") {
            safePost(port, { type: "done" } satisfies ChatChunk);
          } else {
            const message = err instanceof Error ? err.message : "Unknown error";
            safePost(port, { type: "error", error: message } satisfies ChatChunk);
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

function safePost(port: chrome.runtime.Port, msg: ChatChunk) {
  try {
    port.postMessage(msg);
  } catch {
    // Port disconnected
  }
}
