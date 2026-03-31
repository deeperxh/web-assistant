import "./style.css";
import type { ElementInfo } from "../../lib/element-picker/types";
import {
  generateCssSelector,
  generateXPath,
  generateParentChain,
  extractSiblings,
  extractKeyAttributes,
} from "../../lib/element-picker/selector-generator";

export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: "ui",

  main(ctx) {
    let floatingButton: HTMLElement | null = null;
    let translationTargetLang = "zh-CN";

    // Dark mode aware colors
    const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const COLORS = {
      light: {
        barBg: "#1f2937", barText: "#e5e7eb", barHover: "#374151",
        tooltipBg: "#1f2937", tooltipText: "#e5e7eb",
        toastBg: "#22c55e", toastText: "#ffffff",
        searchMark: "#fbbf24", searchMarkCurrent: "#f97316", searchMarkText: "#1f2937",
        aiMark: "#a78bfa",
        pickerBorder: "#0a84ff", pickerBg: "rgba(10, 132, 255, 0.08)",
      },
      dark: {
        barBg: "#1e293b", barText: "#f1f5f9", barHover: "#334155",
        tooltipBg: "#1e293b", tooltipText: "#f1f5f9",
        toastBg: "#22c55e", toastText: "#ffffff",
        searchMark: "#fbbf24", searchMarkCurrent: "#f97316", searchMarkText: "#1f2937",
        aiMark: "#a78bfa",
        pickerBorder: "#409cff", pickerBg: "rgba(64, 156, 255, 0.12)",
      },
    };
    let colors = darkQuery.matches ? COLORS.dark : COLORS.light;
    darkQuery.addEventListener("change", (e) => { colors = e.matches ? COLORS.dark : COLORS.light; });

    // Content script i18n
    const STRINGS = {
      "zh-CN": {
        extensionUpdated: "扩展已更新，请刷新页面后重试",
        translating: "翻译中...",
        translationFailed: "翻译失败：无响应",
        saved: "已保存!",
        askAI: "问 AI",
        translate: "翻译",
        save: "保存",
      },
      en: {
        extensionUpdated: "Extension updated. Please refresh the page.",
        translating: "Translating...",
        translationFailed: "Translation failed: no response",
        saved: "Saved!",
        askAI: "Ask AI",
        translate: "Translate",
        save: "Save",
      },
    } as const;
    let csLang: "zh-CN" | "en" = "zh-CN";
    const cs = (key: keyof typeof STRINGS["zh-CN"]) => STRINGS[csLang]?.[key] || STRINGS["zh-CN"][key];

    // Load translation target language and locale from settings
    try {
      chrome.storage.local.get("wa_ai_settings", (result) => {
        if (chrome.runtime.lastError) return;
        if (result.wa_ai_settings?.translationTargetLang) {
          translationTargetLang = result.wa_ai_settings.translationTargetLang;
        }
        if (result.wa_ai_settings?.locale === "en") csLang = "en";
      });
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.wa_ai_settings?.newValue?.translationTargetLang) {
          translationTargetLang = changes.wa_ai_settings.newValue.translationTargetLang;
        }
        if (changes.wa_ai_settings?.newValue?.locale) {
          csLang = changes.wa_ai_settings.newValue.locale === "en" ? "en" : "zh-CN";
        }
      });
    } catch {
      // Extension context invalidated — old content script in a stale tab
    }

    /**
     * Safe wrapper for chrome.runtime.sendMessage.
     * Catches "Extension context invalidated" (happens after extension reload
     * while old content scripts are still injected in open tabs).
     */
    function safeSendMessage(msg: unknown, callback?: (response: any) => void) {
      try {
        if (!chrome.runtime?.id) {
          showToast(cs("extensionUpdated"));
          return;
        }
        chrome.runtime.sendMessage(msg as any, (response: any) => {
          if (chrome.runtime.lastError) {
            const err = chrome.runtime.lastError.message || "";
            if (err.includes("invalidated") || err.includes("Receiving end does not exist")) {
              showToast(cs("extensionUpdated"));
            } else {
              console.warn("[WA]", err);
            }
            return;
          }
          callback?.(response);
        });
      } catch (e) {
        showToast(cs("extensionUpdated"));
      }
    }

    // Listen for text selection
    document.addEventListener("mouseup", (e) => {
      // Small delay to let selection settle
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();

        // Remove existing floating button
        removeFloatingButton();

        if (!text || text.length < 2) return;

        // Don't show floating button if click is inside the extension UI
        const target = e.target as HTMLElement;
        if (target.closest("[data-wa-ui]")) return;

        const range = selection!.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        showFloatingButton(text, rect);
      }, 50);
    });

    // Remove floating button on click elsewhere
    document.addEventListener("mousedown", (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-wa-ui]")) {
        removeFloatingButton();
      }
    });

    // Handle page search messages
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      switch (message.type) {
        case "page-search:find":
          sendResponse(findInPage(message.data.query));
          break;
        case "page-search:next":
          sendResponse(navigateSearch(1));
          break;
        case "page-search:prev":
          sendResponse(navigateSearch(-1));
          break;
        case "page-search:clear":
          clearSearch();
          sendResponse({ success: true });
          break;
        case "page-content:extract":
          sendResponse(extractPageContent());
          break;
        case "page-search:find-snippets":
          sendResponse(findSnippetsInPage(message.data.snippets));
          break;
        case "picker:start":
          startPicker();
          sendResponse({ success: true });
          break;
        case "picker:cancel":
          stopPicker();
          sendResponse({ success: true });
          break;
      }
      return false;
    });

    function showFloatingButton(text: string, rect: DOMRect) {
      floatingButton = document.createElement("div");
      floatingButton.setAttribute("data-wa-ui", "true");
      floatingButton.className = "wa-floating-bar";
      floatingButton.style.cssText = `
        position: fixed;
        top: ${Math.max(rect.top - 40, 4)}px;
        left: ${Math.min(rect.left + rect.width / 2 - 80, window.innerWidth - 170)}px;
        z-index: 2147483647;
        display: flex;
        gap: 2px;
        padding: 4px;
        background: ${colors.barBg};
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: wa-fade-in 0.15s ease;
      `;

      const buttons = [
        { label: cs("askAI"), icon: "💬", action: "ask" },
        { label: cs("translate"), icon: "🌐", action: "translate" },
        { label: cs("save"), icon: "📌", action: "save" },
      ];

      for (const btn of buttons) {
        const el = document.createElement("button");
        el.style.cssText = `
          display: flex; align-items: center; gap: 4px;
          padding: 4px 8px; border: none; border-radius: 6px;
          background: transparent; color: ${colors.barText}; font-size: 12px;
          cursor: pointer; white-space: nowrap;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        `;
        el.onmouseenter = () => { el.style.background = colors.barHover; };
        el.onmouseleave = () => { el.style.background = "transparent"; };
        el.textContent = `${btn.icon} ${btn.label}`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          handleAction(btn.action, text);
          removeFloatingButton();
        });
        floatingButton.appendChild(el);
      }

      document.body.appendChild(floatingButton);
    }

    function removeFloatingButton() {
      if (floatingButton) {
        floatingButton.remove();
        floatingButton = null;
      }
    }

    function handleAction(action: string, text: string) {
      const context = {
        text,
        url: location.href,
        title: document.title,
      };

      switch (action) {
        case "ask":
          safeSendMessage({ type: "selection:send", data: { context } });
          break;
        case "translate": {
          // Save selection rect before async call — selection may be lost later
          const sel = window.getSelection();
          const savedRect = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
          if (!savedRect) break;

          // Show loading tooltip immediately
          const loadingTooltip = showTranslationTooltip(savedRect, cs("translating"));

          safeSendMessage(
            { type: "translate:text", data: { text, from: "auto", to: translationTargetLang } },
            (response) => {
              if (response?.translated) {
                if (response.translated.startsWith("[Translation error")) {
                  loadingTooltip.remove();
                  showToast(response.translated);
                } else {
                  // Replace loading text with result
                  loadingTooltip.textContent = response.translated;
                }
              } else {
                loadingTooltip.remove();
                showToast(cs("translationFailed"));
              }
            },
          );
          break;
        }
        case "save":
          safeSendMessage(
            { type: "note:clip", data: { text, url: location.href, title: document.title } },
            () => showToast(cs("saved")),
          );
          break;
      }
    }

    function showTranslationTooltip(rect: DOMRect, text: string): HTMLElement {
      const tooltip = document.createElement("div");
      tooltip.setAttribute("data-wa-ui", "true");
      tooltip.style.cssText = `
        position: fixed;
        top: ${rect.bottom + 8}px;
        left: ${Math.min(rect.left, window.innerWidth - 320)}px;
        max-width: 300px;
        padding: 12px;
        background: ${colors.tooltipBg};
        color: ${colors.tooltipText};
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-size: 13px;
        line-height: 1.5;
        z-index: 2147483647;
        animation: wa-fade-in 0.15s ease;
      `;
      tooltip.textContent = text;

      document.body.appendChild(tooltip);
      setTimeout(() => tooltip.remove(), 15000);
      document.addEventListener("mousedown", (e) => {
        if (!(e.target as HTMLElement)?.closest("[data-wa-ui]")) tooltip.remove();
      }, { once: true });
      return tooltip;
    }

    function showToast(message: string) {
      const toast = document.createElement("div");
      toast.setAttribute("data-wa-ui", "true");
      toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        padding: 8px 16px; background: ${colors.toastBg}; color: ${colors.toastText};
        border-radius: 8px; font-size: 13px; z-index: 2147483647;
        animation: wa-fade-in 0.15s ease;
      `;
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }

    // ---- Page Search ----
    let searchMarks: HTMLElement[] = [];
    let currentIndex = 0;

    function findInPage(query: string): { count: number; current: number } {
      clearSearch();
      if (!query) return { count: 0, current: 0 };

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(tag)) return NodeFilter.FILTER_REJECT;
          if (parent.closest("[data-wa-ui]")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const regex = new RegExp(escapeRegex(query), "gi");
      const textNodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        textNodes.push(node as Text);
      }

      for (const textNode of textNodes) {
        const text = textNode.textContent || "";
        let match: RegExpExecArray | null;
        const ranges: Range[] = [];

        while ((match = regex.exec(text)) !== null) {
          const range = document.createRange();
          range.setStart(textNode, match.index);
          range.setEnd(textNode, match.index + match[0].length);
          ranges.push(range);
        }

        // Process in reverse to avoid offset issues
        for (let i = ranges.length - 1; i >= 0; i--) {
          const mark = document.createElement("mark");
          mark.setAttribute("data-wa-search", "true");
          mark.style.cssText = `background: ${colors.searchMark}; color: ${colors.searchMarkText}; padding: 0 1px; border-radius: 2px;`;
          ranges[i].surroundContents(mark);
          searchMarks.unshift(mark);
        }
      }

      if (searchMarks.length > 0) {
        currentIndex = 0;
        highlightCurrent();
      }

      return { count: searchMarks.length, current: currentIndex };
    }

    function navigateSearch(direction: number): { count: number; current: number } {
      if (searchMarks.length === 0) return { count: 0, current: 0 };
      currentIndex = (currentIndex + direction + searchMarks.length) % searchMarks.length;
      highlightCurrent();
      return { count: searchMarks.length, current: currentIndex };
    }

    function highlightCurrent() {
      for (let i = 0; i < searchMarks.length; i++) {
        searchMarks[i].style.background = i === currentIndex ? colors.searchMarkCurrent : colors.searchMark;
      }
      searchMarks[currentIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function clearSearch() {
      for (const mark of searchMarks) {
        const parent = mark.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
          parent.normalize();
        }
      }
      searchMarks = [];
      currentIndex = 0;
    }

    function extractPageContent(): { content: string } {
      const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "SVG", "NAV", "FOOTER", "HEADER"]);
      const BLOCK_TAGS = new Set(["P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "TD", "TH", "BLOCKQUOTE", "PRE", "ARTICLE", "SECTION", "DT", "DD"]);
      const blocks: string[] = [];
      let currentBlock = "";

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
            if (el.closest("[data-wa-ui]")) return NodeFilter.FILTER_REJECT;
            if (el.offsetWidth === 0 && el.offsetHeight === 0) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest("[data-wa-ui]")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let n: Node | null;
      while ((n = walker.nextNode())) {
        if (n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((n as HTMLElement).tagName)) {
          if (currentBlock.trim()) blocks.push(currentBlock.trim());
          currentBlock = "";
        } else if (n.nodeType === Node.TEXT_NODE) {
          const t = n.textContent?.trim();
          if (t) currentBlock += (currentBlock ? " " : "") + t;
        }
      }
      if (currentBlock.trim()) blocks.push(currentBlock.trim());

      // Limit total size ~2000 chars to reduce AI token usage and latency
      let content = "";
      for (const b of blocks) {
        if (content.length + b.length > 2000) break;
        content += b + "\n";
      }
      return { content: content.trim() };
    }

    function findSnippetsInPage(snippets: string[]): { count: number; current: number } {
      clearSearch();
      if (!snippets || snippets.length === 0) return { count: 0, current: 0 };

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName;
          if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(tag)) return NodeFilter.FILTER_REJECT;
          if (parent.closest("[data-wa-ui]")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const textNodes: Text[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        textNodes.push(node as Text);
      }

      for (const snippet of snippets) {
        if (!snippet || snippet.length < 3) continue;
        const regex = new RegExp(escapeRegex(snippet), "gi");

        for (const textNode of textNodes) {
          const text = textNode.textContent || "";
          let match: RegExpExecArray | null;
          const ranges: Range[] = [];

          while ((match = regex.exec(text)) !== null) {
            const range = document.createRange();
            range.setStart(textNode, match.index);
            range.setEnd(textNode, match.index + match[0].length);
            ranges.push(range);
          }

          for (let i = ranges.length - 1; i >= 0; i--) {
            const mark = document.createElement("mark");
            mark.setAttribute("data-wa-search", "true");
            mark.style.cssText = `background: ${colors.aiMark}; color: ${colors.searchMarkText}; padding: 0 2px; border-radius: 2px;`;
            try { ranges[i].surroundContents(mark); } catch { continue; }
            searchMarks.unshift(mark);
          }
        }
      }

      if (searchMarks.length > 0) {
        currentIndex = 0;
        highlightCurrent();
      }

      return { count: searchMarks.length, current: currentIndex };
    }

    function escapeRegex(s: string): string {
      return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    // ---- Element Picker ----
    let pickerActive = false;
    let pickerOverlay: HTMLElement | null = null;
    let currentHoveredElement: Element | null = null;
    let rafId = 0;

    function startPicker() {
      if (pickerActive) return;
      pickerActive = true;

      // Create highlight overlay
      pickerOverlay = document.createElement("div");
      pickerOverlay.setAttribute("data-wa-ui", "true");
      pickerOverlay.style.cssText = `
        position: fixed;
        pointer-events: none;
        border: 2px solid ${colors.pickerBorder};
        background: ${colors.pickerBg};
        border-radius: 3px;
        z-index: 2147483647;
        transition: top 0.08s ease, left 0.08s ease, width 0.08s ease, height 0.08s ease;
        display: none;
      `;
      document.body.appendChild(pickerOverlay);

      document.body.style.cursor = "crosshair";
      document.addEventListener("mousemove", onPickerMouseMove, true);
      document.addEventListener("click", onPickerClick, true);
      document.addEventListener("keydown", onPickerKeyDown, true);
    }

    function stopPicker() {
      if (!pickerActive) return;
      pickerActive = false;
      cancelAnimationFrame(rafId);

      if (pickerOverlay) {
        pickerOverlay.remove();
        pickerOverlay = null;
      }
      currentHoveredElement = null;
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onPickerMouseMove, true);
      document.removeEventListener("click", onPickerClick, true);
      document.removeEventListener("keydown", onPickerKeyDown, true);
    }

    function onPickerMouseMove(e: MouseEvent) {
      if (!pickerActive) return;
      const target = e.target as Element;
      if (target.closest("[data-wa-ui]")) return;
      if (target === currentHoveredElement) return;

      currentHoveredElement = target;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!pickerOverlay || !currentHoveredElement) return;
        const rect = currentHoveredElement.getBoundingClientRect();
        pickerOverlay.style.top = `${rect.top}px`;
        pickerOverlay.style.left = `${rect.left}px`;
        pickerOverlay.style.width = `${rect.width}px`;
        pickerOverlay.style.height = `${rect.height}px`;
        pickerOverlay.style.display = "block";
      });
    }

    function onPickerClick(e: MouseEvent) {
      if (!pickerActive) return;
      const target = e.target as Element;
      if (target.closest("[data-wa-ui]")) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const el = currentHoveredElement || target;
      const info = extractElementInfo(el);
      stopPicker();
      safeSendMessage({ type: "picker:element-selected", data: { elementInfo: info } });
    }

    function onPickerKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        stopPicker();
      }
    }

    function extractElementInfo(el: Element): ElementInfo {
      const computed = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      return {
        selector: generateCssSelector(el),
        xpath: generateXPath(el),
        tagName: el.tagName.toLowerCase(),
        id: el.id || "",
        classes: Array.from(el.classList),
        textContent: (el.textContent || "").trim().slice(0, 100),
        parentChain: generateParentChain(el),
        boundingBox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        styles: {
          padding: computed.padding,
          margin: computed.margin,
          width: computed.width,
          height: computed.height,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          border: computed.border,
          borderRadius: computed.borderRadius,
          display: computed.display,
          position: computed.position,
          lineHeight: computed.lineHeight,
          gap: computed.gap,
        },
        siblings: extractSiblings(el),
        attributes: extractKeyAttributes(el),
      };
    }
  },
});
