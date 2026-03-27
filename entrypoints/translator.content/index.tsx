export default defineContentScript({
  matches: ["<all_urls>"],

  main() {
    let hoverEnabled = false;
    let hoverTooltip: HTMLElement | null = null;
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
    let isPageTranslated = false;
    const translatedNodes: HTMLElement[] = [];

    // Load settings
    chrome.storage.local.get("wa_translation_settings", (result) => {
      const settings = result.wa_translation_settings;
      if (settings?.hoverEnabled) {
        hoverEnabled = true;
        setupHoverTranslation();
      }
    });

    // Listen for messages from background/sidepanel
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      switch (message.type) {
        case "translate:page-start":
          translatePage(message.data.targetLang).then(() => sendResponse({ success: true }));
          return true;
        case "translate:page-restore":
          restorePage();
          sendResponse({ success: true });
          break;
        case "translate:hover-toggle":
          hoverEnabled = message.data.enabled;
          if (hoverEnabled) setupHoverTranslation();
          else teardownHoverTranslation();
          break;
      }
      return false;
    });

    function setupHoverTranslation() {
      document.addEventListener("mousemove", handleHover);
    }

    function teardownHoverTranslation() {
      document.removeEventListener("mousemove", handleHover);
      removeHoverTooltip();
    }

    function handleHover(e: MouseEvent) {
      if (hoverTimeout) clearTimeout(hoverTimeout);

      hoverTimeout = setTimeout(() => {
        const target = e.target as HTMLElement;
        if (target.closest("[data-wa-ui]")) return;

        const text = getTextUnderCursor(e);
        if (!text || text.length < 2 || text.length > 500) return;

        chrome.runtime.sendMessage(
          { type: "translate:text", data: { text, from: "auto", to: "zh-CN" } },
          (response) => {
            if (response?.translated && response.translated !== text) {
              showHoverTooltip(e.clientX, e.clientY, response.translated);
            }
          },
        );
      }, 500);
    }

    function getTextUnderCursor(e: MouseEvent): string {
      const target = e.target as HTMLElement;
      if (!target.textContent) return "";

      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (range) {
          range.expand("word" as any);
          const word = range.toString().trim();
          if (word) return word;
        }
      }

      const text = target.textContent?.trim() || "";
      return text.length > 200 ? text.slice(0, 200) : text;
    }

    function showHoverTooltip(x: number, y: number, text: string) {
      removeHoverTooltip();

      hoverTooltip = document.createElement("div");
      hoverTooltip.setAttribute("data-wa-ui", "true");
      hoverTooltip.style.cssText = `
        position: fixed;
        top: ${y + 20}px;
        left: ${Math.min(x, window.innerWidth - 280)}px;
        max-width: 260px;
        padding: 8px 12px;
        background: #1f2937;
        color: #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-size: 13px;
        line-height: 1.5;
        z-index: 2147483647;
        pointer-events: none;
      `;
      hoverTooltip.textContent = text;
      document.body.appendChild(hoverTooltip);

      setTimeout(removeHoverTooltip, 5000);
    }

    function removeHoverTooltip() {
      if (hoverTooltip) {
        hoverTooltip.remove();
        hoverTooltip = null;
      }
    }

    // ---- Full page translation ----

    const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA", "INPUT", "SVG"]);
    const BLOCK_TAGS = new Set(["P", "DIV", "LI", "TD", "TH", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "ARTICLE", "SECTION", "DT", "DD", "FIGCAPTION", "SUMMARY"]);

    interface TextBlock {
      element: HTMLElement;
      originalText: string;
    }

    function collectTextBlocks(): TextBlock[] {
      const blocks: TextBlock[] = [];
      const seen = new Set<HTMLElement>();

      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          const el = node as HTMLElement;
          if (SKIP_TAGS.has(el.tagName)) return NodeFilter.FILTER_REJECT;
          if (el.closest("[data-wa-ui]")) return NodeFilter.FILTER_REJECT;
          if (el.closest("[data-wa-translated]")) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      let node: Node | null;
      while ((node = walker.nextNode())) {
        const el = node as HTMLElement;
        if (!BLOCK_TAGS.has(el.tagName)) continue;

        // Get direct text content (skip if mostly child elements)
        const text = getDirectText(el).trim();
        if (!text || text.length < 2) continue;
        if (seen.has(el)) continue;
        seen.add(el);

        blocks.push({ element: el, originalText: text });
      }

      return blocks;
    }

    function getDirectText(el: HTMLElement): string {
      // Get visible text, including inline children but not block children
      const clone = el.cloneNode(true) as HTMLElement;
      // Remove block-level children from clone
      clone.querySelectorAll("div, p, ul, ol, li, h1, h2, h3, h4, h5, h6, blockquote, table, pre, article, section").forEach((c) => c.remove());
      return clone.textContent || "";
    }

    async function translatePage(targetLang: string) {
      if (isPageTranslated) restorePage();

      const blocks = collectTextBlocks();
      if (blocks.length === 0) return;

      // Report progress to sidepanel
      const totalBlocks = blocks.length;
      let translated = 0;

      const reportProgress = () => {
        try {
          chrome.runtime.sendMessage({
            type: "translate:page-progress",
            data: { translated, total: totalBlocks },
          });
        } catch { /* sidepanel might not be listening */ }
      };

      reportProgress();

      // Translate in batches of 20
      const batchSize = 20;
      for (let i = 0; i < blocks.length; i += batchSize) {
        const batch = blocks.slice(i, i + batchSize);
        const texts = batch.map((b) => b.originalText);

        try {
          const response: { translations: string[] } = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { type: "translate:page-batch", data: { texts, from: "auto", to: targetLang } },
              (r) => resolve(r || { translations: [] }),
            );
          });

          for (let j = 0; j < batch.length; j++) {
            const tr = response.translations[j];
            if (!tr || tr === batch[j].originalText) continue;

            // Insert bilingual translation below original
            const translatedEl = document.createElement("div");
            translatedEl.setAttribute("data-wa-translated", "true");
            translatedEl.style.cssText = `
              color: #0a84ff;
              font-size: 0.92em;
              line-height: 1.6;
              margin-top: 4px;
              padding: 2px 0;
              border-left: 2px solid rgba(10, 132, 255, 0.3);
              padding-left: 8px;
            `;
            translatedEl.textContent = tr;

            batch[j].element.after(translatedEl);
            translatedNodes.push(translatedEl);
          }

          translated += batch.length;
          reportProgress();
        } catch {
          translated += batch.length;
          reportProgress();
        }
      }

      isPageTranslated = true;

      // Report done
      try {
        chrome.runtime.sendMessage({ type: "translate:page-done" });
      } catch { /* ignore */ }
    }

    function restorePage() {
      for (const node of translatedNodes) {
        node.remove();
      }
      translatedNodes.length = 0;
      isPageTranslated = false;
    }
  },
});
