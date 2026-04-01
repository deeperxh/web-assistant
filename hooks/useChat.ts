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
    addToolStatus,
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

      const systemContent = [
        "You are a helpful AI web assistant embedded in a browser extension.",
        "",
        "You have access to these tools:",
        "- web_search(query): Search the web for current information",
        "- fetch_url(url): Fetch and read the content of any web page",
        "",
        "Use tools proactively when they would help answer the user's question.",
        "For example:",
        "- If the user asks about something you're not sure about, search for it",
        "- If the user mentions a URL or asks about a specific page, fetch it",
        "- If you need to verify facts or find up-to-date information, search for them",
        "",
        "After using tools, synthesize the results into a clear, helpful response with sources.",
      ];

      if (pageContext) {
        systemContent.push(
          "",
          "The user is currently viewing:",
          `URL: ${pageContext.url}`,
          `Title: ${pageContext.title}`,
        );
        if (pageContext.content) {
          systemContent.push(
            "\n--- Page Content ---",
            pageContext.content,
            "--- End ---",
          );
        }
        systemContent.push(
          "",
          "Use this page context when relevant. If the user asks about a different page, use fetch_url to read it.",
        );
      }

      apiMessages.push({ role: "system", content: systemContent.join("\n") });

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
        } else if (msg.type === "tool_status") {
          addToolStatus(msg.toolName, msg.toolInput, msg.toolState);
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
    [pendingContext, addUserMessage, startStreaming, appendChunk, finishStreaming, setStreamError, addToolStatus],
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
