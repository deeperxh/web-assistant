import type { ToolDefinition } from "./types";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "web_search",
    description:
      "Search the web using DuckDuckGo. Returns a list of results with titles, URLs, and snippets. Use this when you need to find current information, look up facts, or find relevant web pages.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_url",
    description:
      "Fetch a web page and extract its text content. Use this to read articles, documentation, READMEs, or any web page the user references or you found via search. Returns up to ~8000 characters of text content.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The URL to fetch" },
      },
      required: ["url"],
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "web_search":
      return executeWebSearch(input.query as string);
    case "fetch_url":
      return executeFetchUrl(input.url as string);
    default:
      return `Unknown tool: ${name}`;
  }
}

// --- Web Search via DuckDuckGo ---

async function executeWebSearch(query: string): Promise<string> {
  if (!query?.trim()) return "Error: empty search query";

  const results: { title: string; url: string; snippet: string }[] = [];

  // Try DuckDuckGo HTML endpoint (richer results)
  try {
    const r = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(15000),
      },
    );
    const html = await r.text();

    // Regex-parse results (no DOMParser in MV3 service worker)
    const resultBlocks = html.split(/class="result\s/);
    for (let i = 1; i < resultBlocks.length && results.length < 8; i++) {
      const block = resultBlocks[i];

      // Extract URL from result__a href
      const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]+)"/);
      let url = "";
      if (hrefMatch) {
        url = hrefMatch[1];
        // DuckDuckGo wraps URLs in redirects — extract real URL
        const uddgMatch = url.match(/uddg=([^&]+)/);
        if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
      }

      // Extract title
      const titleMatch = block.match(
        /class="result__a"[^>]*>([^<]+(?:<[^>]+>[^<]*)*)<\/a>/,
      );
      let title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

      // Extract snippet
      const snippetMatch = block.match(
        /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/,
      );
      let snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, "").trim()
        : "";

      if (url && (title || snippet)) {
        results.push({ title: title || url, url, snippet });
      }
    }
  } catch {
    // Fall through to JSON API
  }

  // Fallback: DuckDuckGo Instant Answer JSON API
  if (results.length === 0) {
    try {
      const r = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
        { signal: AbortSignal.timeout(10000) },
      );
      const d = await r.json();
      if (d.AbstractText) {
        results.push({
          title: d.Heading || query,
          url: d.AbstractURL || "",
          snippet: d.AbstractText,
        });
      }
      for (const t of d.RelatedTopics || []) {
        if (t.Text && t.FirstURL && results.length < 8) {
          results.push({
            title: t.Text.slice(0, 80),
            url: t.FirstURL,
            snippet: t.Text,
          });
        }
      }
    } catch {
      return "Error: failed to search the web. Please try again.";
    }
  }

  if (results.length === 0) {
    return `No results found for "${query}".`;
  }

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.snippet}`)
    .join("\n\n");
}

// --- Fetch URL and Extract Text ---

async function executeFetchUrl(url: string): Promise<string> {
  if (!url?.trim()) return "Error: empty URL";
  if (!/^https?:\/\//i.test(url)) return `Error: invalid URL "${url}"`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain,*/*",
        "User-Agent": "Mozilla/5.0 (compatible; WebAssistant/1.0)",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return `Error: HTTP ${response.status} fetching ${url}`;
    }

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    // If it's plain text or JSON, return directly
    if (contentType.includes("text/plain") || contentType.includes("application/json")) {
      return text.slice(0, 8000);
    }

    // HTML → extract text
    return htmlToText(text).slice(0, 8000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error fetching ${url}: ${msg}`;
  }
}

// --- HTML to Text (regex-based, no DOMParser in service worker) ---

function htmlToText(html: string): string {
  let text = html;

  // Remove script and style blocks (with content)
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Remove nav, footer, header blocks
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, "");

  // Replace block-level tags with newlines
  text = text.replace(/<\/?(p|div|br|hr|li|tr|h[1-6]|blockquote|pre|table|section|article|main)\b[^>]*\/?>/gi, "\n");

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n\s*\n/g, "\n\n");

  return text.trim();
}
