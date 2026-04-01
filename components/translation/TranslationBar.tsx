import { useState, useEffect, useCallback } from "react";
import { Languages, Undo2, Loader2 } from "lucide-react";
import { t } from "../../lib/utils/i18n";
import { getAISettings } from "../../lib/storage/settings-store";

export function TranslationBar() {
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState(false);
  const [progress, setProgress] = useState<{ translated: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (message: any) => {
      if (message.type === "translate:page-progress") {
        setProgress(message.data);
      } else if (message.type === "translate:page-error") {
        setError(t("translation.translateFailed"));
        setTranslating(false);
        setProgress(null);
      } else if (message.type === "translate:page-done") {
        setTranslating(false);
        setTranslated(true);
        setProgress(null);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // Query content script for translation status when tab changes
  useEffect(() => {
    const checkStatus = async () => {
      setTranslating(false);
      setProgress(null);
      setError(null);
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { setTranslated(false); return; }
        chrome.tabs.sendMessage(tab.id, { type: "translate:check-status" }, (resp) => {
          if (chrome.runtime.lastError || !resp) {
            setTranslated(false);
          } else {
            setTranslated(!!resp.translated);
          }
        });
      } catch {
        setTranslated(false);
      }
    };
    chrome.tabs.onActivated.addListener(checkStatus);
    const onUpdated = (_tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (info.status === "complete") checkStatus();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(checkStatus);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  const handleTranslate = useCallback(async () => {
    setTranslating(true);
    setProgress(null);
    setError(null);

    const settings = await getAISettings();
    const targetLang = settings.translationTargetLang || "zh-CN";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { setTranslating(false); return; }

    const trySend = (tabId: number): Promise<boolean> =>
      new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, {
          type: "translate:page-start",
          data: { targetLang },
        }, () => {
          resolve(!chrome.runtime.lastError);
        });
      });

    let ok = await trySend(tab.id);

    if (!ok) {
      // Content script stale (extension updated) — re-inject and retry
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content-scripts/translator.js"],
        });
        await new Promise((r) => setTimeout(r, 100));
        ok = await trySend(tab.id);
      } catch {
        // executeScript failed (e.g. chrome:// pages)
      }
      if (!ok) {
        setError(t("translation.refreshPage"));
        setTranslating(false);
      }
    }
  }, []);

  const handleRestore = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { type: "translate:page-restore" });
    setTranslated(false);
    setProgress(null);
  }, []);

  if (translated) {
    return (
      <button
        onClick={handleRestore}
        aria-label={t("translation.restorePage")}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 12px", borderRadius: 10,
          border: "1px solid var(--border-default)",
          background: "var(--tint-soft)", color: "var(--tint)",
          fontSize: 12, fontWeight: 600, cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        <Undo2 size={14} />
        {t("translation.restorePage")}
      </button>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={handleTranslate}
        disabled={translating}
        aria-label={t("translation.translatePage")}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 12px", borderRadius: 10,
          border: `1px solid ${error ? "var(--red)" : "var(--border-default)"}`,
          background: "transparent", color: error ? "var(--red)" : "var(--text-body)",
          fontSize: 12, fontWeight: 600, cursor: translating ? "not-allowed" : "pointer",
          opacity: translating ? 0.7 : 1,
          transition: "all 0.15s",
        }}
      >
        {translating ? (
          <>
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            {progress ? `${progress.translated}/${progress.total}` : t("translation.translating")}
          </>
        ) : (
          <>
            <Languages size={14} />
            {error || t("translation.translatePage")}
          </>
        )}
      </button>
    </div>
  );
}
