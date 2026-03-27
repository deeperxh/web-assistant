import { useState, memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";
import type { ChatMessage } from "../../lib/ai/types";

interface Props { message: ChatMessage; isStreaming?: boolean; }

export const MessageBubble = memo(function MessageBubble({ message, isStreaming }: Props) {
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

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div style={{ margin: "10px 0", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "6px 14px", background: "#1e1e2e", color: "#a6adc8", fontSize: 12,
      }}>
        <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{language}</span>
        <button
          onClick={copy}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            background: "transparent", border: "none", color: copied ? "#30d158" : "#a6adc8",
            cursor: "pointer", fontSize: 12, padding: "2px 6px", borderRadius: 5,
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{ margin: 0, padding: "14px 16px", fontSize: 13, background: "#282c34", lineHeight: 1.6 }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
