import { X, Quote } from "lucide-react";
import type { SelectionContext } from "../../lib/ai/types";
import { t } from "../../lib/utils/i18n";

interface Props { context: SelectionContext; onDismiss: () => void; }

export function ContextBadge({ context, onDismiss }: Props) {
  return (
    <div className="anim-up" style={{ padding: "0 18px 10px" }}>
      <div
        style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          background: "var(--tint-soft)", border: "1px solid var(--tint-glow)",
          borderRadius: 14, padding: "12px 14px",
        }}
      >
        <Quote size={15} style={{ color: "var(--tint)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--tint)", marginBottom: 3 }}>{t("chat.context")}</div>
          <div style={{
            fontSize: 13, lineHeight: 1.5, color: "var(--text-body)",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>
            {context.text.slice(0, 160)}{context.text.length > 160 ? "…" : ""}
          </div>
        </div>
        <button onClick={onDismiss} className="btn-ghost" style={{ padding: 4, color: "var(--tint)" }}>
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
