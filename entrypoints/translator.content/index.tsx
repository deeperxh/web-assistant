export default defineContentScript({
  matches: ["<all_urls>"],

  main() {
    let hoverEnabled = false;
    let hoverTooltip: HTMLElement | null = null;
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null;
    let isPageTranslated = false;
    const translatedNodes: HTMLElement[] = [];
    const translationCache = new Map<string, string>();

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
        case "translate:check-status":
          sendResponse({ translated: isPageTranslated });
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
    const HEADING_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

    // GitHub/GitLab: only translate README content
    const README_SELECTORS = [
      "#readme .markdown-body",     // GitHub repo README
      "article.markdown-body",      // GitHub wiki/gist/file preview
      ".readme-holder .md",         // GitLab README
      "article.md",                 // GitLab article
      ".file-content .md",          // GitLab file content
    ];

    function isGitHubOrGitLab(): boolean {
      const h = location.hostname;
      return h === "github.com" || h.endsWith(".github.com")
        || h.startsWith("gitlab.") || h === "gitlab.com" || h.endsWith(".gitlab.com");
    }

    function findReadmeRoot(): HTMLElement | null {
      for (const sel of README_SELECTORS) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      }
      return null;
    }

    interface TextBlock {
      element: HTMLElement;
      originalText: string;
    }

    function normalizeWhitespace(text: string): string {
      return text.replace(/\s+/g, " ").trim();
    }

    /** Extract visible text, stripping script/style/hidden elements */
    function getCleanText(el: HTMLElement): string {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("script, style, noscript, code, pre, textarea, input, svg, template").forEach((c) => c.remove());
      return normalizeWhitespace(clone.textContent || "");
    }

    /** Detect word-wrapper pattern: all children are short-text block elements */
    function isWordWrapperContainer(el: HTMLElement): boolean {
      const children = el.children;
      if (children.length < 2) return false;

      for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        if (!BLOCK_TAGS.has(child.tagName)) return false;
        const text = (child.textContent || "").trim();
        if (!text || text.length > 50) return false;
      }

      // Ensure no significant direct text nodes (only whitespace between children)
      let directText = "";
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          directText += (node.textContent || "").trim();
        }
      }
      return directText.length <= 5;
    }

    /** Mark all block-level descendants as seen to prevent duplicate translation */
    function markDescendants(el: HTMLElement, seen: Set<HTMLElement>) {
      const selector = Array.from(BLOCK_TAGS).join(",");
      for (const d of el.querySelectorAll(selector)) {
        seen.add(d as HTMLElement);
      }
    }

    function collectTextBlocks(root?: HTMLElement): TextBlock[] {
      const blocks: TextBlock[] = [];
      const seen = new Set<HTMLElement>();

      const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_ELEMENT, {
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
        if (seen.has(el)) continue;

        // Priority 1: Headings — always translate as a single unit
        if (HEADING_TAGS.has(el.tagName)) {
          const text = getCleanText(el);
          if (text && text.length >= 2) {
            seen.add(el);
            markDescendants(el, seen);
            blocks.push({ element: el, originalText: text });
          }
          continue;
        }

        // Priority 2: Word-wrapper containers — merge short-text block children
        if (isWordWrapperContainer(el)) {
          const text = getCleanText(el);
          if (text && text.length >= 2) {
            seen.add(el);
            markDescendants(el, seen);
            blocks.push({ element: el, originalText: text });
          }
          continue;
        }

        // Priority 3: Regular blocks — use direct text only
        const text = normalizeWhitespace(getDirectText(el));
        if (!text || text.length < 2) continue;
        seen.add(el);
        blocks.push({ element: el, originalText: text });
      }

      return blocks;
    }

    function getDirectText(el: HTMLElement): string {
      // Get visible text, including inline children but not block children
      const clone = el.cloneNode(true) as HTMLElement;
      // Remove block-level children and non-visible elements from clone
      clone.querySelectorAll("div, p, ul, ol, li, h1, h2, h3, h4, h5, h6, blockquote, table, pre, article, section, script, style, noscript, svg, template").forEach((c) => c.remove());
      return normalizeWhitespace(clone.textContent || "");
    }

    async function translatePage(targetLang: string) {
      if (isPageTranslated) restorePage();

      // GitHub/GitLab: only translate README section
      let root: HTMLElement | undefined;
      if (isGitHubOrGitLab()) {
        const readmeEl = findReadmeRoot();
        if (!readmeEl) {
          try { chrome.runtime.sendMessage({ type: "translate:page-done" }); } catch { /* ignore */ }
          return;
        }
        root = readmeEl;
      }

      const blocks = collectTextBlocks(root);
      if (blocks.length === 0) {
        try {
          chrome.runtime.sendMessage({ type: "translate:page-done" });
        } catch { /* ignore */ }
        return;
      }

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

      // Translate in batches of 20, using cache when available
      const batchSize = 20;
      for (let i = 0; i < blocks.length; i += batchSize) {
        const batch = blocks.slice(i, i + batchSize);

        // Split into cached and uncached
        const uncachedIndices: number[] = [];
        const uncachedTexts: string[] = [];
        const results: string[] = new Array(batch.length).fill("");

        for (let j = 0; j < batch.length; j++) {
          const cached = translationCache.get(batch[j].originalText);
          if (cached) {
            results[j] = cached;
          } else {
            uncachedIndices.push(j);
            uncachedTexts.push(batch[j].originalText);
          }
        }

        // Only call API for uncached texts
        if (uncachedTexts.length > 0) {
          try {
            const response: { translations: string[] } = await new Promise((resolve) => {
              chrome.runtime.sendMessage(
                { type: "translate:page-batch", data: { texts: uncachedTexts, from: "auto", to: targetLang } },
                (r) => resolve(r || { translations: [] }),
              );
            });
            for (let k = 0; k < uncachedIndices.length; k++) {
              const tr = response.translations[k] || "";
              results[uncachedIndices[k]] = tr;
              if (tr) translationCache.set(batch[uncachedIndices[k]].originalText, tr);
            }
          } catch {
            // API failed, cached results still available
          }
        }

        // Insert translations into DOM
        for (let j = 0; j < batch.length; j++) {
          const tr = results[j];
          if (!tr || tr === batch[j].originalText) continue;

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
