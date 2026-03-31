import { useState, useCallback, useRef, useEffect } from "react";
import { Search, FileText, Globe, MapPin, ChevronUp, ChevronDown, X, ExternalLink, Loader2, SearchX, Sparkles, Zap } from "lucide-react";
import { t } from "../../lib/utils/i18n";

type Mode = "page" | "site" | "web";
type PageSearchMode = "exact" | "ai";

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("page");
  const [pageMode, setPageMode] = useState<PageSearchMode>("exact");
  const [pageRes, setPageRes] = useState<{ count: number; current: number } | null>(null);
  const [webRes, setWebRes] = useState<{ title: string; url: string; snippet: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [siteDomain, setSiteDomain] = useState("");
  const domainRef = useRef("");

  // Get current tab domain on mount or when mode changes to site
  const refreshDomain = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      try {
        const domain = new URL(tab.url).hostname;
        setSiteDomain(domain);
        domainRef.current = domain;
      } catch { /* ignore invalid URLs */ }
    }
  }, []);

  // ---- Page Search (exact) ----
  const searchPage = useCallback(async (q: string) => {
    if (!q.trim()) { clearPage(); return; }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: "page-search:find", data: { query: q } }, (r) => { if (r) setPageRes(r); });
  }, []);

  // ---- Page Search (AI semantic) ----
  const searchPageAI = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setAiError(null);
    setPageRes(null);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { setLoading(false); return; }

      // Step 1: extract page content
      const content: { content: string } = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id!, { type: "page-content:extract" }, (r) => resolve(r || { content: "" }));
      });

      if (!content.content) {
        setAiError(t("search.aiNoContent"));
        setLoading(false);
        return;
      }

      // Step 2: AI finds relevant snippets
      const result: { snippets: string[]; error?: string } = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "ai-search:page", data: { query: q, content: content.content } }, (r) => resolve(r || { snippets: [], error: "No response" }));
      });

      if (result.error) {
        setAiError(result.error);
        setLoading(false);
        return;
      }

      if (result.snippets.length === 0) {
        setPageRes({ count: 0, current: 0 });
        setLoading(false);
        return;
      }

      // Step 3: highlight snippets on page
      chrome.tabs.sendMessage(tab.id!, { type: "page-search:find-snippets", data: { snippets: result.snippets } }, (r) => {
        if (r) setPageRes(r);
        setLoading(false);
      });
    } catch {
      setAiError("Search failed");
      setLoading(false);
    }
  }, []);

  const nav = useCallback(async (dir: "next" | "prev") => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    chrome.tabs.sendMessage(tab.id, { type: dir === "next" ? "page-search:next" : "page-search:prev" }, (r) => { if (r) setPageRes(r); });
  }, []);

  const clearPage = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "page-search:clear" });
    setPageRes(null);
    setAiError(null);
  }, []);

  // ---- Web Search (DuckDuckGo API) ----
  const searchWeb = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`);
      const d = await r.json();
      const out: typeof webRes = [];
      if (d.AbstractText) out.push({ title: d.Heading || q, url: d.AbstractURL || "", snippet: d.AbstractText });
      for (const t of d.RelatedTopics || []) if (t.Text && t.FirstURL) out.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text });
      setWebRes(out);
    } catch { setWebRes([]); } finally { setLoading(false); }
  }, []);

  // ---- Site Search (DuckDuckGo HTML scraping) ----
  const searchSite = useCallback(async (q: string) => {
    if (!q.trim() || !domainRef.current) return;
    setLoading(true);
    setWebRes([]);
    try {
      const fullQuery = `site:${domainRef.current} ${q}`;
      const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(fullQuery)}`, {
        method: "GET",
        headers: { "Accept": "text/html" },
      });
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const results: typeof webRes = [];

      doc.querySelectorAll(".result").forEach((el) => {
        const a = el.querySelector(".result__a") as HTMLAnchorElement | null;
        const snippetEl = el.querySelector(".result__snippet");
        if (a?.href && a.textContent) {
          // DuckDuckGo wraps URLs in redirect links, extract real URL
          let url = a.href;
          try {
            const u = new URL(url);
            const uddg = u.searchParams.get("uddg");
            if (uddg) url = decodeURIComponent(uddg);
          } catch { /* keep original */ }
          results.push({
            title: a.textContent.trim(),
            url,
            snippet: snippetEl?.textContent?.trim() || "",
          });
        }
      });

      setWebRes(results);
    } catch { setWebRes([]); } finally { setLoading(false); }
  }, []);

  const go = useCallback(() => {
    if (mode === "page") {
      if (pageMode === "exact") searchPage(query);
      else searchPageAI(query);
    } else if (mode === "site") {
      searchSite(query);
    } else {
      searchWeb(query);
    }
  }, [mode, pageMode, query, searchPage, searchPageAI, searchSite, searchWeb]);
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") go(); };

  // Debounce: auto-search for page-exact mode after 300ms of inactivity
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (mode === "page" && pageMode === "exact" && query.trim()) {
      debounceRef.current = setTimeout(() => searchPage(query), 300);
      return () => clearTimeout(debounceRef.current);
    }
  }, [query, mode, pageMode, searchPage]);

  const handleModeChange = (m: Mode) => {
    setMode(m);
    if (m === "site") refreshDomain();
  };

  const handleClear = () => {
    setQuery("");
    clearPage();
    setWebRes([]);
    setAiError(null);
  };

  const modes = [
    { id: "page" as const, icon: FileText, label: t("search.thisPage") },
    { id: "site" as const, icon: MapPin, label: t("search.site") },
    { id: "web" as const, icon: Globe, label: t("search.web") },
  ];

  const isPageMode = mode === "page";
  const showResults = mode === "web" || mode === "site";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="frosted-bar" style={{ padding: "14px 20px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{t("tab.search")}</span>

        {/* Mode Toggle */}
        <div style={{ display: "flex", gap: 4, background: "var(--bg-sunken)", borderRadius: 12, padding: 4 }}>
          {modes.map((m) => (
            <button key={m.id} onClick={() => handleModeChange(m.id)} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              height: 36, borderRadius: 10, border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 12,
              background: mode === m.id ? "var(--bg-surface)" : "transparent",
              color: mode === m.id ? "var(--text-strong)" : "var(--text-muted)",
              boxShadow: mode === m.id ? "var(--shadow-xs)" : "none",
              transition: "all 0.15s",
            }}>
              <m.icon size={13} />
              {m.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--bg-surface)", border: "1px solid var(--border-default)",
          borderRadius: 12, padding: "10px 14px", minHeight: 44,
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}>
          <Search size={17} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
            aria-label={t("tab.search")}
            placeholder={mode === "site" && siteDomain ? `${t("search.placeholder").replace("...", "")} ${siteDomain}` : t("search.placeholder")}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 15, color: "var(--text-strong)", padding: 0 }} />
          {query && <button onClick={handleClear} className="btn-ghost" style={{ padding: 4 }} aria-label={t("aria.clearSearch")}><X size={15} style={{ color: "var(--text-muted)" }} /></button>}
        </div>

        {/* Page search sub-toggle: exact vs AI */}
        {isPageMode && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setPageMode("exact"); if (query) searchPage(query); }} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              height: 32, borderRadius: 8, border: "1px solid var(--border-default)", cursor: "pointer",
              fontSize: 12, fontWeight: 600,
              background: pageMode === "exact" ? "var(--tint-soft)" : "transparent",
              color: pageMode === "exact" ? "var(--tint)" : "var(--text-muted)",
              transition: "all 0.15s",
            }}>
              <Zap size={12} />
              {t("search.exact")}
            </button>
            <button onClick={() => { setPageMode("ai"); clearPage(); if (query) searchPageAI(query); }} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              height: 32, borderRadius: 8, border: "1px solid var(--border-default)", cursor: "pointer",
              fontSize: 12, fontWeight: 600,
              background: pageMode === "ai" ? "var(--tint-soft)" : "transparent",
              color: pageMode === "ai" ? "var(--tint)" : "var(--text-muted)",
              transition: "all 0.15s",
            }}>
              <Sparkles size={12} />
              {t("search.aiSemantic")}
            </button>
          </div>
        )}

        {/* Page search results counter + nav */}
        {isPageMode && !loading && pageRes && (
          <div className="anim-in" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--tint)", background: "var(--tint-soft)", padding: "4px 12px", borderRadius: 8 }}>
              {pageRes.count > 0 ? `${pageRes.current + 1} / ${pageRes.count}` : t("search.noResults")}
            </span>
            {pageRes.count > 0 && (
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => nav("prev")} className="btn-ghost" style={{ border: "1px solid var(--border-default)", borderRadius: 10, padding: 6 }} aria-label={t("aria.prevResult")}><ChevronUp size={16} /></button>
                <button onClick={() => nav("next")} className="btn-ghost" style={{ border: "1px solid var(--border-default)", borderRadius: 10, padding: 6 }} aria-label={t("aria.nextResult")}><ChevronDown size={16} /></button>
              </div>
            )}
          </div>
        )}

        {/* Loading for page AI search */}
        {isPageMode && loading && (
          <div className="anim-in" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Loader2 size={16} style={{ color: "var(--tint)", animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("search.aiSearching")}</span>
          </div>
        )}

        {/* AI error */}
        {isPageMode && aiError && (
          <div className="anim-in" role="alert" style={{ fontSize: 13, color: "var(--red)", padding: "6px 12px", borderRadius: 8, background: "var(--red-soft)" }}>
            {aiError}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Loading for web/site search */}
          {showResults && loading && (
            <div className="anim-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", gap: 10 }}>
              <Loader2 size={24} style={{ color: "var(--tint)", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("common.loading")}</span>
            </div>
          )}

          {/* No results for web/site */}
          {showResults && !loading && webRes.length === 0 && query && (
            <div className="anim-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", gap: 12 }}>
              <div style={{ padding: 16, borderRadius: 18, background: "var(--bg-sunken)" }}><SearchX size={28} style={{ color: "var(--text-muted)" }} /></div>
              <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{t("search.noResults")}</span>

              {/* Google fallback for site search */}
              {mode === "site" && siteDomain && (
                <a
                  href={`https://www.google.com/search?q=site:${siteDomain}+${encodeURIComponent(query)}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--tint)", textDecoration: "none", marginTop: 4 }}
                >
                  <ExternalLink size={14} />
                  {t("search.openInGoogle")}
                </a>
              )}
            </div>
          )}

          {/* Web/site results */}
          {showResults && webRes.map((r, i) => (
            <li key={i}><a href={r.url} target="_blank" rel="noopener noreferrer" className="tile anim-in" style={{ display: "block", textDecoration: "none", animationDelay: `${i * 30}ms` }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--tint)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
              <div style={{ fontSize: 13, color: "var(--text-body)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.snippet}</div>
            </a></li>
          ))}

          {/* Google fallback link at bottom of site results */}
          {mode === "site" && !loading && webRes.length > 0 && siteDomain && (
            <a
              href={`https://www.google.com/search?q=site:${siteDomain}+${encodeURIComponent(query)}`}
              target="_blank" rel="noopener noreferrer"
              className="anim-in"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, color: "var(--tint)", textDecoration: "none", padding: "12px 0" }}
            >
              <ExternalLink size={14} />
              {t("search.openInGoogle")}
            </a>
          )}
        </ul>
      </div>
    </div>
  );
}
