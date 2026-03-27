import { useState, useRef, useCallback } from "react";
import { ArrowUp, Square } from "lucide-react";
import { t } from "../../lib/utils/i18n";

interface Props {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function ChatInput({ onSend, onStop, isStreaming }: Props) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const v = input.trim();
    if (!v || isStreaming) return;
    onSend(v);
    setInput("");
    if (ref.current) ref.current.style.height = "auto";
  }, [input, isStreaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const ok = input.trim().length > 0 && !isStreaming;

  return (
    <div style={{ flexShrink: 0, padding: "8px 18px 16px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: 20,
          padding: "10px 12px 10px 18px",
          boxShadow: "var(--shadow-sm)",
          minHeight: 52,
          transition: "border-color 0.2s, box-shadow 0.2s",
        }}
      >
        <textarea
          ref={ref}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={t("chat.placeholder")}
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 15,
            lineHeight: 1.5,
            color: "var(--text-strong)",
            maxHeight: 160,
            minHeight: 24,
            padding: "2px 0",
          }}
        />
        {isStreaming ? (
          <button
            onClick={onStop}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--red)", color: "#fff",
              border: "none", cursor: "pointer", flexShrink: 0,
            }}
            title={t("chat.stop")}
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!ok}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: ok ? "var(--tint)" : "var(--bg-sunken)",
              color: ok ? "#fff" : "var(--text-muted)",
              border: "none", cursor: ok ? "pointer" : "default", flexShrink: 0,
              transition: "all 0.15s",
            }}
            title={t("chat.send")}
          >
            <ArrowUp size={18} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
