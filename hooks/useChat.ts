import { useCallback, useRef } from "react";
import { useChatStore } from "../stores/chat-store";
import { getAISettings } from "../lib/storage/settings-store";
import type { SelectionContext } from "../lib/ai/types";

export function useChat() {
  const {
    activeConversation,
    isStreaming,
    pendingContext,
    addUserMessage,
    startStreaming,
    appendChunk,
    finishStreaming,
    setStreamError,
    setPendingContext,
    newConversation,
  } = useChatStore();

  const portRef = useRef<chrome.runtime.Port | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      // Build context-augmented message
      let fullContent = content;
      if (pendingContext) {
        fullContent = `[Context from: ${pendingContext.title} (${pendingContext.url})]\n---\n${pendingContext.text}\n---\n\n${content}`;
      }

      await addUserMessage(fullContent);
      startStreaming();

      const settings = await getAISettings();
      const conv = useChatStore.getState().activeConversation;
      if (!conv) return;

      // Build messages for API
      const { pageContext } = useChatStore.getState();
      const apiMessages: { role: string; content: string }[] = [];

      if (pageContext) {
        const systemContent = [
          "You are a helpful AI web assistant embedded in a browser extension.",
          "The user is currently viewing:\n",
          `URL: ${pageContext.url}`,
          `Title: ${pageContext.title}`,
        ];
        if (pageContext.content) {
          systemContent.push(
            "\n--- Page Content ---",
            pageContext.content,
            "--- End ---",
          );
        }
        systemContent.push(
          "\nUse this page context to answer questions about the page when relevant. If the user's question is not about the page, answer normally.",
        );
        apiMessages.push({ role: "system", content: systemContent.join("\n") });
      }

      apiMessages.push(
        ...conv.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })),
      );

      // Open port to background
      const port = chrome.runtime.connect({ name: "ai-chat" });
      portRef.current = port;

      // Keep-alive ping
      keepAliveRef.current = setInterval(() => {
        try {
          port.postMessage({ type: "ping" });
        } catch {
          cleanup();
        }
      }, 25000);

      port.onMessage.addListener((msg) => {
        if (msg.type === "text" && msg.content) {
          appendChunk(msg.content);
        } else if (msg.type === "done") {
          finishStreaming();
          cleanup();
        } else if (msg.type === "error") {
          setStreamError(msg.error || "Unknown error");
          cleanup();
        }
      });

      port.onDisconnect.addListener(() => {
        if (useChatStore.getState().isStreaming) {
          finishStreaming();
        }
        cleanup();
      });

      port.postMessage({
        type: "chat",
        provider: settings.activeProvider,
        model: settings.activeModel,
        messages: apiMessages,
        temperature: settings.temperature,
      });

      function cleanup() {
        if (keepAliveRef.current) {
          clearInterval(keepAliveRef.current);
          keepAliveRef.current = null;
        }
        portRef.current = null;
      }
    },
    [pendingContext, addUserMessage, startStreaming, appendChunk, finishStreaming, setStreamError],
  );

  const cancelStream = useCallback(() => {
    try {
      portRef.current?.postMessage({ type: "cancel" });
    } catch {
      // port already disconnected
    }
  }, []);

  return {
    messages: activeConversation?.messages || [],
    isStreaming,
    pendingContext,
    sendMessage,
    cancelStream,
    setPendingContext,
    newConversation,
  };
}
