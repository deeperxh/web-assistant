import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Pin, Save, ArrowLeft, ExternalLink, FileText, Link2 } from "lucide-react";
import { getNotes, addNote, updateNote, deleteNote, type Note } from "../../lib/storage/notes-store";
import { t } from "../../lib/utils/i18n";

export function NotesPanel() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [content, setContent] = useState("");
  const load = useCallback(async () => { setNotes(await getNotes()); }, []);

  useEffect(() => {
    load();
    const h = (c: Record<string, chrome.storage.StorageChange>) => { if (c.wa_notes) load(); };
    chrome.storage.local.onChanged.addListener(h);
    return () => chrome.storage.local.onChanged.removeListener(h);
  }, [load]);

  const handleNew = useCallback(async () => { const n = await addNote({ content: "", tags: [], isPinned: false }); setEditing(n); setContent(""); }, []);
  const handleSave = useCallback(async () => { if (!editing) return; await updateNote(editing.id, { content }); setEditing(null); load(); }, [editing, content, load]);
  const handleDelete = useCallback(async (id: string) => { await deleteNote(id); if (editing?.id === id) setEditing(null); load(); }, [editing, load]);
  const handlePin = useCallback(async (n: Note) => { await updateNote(n.id, { isPinned: !n.isPinned }); load(); }, [load]);

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }} className="anim-in">
        <div className="frosted-bar" style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => { setEditing(null); load(); }} className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500, padding: "6px 8px" }} aria-label={t("aria.backToNotes")}>
            <ArrowLeft size={18} /> {t("notes.back")}
          </button>
          <button onClick={handleSave} className="btn-tint" style={{ fontSize: 13, padding: "7px 14px", gap: 5 }} aria-label={t("notes.save")}>
            <Save size={14} /> {t("notes.save")}
          </button>
        </div>
        {editing.source && (
          <a href={editing.source.url} target="_blank" rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 8, margin: "12px 20px 0",
              padding: "10px 14px", borderRadius: 12, textDecoration: "none",
              background: "var(--tint-soft)", border: "1px solid var(--tint-glow)",
            }}
            title={editing.source.url}
          >
            <Link2 size={13} style={{ color: "var(--tint)", flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: "var(--text-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{editing.source.title || editing.source.url}</span>
            <ExternalLink size={11} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          </a>
        )}
        <textarea
          value={content} onChange={(e) => setContent(e.target.value)}
          placeholder={t("notes.placeholder")} autoFocus
          aria-label={t("aria.noteInput")}
          style={{ flex: 1, resize: "none", background: "transparent", border: "none", outline: "none", padding: "16px 22px", fontSize: 15, lineHeight: 1.8, color: "var(--text-strong)" }}
        />
        <div style={{ padding: "8px 22px 14px", fontSize: 12, color: "var(--text-muted)" }}>{t("notes.charCount", { count: String(content.length) })}</div>
      </div>
    );
  }

  const pinned = notes.filter((n) => n.isPinned);
  const rest = notes.filter((n) => !n.isPinned);
  const all = [...pinned, ...rest];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="frosted-bar" style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{t("notes.title")}</span>
        <button onClick={handleNew} className="btn-tint" style={{ fontSize: 13, padding: "7px 14px", gap: 5 }} aria-label={t("notes.add")}>
          <Plus size={15} /> {t("notes.add")}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          {all.length === 0 && (
            <div className="anim-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 0", gap: 12 }}>
              <div style={{ padding: 16, borderRadius: 18, background: "var(--bg-sunken)" }}><FileText size={28} style={{ color: "var(--text-muted)" }} /></div>
              <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{t("notes.empty")}</span>
            </div>
          )}
          {all.map((n, i) => (
            <li key={n.id} className="tile anim-in" style={{ cursor: "pointer", animationDelay: `${Math.min(i * 20, 500)}ms` }} onClick={() => { setEditing(n); setContent(n.content); }}>
              {n.isPinned && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--tint)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  <Pin size={11} /> {t("notes.pinned")}
                </div>
              )}
              <div style={{ fontSize: 14, lineHeight: 1.6, color: n.content ? "var(--text-strong)" : "var(--text-muted)", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {n.content || t("notes.placeholder")}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  {n.source && (
                    <a href={n.source.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                      style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--tint)", textDecoration: "none", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <ExternalLink size={11} style={{ flexShrink: 0 }} />{n.source.title || "Web"}
                    </a>
                  )}
                  <span style={{ fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{new Date(n.updatedAt).toLocaleDateString()}</span>
                </div>
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => handlePin(n)} className="btn-ghost" style={{ padding: 5, color: n.isPinned ? "var(--tint)" : "var(--text-muted)" }} aria-label={n.isPinned ? t("aria.unpinNote") : t("aria.pinNote")}><Pin size={14} /></button>
                  <button onClick={() => handleDelete(n.id)} className="btn-ghost" style={{ padding: 5, color: "var(--red)" }} aria-label={t("aria.deleteNote")}><Trash2 size={14} /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
