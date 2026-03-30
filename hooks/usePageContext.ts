import { useEffect, useRef } from "react";
import { useChatStore } from "../stores/chat-store";
import type { PageContext } from "../lib/ai/types";

async function fetchPageContext(): Promise<PageContext | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) return null;

    // Skip chrome:// and extension pages where content script can't run
    const url = tab.url;
    const title = tab.title || url;

    if (url.startsWith("chrome://") || url.startsWith("chrome-extension://") || url.startsWith("about:")) {
      return { url, title, content: "" };
    }

    try {
      const response: { content: string } = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id!, { type: "page-content:extract" }, (r) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(r || { content: "" });
          }
        });
      });
      return { url, title, content: response.content || "" };
    } catch {
      // Content script not available — fallback to url+title only
      return { url, title, content: "" };
    }
  } catch {
    return null;
  }
}

export function usePageContext() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function debouncedFetch() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const ctx = await fetchPageContext();
        useChatStore.getState().setPageContext(ctx);
      }, 300);
    }

    // Initial fetch
    debouncedFetch();

    // Tab switched
    const onActivated = () => debouncedFetch();
    chrome.tabs.onActivated.addListener(onActivated);

    // Page navigation completed
    const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.status === "complete") {
        // Only re-fetch if it's the active tab
        chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          if (tab?.id === tabId) debouncedFetch();
        });
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);
}
