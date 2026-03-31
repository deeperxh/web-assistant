import type { SelectionContext } from "../ai/types";
import type { ElementInfo } from "../element-picker/types";

// Message types for communication between extension components
export interface MessageMap {
  // Content script -> Background
  "selection:send": { context: SelectionContext };
  "translate:text": { text: string; from: string; to: string };
  "translate:page": { targetLang: string };
  "page-search:find": { query: string };
  "page-search:next": undefined;
  "page-search:prev": undefined;
  "page-search:clear": undefined;
  "bookmark:add": { url: string; title: string; favicon?: string };
  "note:clip": { text: string; url: string; title: string };

  // Background -> Content script
  "translate:result": { translated: string };
  "translate:page-start": { targetLang: string };
  "page-search:results": { count: number; current: number };
  "selection:request": undefined;

  // Element Picker
  "picker:start": undefined;
  "picker:cancel": undefined;
  "picker:element-selected": { elementInfo: ElementInfo };

  // Side panel -> Background
  "ai:chat": {
    provider: string;
    model: string;
    messages: { role: string; content: string }[];
    temperature?: number;
  };
  "ai:cancel": undefined;

  // Background -> Side panel (via port)
  "ai:chunk": { content: string };
  "ai:done": undefined;
  "ai:error": { error: string };
}

export type MessageType = keyof MessageMap;

export interface ExtensionMessage<T extends MessageType = MessageType> {
  type: T;
  data: MessageMap[T];
}

export function sendMessage<T extends MessageType>(
  type: T,
  data: MessageMap[T],
): Promise<void> {
  return chrome.runtime.sendMessage({ type, data });
}

export function sendTabMessage<T extends MessageType>(
  tabId: number,
  type: T,
  data: MessageMap[T],
): Promise<void> {
  return chrome.tabs.sendMessage(tabId, { type, data });
}
