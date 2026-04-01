import { create } from "zustand";
import type { ChatMessage, Conversation, SelectionContext, PageContext } from "../lib/ai/types";
import {
  getConversations,
  saveConversation,
  deleteConversation as deleteConv,
  getActiveConversationId,
  setActiveConversationId,
} from "../lib/storage/conversations-store";
import { getAISettings } from "../lib/storage/settings-store";

export interface ToolStatus {
  name: string;
  input: Record<string, unknown>;
  state: "running" | "completed" | "failed";
}

interface ChatState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  isStreaming: boolean;
  pendingContext: SelectionContext | null;
  pageContext: PageContext | null;
  activeToolStatuses: ToolStatus[];

  // Actions
  loadConversations: () => Promise<void>;
  newConversation: () => Promise<void>;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  setPendingContext: (ctx: SelectionContext | null) => void;
  setPageContext: (ctx: PageContext | null) => void;
  addUserMessage: (content: string) => Promise<void>;
  startStreaming: () => void;
  appendChunk: (content: string) => void;
  finishStreaming: () => void;
  setStreamError: (error: string) => void;
  addToolStatus: (name: string, input: Record<string, unknown>, state: "running" | "completed" | "failed") => void;
}

// Chunk buffering: accumulate chunks and flush via rAF to avoid per-chunk re-renders
let chunkBuffer = "";
let flushScheduled = false;

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  requestAnimationFrame(() => {
    flushScheduled = false;
    const buffered = chunkBuffer;
    if (!buffered) return;
    chunkBuffer = "";

    const state = useChatStore.getState();
    const conv = state.activeConversation;
    if (!conv) return;

    const msgs = conv.messages;
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== "assistant") return;

    // Mutate only the last message's content, rebuild minimal objects
    const updatedMsg = { ...last, content: last.content + buffered };
    const updatedMessages = msgs.slice(0, -1);
    updatedMessages.push(updatedMsg);
    const updated = { ...conv, messages: updatedMessages, updatedAt: Date.now() };

    // Only update activeConversation during streaming; conversations list synced on finish
    useChatStore.setState({ activeConversation: updated });
  });
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  isStreaming: false,
  pendingContext: null,
  pageContext: null,
  activeToolStatuses: [],

  loadConversations: async () => {
    const conversations = await getConversations();
    const activeId = await getActiveConversationId();
    const active = activeId
      ? conversations.find((c) => c.id === activeId) || null
      : conversations[0] || null;
    set({ conversations, activeConversation: active });
  },

  newConversation: async () => {
    const settings = await getAISettings();
    const pc = get().pageContext;
    const conv: Conversation = {
      id: crypto.randomUUID(),
      title: "New Chat",
      messages: [],
      provider: settings.activeProvider,
      model: settings.activeModel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      url: pc?.url,
      pageTitle: pc?.title,
    };
    await saveConversation(conv);
    await setActiveConversationId(conv.id);
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversation: conv,
    }));
  },

  selectConversation: (id) => {
    const conv = get().conversations.find((c) => c.id === id);
    if (conv) {
      set({ activeConversation: conv });
      setActiveConversationId(id);
    }
  },

  deleteConversation: async (id) => {
    await deleteConv(id);
    const { conversations, activeConversation } = get();
    const filtered = conversations.filter((c) => c.id !== id);
    set({
      conversations: filtered,
      activeConversation:
        activeConversation?.id === id ? filtered[0] || null : activeConversation,
    });
  },

  setPendingContext: (ctx) => set({ pendingContext: ctx }),
  setPageContext: (ctx) => set({ pageContext: ctx }),

  addUserMessage: async (content) => {
    let conv = get().activeConversation;
    if (!conv) {
      await get().newConversation();
      conv = get().activeConversation!;
    }

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      context: get().pendingContext || undefined,
      timestamp: Date.now(),
    };

    const pc = get().pageContext;
    const updated: Conversation = {
      ...conv,
      messages: [...conv.messages, message],
      title: conv.messages.length === 0 ? content.slice(0, 50) : conv.title,
      updatedAt: Date.now(),
      url: conv.url || pc?.url,
      pageTitle: conv.pageTitle || pc?.title,
    };

    set((s) => ({
      activeConversation: updated,
      conversations: s.conversations.map((c) =>
        c.id === updated.id ? updated : c,
      ),
      pendingContext: null,
    }));

    await saveConversation(updated);
  },

  startStreaming: () => {
    const conv = get().activeConversation;
    if (!conv) return;

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    const updated: Conversation = {
      ...conv,
      messages: [...conv.messages, assistantMsg],
      updatedAt: Date.now(),
    };

    set((s) => ({
      isStreaming: true,
      activeConversation: updated,
      conversations: s.conversations.map((c) =>
        c.id === updated.id ? updated : c,
      ),
    }));
  },

  appendChunk: (content) => {
    chunkBuffer += content;
    scheduleFlush();
  },

  finishStreaming: () => {
    // Flush any remaining buffered chunks synchronously
    if (chunkBuffer) {
      const buffered = chunkBuffer;
      chunkBuffer = "";
      const conv = get().activeConversation;
      if (conv) {
        const msgs = conv.messages;
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          const updatedMsg = { ...last, content: last.content + buffered };
          const updatedMessages = msgs.slice(0, -1);
          updatedMessages.push(updatedMsg);
          const updated = { ...conv, messages: updatedMessages, updatedAt: Date.now() };
          set({ activeConversation: updated });
        }
      }
    }

    let conv = get().activeConversation;
    if (conv) {
      // Snapshot tool calls into the last assistant message
      const toolStatuses = get().activeToolStatuses;
      if (toolStatuses.length > 0) {
        const msgs = [...conv.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === "assistant") {
          msgs[msgs.length - 1] = {
            ...last,
            toolCalls: toolStatuses.map((t) => ({ name: t.name, input: t.input })),
          };
          conv = { ...conv, messages: msgs };
        }
      }
      saveConversation(conv);
    }
    // Sync conversations list, clear streaming flag and tool statuses
    set((s) => ({
      isStreaming: false,
      activeConversation: conv,
      activeToolStatuses: [],
      conversations: s.conversations.map((c) =>
        c.id === conv?.id ? conv : c,
      ),
    }));
  },

  addToolStatus: (name, input, state) => {
    set((s) => {
      const statuses = [...s.activeToolStatuses];
      const key = JSON.stringify({ name, input });
      const existing = statuses.findIndex(
        (t) => JSON.stringify({ name: t.name, input: t.input }) === key,
      );
      const entry: ToolStatus = { name, input, state };
      if (existing >= 0) {
        statuses[existing] = entry;
      } else {
        statuses.push(entry);
      }
      return { activeToolStatuses: statuses };
    });
  },

  setStreamError: (error) => {
    const conv = get().activeConversation;
    if (!conv) return;

    const messages = [...conv.messages];
    const last = messages[messages.length - 1];
    if (last && last.role === "assistant") {
      messages[messages.length - 1] = {
        ...last,
        content: last.content || `Error: ${error}`,
      };
    }

    const updated = { ...conv, messages, updatedAt: Date.now() };
    saveConversation(updated);
    set((s) => ({
      isStreaming: false,
      activeConversation: updated,
      conversations: s.conversations.map((c) =>
        c.id === updated.id ? updated : c,
      ),
    }));
  },
}));
