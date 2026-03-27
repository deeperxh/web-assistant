import type { Conversation } from "../ai/types";

const CONVERSATIONS_KEY = "wa_conversations";
const ACTIVE_CONVERSATION_KEY = "wa_active_conversation_id";
const MAX_CONVERSATIONS = 50;

export async function getConversations(): Promise<Conversation[]> {
  const result = await chrome.storage.local.get(CONVERSATIONS_KEY);
  return result[CONVERSATIONS_KEY] || [];
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  const conversations = await getConversations();
  const index = conversations.findIndex((c) => c.id === conversation.id);

  if (index >= 0) {
    conversations[index] = conversation;
  } else {
    conversations.unshift(conversation);
  }

  // Keep only the most recent conversations
  const trimmed = conversations.slice(0, MAX_CONVERSATIONS);
  await chrome.storage.local.set({ [CONVERSATIONS_KEY]: trimmed });
}

export async function deleteConversation(id: string): Promise<void> {
  const conversations = await getConversations();
  const filtered = conversations.filter((c) => c.id !== id);
  await chrome.storage.local.set({ [CONVERSATIONS_KEY]: filtered });
}

export async function getActiveConversationId(): Promise<string | null> {
  const result = await chrome.storage.local.get(ACTIVE_CONVERSATION_KEY);
  return result[ACTIVE_CONVERSATION_KEY] || null;
}

export async function setActiveConversationId(id: string | null): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_CONVERSATION_KEY]: id });
}
