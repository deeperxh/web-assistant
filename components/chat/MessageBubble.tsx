import { useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check, Loader2, X, Search, Globe } from "lucide-react";
import type { ChatMessage } from "../../lib/ai/types";
import type { ToolStatus } from "../../stores/chat-store";
import { t } from "../../lib/utils/i18n";

interface Props { message: ChatMessage; isStreaming?: boolean; toolStatuses?: ToolStatus[]; }

export const MessageBubble = memo(function MessageBubble({ message, isStreaming, toolStatuses }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="anim-in" style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            maxWidth: "82%",
            background: "var(--bubble-user)",
            color: "var(--bubble-user-text)",
            borderRadius: "18px 18px 6px 18px",
            padding: "11px 16px",
            fontSize: 15,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="anim-in">
      <div
        style={{
          background: "var(--bubble-ai)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "18px 18px 18px 6px",
          padding: "13px 16px",
          fontSize: 15,
          lineHeight: 1.6,
        }}
      >
        {/* Tool status indicators — live during streaming, from message history otherwise */}
        <ToolIndicators
          statuses={isStreaming ? toolStatuses : undefined}
          toolCalls={!isStreaming ? message.toolCalls : undefined}
        />
        <div className="md" style={{ wordBreak: "break-word" }}>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const m = /language-(\w+)/.exec(className || "");
                const code = String(children).replace(/\n$/, "");
                if (m) return <CodeBlock language={m[1]} code={code} />;
                return <code {...props}>{children}</code>;
              },
            }}
          >
            {message.content || "\u200B"}
          </ReactMarkdown>
          {isStreaming && !message.content && (
            <div className="streaming-dots" style={{ display: "flex", gap: 5, padding: "4px 0" }}>
              <span /><span /><span />
            </div>
          )}
          {isStreaming && message.content && (
            <span style={{
              display: "inline-block", width: 2, height: 16,
              marginLeft: 2, verticalAlign: "middle", borderRadius: 1,
              background: "var(--tint)", animation: "pulseDot 1s infinite",
            }} />
          )}
        </div>
      </div>
    </div>
  );
});

function ToolIndicators({
  statuses,
  toolCalls,
}: {
  statuses?: ToolStatus[];
  toolCalls?: { name: string; input: Record<string, unknown> }[];
}) {
  // During streaming: use live statuses; in history: use saved toolCalls (all completed)
  const items = statuses && statuses.length > 0
    ? statuses
    : toolCalls && toolCalls.length > 0
      ? toolCalls.map((tc) => ({ name: tc.name, input: tc.input, state: "completed" as const }))
      : null;

  if (!items) return null;

  return (
    <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map((s, i) => {
        const label =
          s.name === "web_search"
            ? `${t("tool.searching")}: ${(s.input as { query?: string }).query || ""}`
            : `${t("tool.reading")}: ${truncateUrl((s.input as { url?: string }).url || "")}`;

        return (
          <div
            key={i}
            className="anim-in"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--text-muted)",
              padding: "3px 0",
            }}
          >
            {s.state === "running" && <Loader2 size={13} style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} />}
            {s.state === "completed" && (s.name === "web_search"
              ? <Search size={13} style={{ color: "var(--tint)", flexShrink: 0 }} />
              : <Globe size={13} style={{ color: "var(--tint)", flexShrink: 0 }} />
            )}
            {s.state === "failed" && <X size={13} style={{ color: "var(--red)", flexShrink: 0 }} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function truncateUrl(url: string, max = 50): string {
  if (url.length <= max) return url;
  try {
    const u = new URL(url);
    const path = u.pathname.length > 30 ? u.pathname.slice(0, 27) + "..." : u.pathname;
    return u.host + path;
  } catch {
    return url.slice(0, max) + "...";
  }
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div style={{ margin: "10px 0", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "6px 14px", background: "var(--code-header-bg)", color: "var(--code-header-text)", fontSize: 12,
      }}>
        <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{language}</span>
        <button
          onClick={copy}
          aria-label={t("aria.copyCode")}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "transparent", border: "none", color: copied ? "var(--code-copy-success)" : "var(--code-header-text)",
            cursor: "pointer", fontSize: 12, padding: "2px 6px", borderRadius: 5,
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? t("common.copied") : t("common.copy")}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{ margin: 0, padding: "14px 16px", fontSize: 13, background: "var(--code-body-bg)", lineHeight: 1.6 }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
