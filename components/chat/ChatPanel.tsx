import { useState, useRef, useEffect } from "react";
import { Plus, History, ArrowLeft, Trash2, MessageCircle, Sparkles, Globe } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import { useChatStore } from "../../stores/chat-store";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { ContextBadge } from "./ContextBadge";
import { t } from "../../lib/utils/i18n";

export function ChatPanel() {
  const { messages, isStreaming, pendingContext, sendMessage, cancelStream, setPendingContext, newConversation } = useChat();
  const { conversations, activeConversation, selectConversation, deleteConversation, pageContext } = useChatStore();
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---- History ---- */
  if (showHistory) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }} className="anim-in">
        <div className="frosted-bar" style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setShowHistory(false)} className="btn-ghost" style={{ padding: 6 }}>
            <ArrowLeft size={20} />
          </button>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{t("chat.history")}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {conversations.length === 0 ? (
              <Empty icon={<MessageCircle size={32} />} text={t("chat.empty")} />
            ) : (
              conversations.map((c, i) => (
                <div
                  key={c.id}
                  className="tile anim-in"
                  style={{
                    cursor: "pointer",
                    background: c.id === activeConversation?.id ? "var(--tint-soft)" : undefined,
                    animationDelay: `${i * 25}ms`,
                  }}
                  onClick={() => { selectConversation(c.id); setShowHistory(false); }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                      {c.pageTitle && (
                        <div style={{ fontSize: 12, color: "var(--tint)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.7 }}>
                          {c.pageTitle}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                        {c.messages.length} 条消息 · {new Date(c.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                      className="btn-ghost"
                      style={{ color: "var(--red)", padding: 6 }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ---- Chat ---- */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div className="frosted-bar" style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{t("tab.chat")}</span>
        <div style={{ display: "flex", gap: 2 }}>
          <button onClick={() => setShowHistory(true)} className="btn-ghost" style={{ padding: 7 }} title={t("chat.history")}>
            <History size={19} />
          </button>
          <button onClick={newConversation} className="btn-ghost" style={{ padding: 7 }} title={t("chat.newChat")}>
            <Plus size={19} />
          </button>
        </div>
      </div>

      {/* Page context indicator */}
      {pageContext && (
        <div style={{
          padding: "6px 20px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderBottom: "0.5px solid var(--border-subtle)",
          background: "var(--bg-surface)",
        }}>
          <Globe size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          <span style={{
            fontSize: 12,
            color: "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {t("chat.pageContext")}: {pageContext.title || pageContext.url}
          </span>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {messages.length === 0 && (
            <div className="anim-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--tint-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={26} style={{ color: "var(--tint)" }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 500, fontSize: 15, color: "var(--text-body)" }}>{t("chat.empty")}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>选中网页文字可直接引用提问</div>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble key={msg.id} message={msg} isStreaming={isStreaming && i === messages.length - 1 && msg.role === "assistant"} />
          ))}
          <div ref={endRef} />
        </div>
      </div>

      {pendingContext && <ContextBadge context={pendingContext} onDismiss={() => setPendingContext(null)} />}
      <ChatInput onSend={sendMessage} onStop={cancelStream} isStreaming={isStreaming} />
    </div>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="anim-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 0", gap: 12 }}>
      <div style={{ padding: 18, borderRadius: 18, background: "var(--bg-sunken)", color: "var(--text-muted)" }}>{icon}</div>
      <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{text}</span>
    </div>
  );
}
