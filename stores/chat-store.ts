import { create } from "zustand";
import type { ChatMessage, Conversation, SelectionContext } from "../lib/ai/types";
import {
  getConversations,
  saveConversation,
  deleteConversation as deleteConv,
  getActiveConversationId,
  setActiveConversationId,
} from "../lib/storage/conversations-store";
import { getAISettings } from "../lib/storage/settings-store";

interface ChatState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  isStreaming: boolean;
  pendingContext: SelectionContext | null;

  // Actions
  loadConversations: () => Promise<void>;
  newConversation: () => Promise<void>;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  setPendingContext: (ctx: SelectionContext | null) => void;
  addUserMessage: (content: string) => Promise<void>;
  startStreaming: () => void;
  appendChunk: (content: string) => void;
  finishStreaming: () => void;
  setStreamError: (error: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConversation: null,
  isStreaming: false,
  pendingContext: null,

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
    const conv: Conversation = {
      id: crypto.randomUUID(),
      title: "New Chat",
      messages: [],
      provider: settings.activeProvider,
      model: settings.activeModel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
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

    const updated: Conversation = {
      ...conv,
      messages: [...conv.messages, message],
      title: conv.messages.length === 0 ? content.slice(0, 50) : conv.title,
      updatedAt: Date.now(),
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
    const conv = get().activeConversation;
    if (!conv) return;

    const messages = [...conv.messages];
    const last = messages[messages.length - 1];
    if (last && last.role === "assistant") {
      messages[messages.length - 1] = { ...last, content: last.content + content };
    }

    const updated = { ...conv, messages, updatedAt: Date.now() };
    set((s) => ({
      activeConversation: updated,
      conversations: s.conversations.map((c) =>
        c.id === updated.id ? updated : c,
      ),
    }));
  },

  finishStreaming: () => {
    const conv = get().activeConversation;
    if (conv) {
      saveConversation(conv);
    }
    set({ isStreaming: false });
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
