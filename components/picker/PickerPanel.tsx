import { useState, useEffect, useCallback } from "react";
import { Crosshair, Copy, Check, RefreshCw, MousePointer2, ClipboardCopy } from "lucide-react";
import { t } from "../../lib/utils/i18n";
import { buildPrompt } from "../../lib/element-picker/prompt-builder";
import type { ElementInfo } from "../../lib/element-picker/types";

export function PickerPanel() {
  const [elementInfo, setElementInfo] = useState<ElementInfo | null>(null);
  const [description, setDescription] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");

  // Listen for element selection via session storage
  useEffect(() => {
    // Check for existing pending element on mount
    chrome.storage.session.get("wa_pending_element", (result) => {
      if (result.wa_pending_element) {
        setElementInfo(result.wa_pending_element);
        chrome.storage.session.remove("wa_pending_element");
      }
    });

    const handler = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.wa_pending_element?.newValue) {
        setElementInfo(changes.wa_pending_element.newValue);
        setPicking(false);
        chrome.storage.session.remove("wa_pending_element");
      }
    };
    chrome.storage.session.onChanged.addListener(handler);
    return () => chrome.storage.session.onChanged.removeListener(handler);
  }, []);

  const handleStartPicker = useCallback(async () => {
    setPicking(true);
    setError("");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      setPicking(false);
      setError(t("picker.noTab"));
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "picker:start" }, () => {
      if (chrome.runtime.lastError) {
        setPicking(false);
        setError(t("picker.refreshHint"));
      }
    });
  }, []);

  const handleCancelPicker = useCallback(async () => {
    setPicking(false);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "picker:cancel" });
  }, []);

  const handleGenerate = useCallback(() => {
    if (!elementInfo) return;
    const prompt = buildPrompt(elementInfo, description);
    setGeneratedPrompt(prompt);
  }, [elementInfo, description]);

  const handleCopy = useCallback(async () => {
    if (!generatedPrompt) return;
    await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedPrompt]);

  const handleReset = useCallback(async () => {
    setElementInfo(null);
    setDescription("");
    setGeneratedPrompt("");
    setCopied(false);
    handleStartPicker();
  }, [handleStartPicker]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div className="frosted-bar" style={{ padding: "14px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{t("picker.title")}</span>
        {!elementInfo ? (
          <button
            onClick={picking ? handleCancelPicker : handleStartPicker}
            className="btn-tint"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 10, border: "none",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: picking ? "var(--red-soft)" : "var(--tint)",
              color: picking ? "var(--red)" : "#fff",
              transition: "all 0.15s",
            }}
          >
            <Crosshair size={14} />
            {picking ? t("picker.picking") : t("picker.start")}
          </button>
        ) : (
          <button
            onClick={handleReset}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 10,
              border: "1px solid var(--border-default)",
              background: "transparent", color: "var(--text-body)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <RefreshCw size={13} />
            {t("picker.repick")}
          </button>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {!elementInfo ? (
          /* Empty state */
          <div className="anim-in" style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "60px 24px", gap: 14, textAlign: "center",
          }}>
            <div style={{ padding: 18, borderRadius: 20, background: "var(--tint-soft)" }}>
              <MousePointer2 size={32} style={{ color: "var(--tint)" }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-body)" }}>
              {t("picker.empty")}
            </span>
            <span style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {t("picker.emptyHint")}
            </span>
            {error && (
              <div style={{
                marginTop: 8, padding: "8px 14px", borderRadius: 10,
                background: "var(--red-soft)", color: "var(--red)",
                fontSize: 13, fontWeight: 500,
              }}>
                {error}
              </div>
            )}
          </div>
        ) : (
          /* Element info + prompt generation */
          <div className="anim-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Tag info */}
            <InfoCard label={t("picker.tag")}>
              <code style={codeStyle}>
                {"<"}{elementInfo.tagName}
                {elementInfo.id && <span style={{ color: "var(--tint)" }}>{` id="${elementInfo.id}"`}</span>}
                {elementInfo.classes.length > 0 && <span style={{ color: "var(--green)" }}>{` class="${elementInfo.classes.join(" ")}"`}</span>}
                {">"}
              </code>
            </InfoCard>

            {/* Selector */}
            <InfoCard label={t("picker.selector")} copyable value={elementInfo.selector}>
              <code style={codeStyle}>{elementInfo.selector}</code>
            </InfoCard>

            {/* XPath */}
            <InfoCard label={t("picker.xpath")} copyable value={elementInfo.xpath}>
              <code style={{ ...codeStyle, fontSize: 11 }}>{elementInfo.xpath}</code>
            </InfoCard>

            {/* Parent chain */}
            <InfoCard label={t("picker.parentChain")}>
              <code style={{ ...codeStyle, fontSize: 11 }}>{elementInfo.parentChain}</code>
            </InfoCard>

            {/* Dimensions */}
            <InfoCard label={t("picker.dimensions")}>
              <span style={{ fontSize: 13, color: "var(--text-strong)", fontWeight: 500 }}>
                {elementInfo.boundingBox.width} x {elementInfo.boundingBox.height}px
              </span>
            </InfoCard>

            {/* Text content */}
            {elementInfo.textContent && (
              <InfoCard label={t("picker.content")}>
                <span style={{ fontSize: 13, color: "var(--text-body)", fontStyle: "italic" }}>
                  "{elementInfo.textContent}"
                </span>
              </InfoCard>
            )}

            {/* Computed styles */}
            <InfoCard label={t("picker.styles")}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
                {Object.entries(elementInfo.styles)
                  .filter(([, v]) => v && v !== "none" && v !== "normal" && v !== "0px" && v !== "auto" && v !== "rgba(0, 0, 0, 0)")
                  .map(([k, v]) => (
                    <div key={k} style={{ fontSize: 12, color: "var(--text-body)" }}>
                      <span style={{ color: "var(--text-muted)" }}>{camelToKebab(k)}: </span>
                      <span style={{ fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
              </div>
            </InfoCard>

            {/* Siblings */}
            {elementInfo.siblings.length > 0 && (
              <InfoCard label={t("picker.siblings")}>
                {elementInfo.siblings.map((s, i) => (
                  <div key={i} style={{ fontSize: 12, color: "var(--text-body)" }}>
                    <span style={{ color: "var(--text-muted)" }}>{s.position === "before" ? "Prev" : "Next"}: </span>
                    <code style={{ fontSize: 11 }}>{"<"}{s.tagName}{">"}</code>
                    {s.textContent && <span style={{ fontStyle: "italic" }}> "{s.textContent}"</span>}
                  </div>
                ))}
              </InfoCard>
            )}

            {/* User description */}
            <div style={{ marginTop: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)", display: "block", marginBottom: 6 }}>
                {t("picker.descriptionLabel")}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("picker.description")}
                rows={3}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 12,
                  border: "1px solid var(--border-default)", background: "var(--bg-surface)",
                  color: "var(--text-strong)", fontSize: 14, lineHeight: 1.5,
                  resize: "vertical", outline: "none", boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "11px 0", borderRadius: 12, border: "none",
                background: "var(--tint)", color: "#fff",
                fontSize: 14, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <ClipboardCopy size={15} />
              {t("picker.generate")}
            </button>

            {/* Generated prompt */}
            {generatedPrompt && (
              <div className="anim-in" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <pre style={{
                  padding: "14px 16px", borderRadius: 12,
                  background: "var(--bg-sunken)", border: "1px solid var(--border-subtle)",
                  fontSize: 12, lineHeight: 1.6, color: "var(--text-body)",
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  maxHeight: 300, overflowY: "auto",
                  fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
                  margin: 0,
                }}>
                  {generatedPrompt}
                </pre>
                <button
                  onClick={handleCopy}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    width: "100%", padding: "10px 0", borderRadius: 12,
                    border: "1px solid var(--border-default)",
                    background: copied ? "var(--green-soft)" : "var(--bg-surface)",
                    color: copied ? "var(--green)" : "var(--text-body)",
                    fontSize: 13, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? t("picker.copied") : t("picker.copy")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* Info card sub-component */
function InfoCard({ label, children, copyable, value }: {
  label: string;
  children: React.ReactNode;
  copyable?: boolean;
  value?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="tile" style={{ padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {label}
        </span>
        {copyable && value && (
          <button
            onClick={handleCopy}
            className="btn-ghost"
            style={{ padding: 3 }}
          >
            {copied ? <Check size={12} style={{ color: "var(--green)" }} /> : <Copy size={12} />}
          </button>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>{children}</div>
    </div>
  );
}

function camelToKebab(str: string): string {
  return str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

const codeStyle: React.CSSProperties = {
  fontSize: 12,
  fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
  color: "var(--text-strong)",
  wordBreak: "break-all",
};
