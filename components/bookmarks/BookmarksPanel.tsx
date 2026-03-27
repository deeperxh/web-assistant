import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, ExternalLink, Search, Star, X } from "lucide-react";
import { getBookmarks, addBookmark, removeBookmark, type Bookmark } from "../../lib/storage/bookmarks-store";
import { t } from "../../lib/utils/i18n";

export function BookmarksPanel() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [search, setSearch] = useState("");
  const load = useCallback(async () => { setBookmarks(await getBookmarks()); }, []);

  useEffect(() => {
    load();
    const h = (c: Record<string, chrome.storage.StorageChange>) => { if (c.wa_bookmarks) load(); };
    chrome.storage.local.onChanged.addListener(h);
    return () => chrome.storage.local.onChanged.removeListener(h);
  }, [load]);

  const handleAdd = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && tab?.title) { await addBookmark({ url: tab.url, title: tab.title, favicon: tab.favIconUrl, tags: [] }); load(); }
  }, [load]);

  const filtered = bookmarks.filter((b) => !search || b.title.toLowerCase().includes(search.toLowerCase()) || b.url.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="frosted-bar" style={{ padding: "14px 20px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{t("bookmarks.title")}</span>
          <button onClick={handleAdd} className="btn-tint" style={{ fontSize: 13, padding: "7px 14px", gap: 5 }}>
            <Plus size={15} /> {t("bookmarks.add")}
          </button>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--bg-surface)", border: "1px solid var(--border-default)",
          borderRadius: 12, padding: "10px 14px", minHeight: 44,
        }}>
          <Search size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search.placeholder")}
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 15, color: "var(--text-strong)", padding: 0 }} />
          {search && <button onClick={() => setSearch("")} className="btn-ghost" style={{ padding: 4 }}><X size={14} style={{ color: "var(--text-muted)" }} /></button>}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && (
            <div className="anim-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", gap: 12 }}>
              <div style={{ padding: 16, borderRadius: 18, background: "var(--bg-sunken)" }}><Star size={28} style={{ color: "var(--text-muted)" }} /></div>
              <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{search ? t("search.noResults") : t("bookmarks.empty")}</span>
            </div>
          )}
          {filtered.map((bm, i) => (
            <div key={bm.id} className="tile anim-in" style={{ display: "flex", alignItems: "center", gap: 12, animationDelay: `${i * 20}ms` }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--bg-sunken)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {bm.favicon ? <img src={bm.favicon} alt="" style={{ width: 20, height: 20, borderRadius: 4 }} /> : <Star size={15} style={{ color: "var(--text-muted)" }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bm.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {bm.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                </div>
              </div>
              <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                <a href={bm.url} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ padding: 7 }}><ExternalLink size={15} /></a>
                <button onClick={() => { removeBookmark(bm.id); load(); }} className="btn-ghost" style={{ padding: 7, color: "var(--red)" }}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
