import { useState, useEffect } from "react";
import {
  MessageCircle,
  Search,
  Bookmark,
  FileText,
  Settings,
  Plus,
  Crosshair,
} from "lucide-react";
import { ChatPanel } from "../../components/chat/ChatPanel";
import { SearchPanel } from "../../components/search/SearchPanel";
import { BookmarksPanel } from "../../components/bookmarks/BookmarksPanel";
import { NotesPanel } from "../../components/notes/NotesPanel";
import { SettingsPanel } from "../../components/settings/SettingsPanel";
import { PickerPanel } from "../../components/picker/PickerPanel";
import { TranslationBar } from "../../components/translation/TranslationBar";
import { useChatStore } from "../../stores/chat-store";
import { usePageContext } from "../../hooks/usePageContext";
import { t } from "../../lib/utils/i18n";

type Tab = "chat" | "search" | "bookmarks" | "notes" | "picker" | "settings";

const tabDefs: { id: Tab; icon: typeof MessageCircle; labelKey: string }[] = [
  { id: "chat", icon: MessageCircle, labelKey: "tab.chat" },
  { id: "search", icon: Search, labelKey: "tab.search" },
  { id: "picker", icon: Crosshair, labelKey: "tab.picker" },
  { id: "bookmarks", icon: Bookmark, labelKey: "tab.bookmarks" },
  { id: "notes", icon: FileText, labelKey: "tab.notes" },
  { id: "settings", icon: Settings, labelKey: "tab.settings" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const loadConversations = useChatStore((s) => s.loadConversations);
  usePageContext();

  useEffect(() => {
    loadConversations();
    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.wa_pending_context?.newValue) {
        useChatStore.getState().setPendingContext(changes.wa_pending_context.newValue);
        setActiveTab("chat");
        chrome.storage.session.remove("wa_pending_context");
      }
      if (changes.wa_pending_element?.newValue) {
        setActiveTab("picker");
      }
    };
    chrome.storage.session.onChanged.addListener(handler);
    return () => chrome.storage.session.onChanged.removeListener(handler);
  }, [loadConversations]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-base)" }}>
      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "chat" && <ChatPanel />}
        {activeTab === "search" && <SearchPanel />}
        {activeTab === "bookmarks" && <BookmarksPanel />}
        {activeTab === "notes" && <NotesPanel />}
        {activeTab === "picker" && <PickerPanel />}
        {activeTab === "settings" && <SettingsPanel />}
      </div>

      {/* Quick actions bar */}
      <div style={{
        flexShrink: 0, display: "flex", justifyContent: "center", gap: 8, padding: "6px 16px",
        borderTop: "0.5px solid var(--border-subtle)", background: "var(--bg-surface)",
      }}>
        <button
          onClick={() => { useChatStore.getState().newConversation(); setActiveTab("chat"); }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 10,
            border: "1px solid var(--border-default)",
            background: "transparent", color: "var(--text-body)",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          <Plus size={14} />
          {t("app.newChat")}
        </button>
        <TranslationBar />
      </div>

      {/* Tab bar */}
      <nav
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "stretch",
          height: 58,
          background: "var(--bg-surface)",
          borderTop: "0.5px solid var(--border-subtle)",
        }}
      >
        {tabDefs.map(({ id, icon: Icon, labelKey }) => {
          const on = activeTab === id;
          const label = t(labelKey);
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-label={label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: on ? "var(--tint)" : "var(--text-muted)",
                position: "relative",
                transition: "color 0.15s",
              }}
            >
              {on && (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 22,
                    height: 2.5,
                    borderRadius: "0 0 2px 2px",
                    background: "var(--tint)",
                  }}
                />
              )}
              <Icon size={21} strokeWidth={on ? 2.1 : 1.5} />
              <span style={{ fontSize: 10, fontWeight: on ? 600 : 500, lineHeight: 1 }}>
                {label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
