import { useState, useEffect, useCallback, useRef } from "react";
import { Check, ChevronDown, Eye, EyeOff, Info, Zap, Loader2, X, AlertCircle, Languages, HardDrive, Download, Upload, MessageSquare, Bookmark, StickyNote } from "lucide-react";
import { providerRegistry } from "../../lib/ai/provider-registry";
import { getAISettings, saveAISettings } from "../../lib/storage/settings-store";
import { getStorageStats, exportAllData, importAllData } from "../../lib/storage/data-manager";
import type { StorageStats } from "../../lib/storage/data-manager";
import type { AISettings, AIModel } from "../../lib/ai/types";
import { t } from "../../lib/utils/i18n";

export function SettingsPanel() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [dataMsg, setDataMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const providers = providerRegistry.getAll();

  useEffect(() => { getAISettings().then(setSettings); }, []);
  useEffect(() => { getStorageStats().then(setStats); }, []);

  const activeProvider = providers.find((p) => p.id === settings?.activeProvider);
  const models: AIModel[] = activeProvider?.models || [];

  const update = useCallback((patch: Partial<AISettings>) => {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAISettings(next).then(() => {
      setSaved(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaved(false), 2000);
    });
  }, [settings]);

  const updateConfig = useCallback((key: "apiKey" | "baseUrl", value: string) => {
    if (!settings) return;
    update({ providers: { ...settings.providers, [settings.activeProvider]: { ...settings.providers[settings.activeProvider], [key]: value } } });
  }, [settings, update]);

  // Test connection
  const handleTestConnection = useCallback(async () => {
    if (!settings) return;
    setTesting(true);
    setTestResult(null);

    const provider = providerRegistry.get(settings.activeProvider);
    if (!provider) {
      setTestResult({ ok: false, msg: t("settings.unknownProvider") });
      setTesting(false);
      return;
    }

    const cfg = settings.providers[settings.activeProvider] || {};
    if (!cfg.apiKey && settings.activeProvider !== "ollama") {
      setTestResult({ ok: false, msg: t("settings.apiKeyRequired") });
      setTesting(false);
      return;
    }

    try {
      let responseText = "";
      const stream = provider.chat(
        {
          model: settings.activeModel,
          messages: [{ role: "user", content: "Say OK" }],
          maxTokens: 30,
          temperature: 0,
        },
        cfg,
      );

      for await (const chunk of stream) {
        if (chunk.type === "text" && chunk.content) {
          responseText += chunk.content;
        }
        if (chunk.type === "error") {
          setTestResult({ ok: false, msg: chunk.error || t("settings.requestFailed") });
          setTesting(false);
          return;
        }
      }

      setTestResult({ ok: true, msg: t("settings.connectionSuccess", { reply: responseText.slice(0, 50) }) });
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : t("settings.requestError") });
    } finally {
      setTesting(false);
    }
  }, [settings]);

  const handleExport = useCallback(async () => {
    try {
      await exportAllData();
      setDataMsg({ ok: true, msg: t("settings.exportSuccess") });
    } catch {
      setDataMsg({ ok: false, msg: t("common.error") });
    }
  }, []);

  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!confirm(t("settings.importConfirm"))) return;

    setImporting(true);
    setDataMsg(null);
    try {
      const result = await importAllData(file);
      setStats(result);
      setDataMsg({
        ok: true,
        msg: t("settings.importSuccess", {
          conversations: String(result.conversations),
          bookmarks: String(result.bookmarks),
          notes: String(result.notes),
        }),
      });
      // Reload settings since they may have been overwritten
      getAISettings().then(setSettings);
    } catch {
      setDataMsg({ ok: false, msg: t("settings.importError") });
    } finally {
      setImporting(false);
    }
  }, []);

  if (!settings) return null;
  const cfg = settings.providers[settings.activeProvider] || {};

  const base = (cfg.baseUrl || (activeProvider as any)?.defaultBaseUrl || "").replace(/\/+$/, "");
  const isAnth = settings.activeProvider === "anthropic" || settings.activeProvider === "minimax-anthropic";
  let computedUrl = "";
  if (base) {
    if (base.endsWith("/v1/messages")) computedUrl = base;
    else if (base.endsWith("/v1")) computedUrl = isAnth ? `${base}/messages` : `${base}/chat/completions`;
    else computedUrl = isAnth ? `${base}/v1/messages` : `${base}/v1/chat/completions`;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="frosted-bar" style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>{t("settings.title")}</span>
        {saved && (
          <span className="saved-badge" role="status" style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "var(--green-soft)", color: "var(--green)",
            fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 8,
          }}>
            <Check size={12} /> {t("settings.saved")}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 22 }}>

          <Field label={t("settings.provider")}>
            <div style={{ position: "relative" }}>
              <select className="field-select" aria-label={t("aria.providerSelect")} value={settings.activeProvider} onChange={(e) => {
                const p = providers.find((x) => x.id === e.target.value);
                update({ activeProvider: e.target.value, activeModel: p?.models[0]?.id || "" });
                setTestResult(null);
              }}>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown size={16} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }} />
            </div>
          </Field>

          <Field label="API Key">
            <div style={{ position: "relative" }}>
              <input
                type={showKey ? "text" : "password"}
                className="field"
                aria-label={t("settings.apiKey")}
                value={cfg.apiKey || ""}
                onChange={(e) => { updateConfig("apiKey", e.target.value); setTestResult(null); }}
                placeholder="sk-..."
                style={{ paddingRight: 44, fontFamily: showKey ? "inherit" : "monospace" }}
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="btn-ghost"
                aria-label={t("aria.toggleKeyVisibility")}
                style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", padding: 6 }}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          <Field label={t("settings.baseUrl")}>
            <input
              type="text" className="field"
              aria-label={t("settings.baseUrl")}
              value={cfg.baseUrl || ""}
              onChange={(e) => { updateConfig("baseUrl", e.target.value); setTestResult(null); }}
              placeholder={activeProvider ? t("settings.defaultUrl", { url: (activeProvider as any).defaultBaseUrl || "" }) : ""}
            />
            {computedUrl && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, wordBreak: "break-all" }}>
                {t("settings.actualUrl")} <span style={{ color: "var(--tint)" }}>{computedUrl}</span>
              </div>
            )}
          </Field>

          <Field label={t("settings.model")}>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                className="field"
                aria-label={t("settings.model")}
                list="model-suggestions"
                value={settings.activeModel}
                onChange={(e) => update({ activeModel: e.target.value })}
                placeholder={t("settings.modelPlaceholder")}
              />
              <datalist id="model-suggestions">
                {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </datalist>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {t("settings.modelHint")}
            </div>
          </Field>

          {/* Test Connection */}
          <div>
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="btn-tint"
              aria-label={t("settings.testConnection")}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: testing ? 0.7 : 1 }}
            >
              {testing ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={16} />}
              {testing ? t("settings.testing") : t("settings.testConnection")}
            </button>
            {testResult && (
              <div className="anim-in" role="alert" style={{
                display: "flex", alignItems: "flex-start", gap: 8, marginTop: 10,
                padding: "10px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.5,
                background: testResult.ok ? "var(--green-soft)" : "var(--red-soft)",
                color: testResult.ok ? "var(--green)" : "var(--red)",
              }}>
                {testResult.ok ? <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
                <span style={{ wordBreak: "break-all" }}>{testResult.msg}</span>
              </div>
            )}
          </div>

          <Field label={t("settings.temperature")}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ flex: 1, position: "relative", height: 8 }}>
                <div style={{ height: "100%", borderRadius: 4, background: "var(--bg-sunken)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, width: `${(settings.temperature / 2) * 100}%`, background: "var(--tint-gradient)", transition: "width 0.15s" }} />
                </div>
                <input type="range" min="0" max="2" step="0.1" value={settings.temperature} onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
                  aria-label={t("aria.temperatureSlider")}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--tint)", background: "var(--tint-soft)", padding: "4px 12px", borderRadius: 8, minWidth: 44, textAlign: "center" }}>
                {settings.temperature.toFixed(1)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginTop: 6, padding: "0 2px" }}>
              <span>{t("settings.tempPrecise")}</span><span>{t("settings.tempBalanced")}</span><span>{t("settings.tempCreative")}</span>
            </div>
          </Field>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />

          {/* Translation Settings */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-strong)" }}>
            <Languages size={16} />
            <span style={{ fontWeight: 600, fontSize: 15 }}>{t("settings.translationSection")}</span>
          </div>

          <Field label={t("settings.translationTarget")}>
            <div style={{ position: "relative" }}>
              <select className="field-select" aria-label={t("aria.translationTarget")} value={settings.translationTargetLang || "zh-CN"} onChange={(e) => update({ translationTargetLang: e.target.value })}>
                <option value="zh-CN">简体中文</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="es">Español</option>
              </select>
              <ChevronDown size={16} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-muted)" }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {t("settings.translationTargetHint")}
            </div>
          </Field>

          {/* Divider */}
          <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />

          {/* Data Management */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-strong)" }}>
            <HardDrive size={16} />
            <span style={{ fontWeight: 600, fontSize: 15 }}>{t("settings.dataSection")}</span>
          </div>

          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {t("settings.dataHint")}
          </div>

          {/* Storage stats */}
          {stats && (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
            }}>
              <StatCard icon={<MessageSquare size={14} />} label={t("settings.conversations")} value={stats.conversations} />
              <StatCard icon={<Bookmark size={14} />} label={t("settings.bookmarksCount")} value={stats.bookmarks} />
              <StatCard icon={<StickyNote size={14} />} label={t("settings.notesCount")} value={stats.notes} />
              <StatCard icon={<HardDrive size={14} />} label={t("settings.storageUsed")} value={formatBytes(stats.totalBytes)} />
            </div>
          )}

          {/* Export / Import buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleExport} className="btn-tint" aria-label={t("settings.exportData")} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Download size={16} />
              {t("settings.exportData")}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "9px 18px", borderRadius: "var(--radius-sm)", fontWeight: 600, fontSize: 14,
                border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-body)",
                cursor: importing ? "wait" : "pointer", opacity: importing ? 0.7 : 1,
              }}
            >
              {importing ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={16} />}
              {t("settings.importData")}
            </button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFile} style={{ display: "none" }} />
          </div>

          {/* Data operation result */}
          {dataMsg && (
            <div className="anim-in" role="alert" style={{
              display: "flex", alignItems: "flex-start", gap: 8,
              padding: "10px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.5,
              background: dataMsg.ok ? "var(--green-soft)" : "var(--red-soft)",
              color: dataMsg.ok ? "var(--green)" : "var(--red)",
            }}>
              {dataMsg.ok ? <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />}
              <span style={{ wordBreak: "break-all" }}>{dataMsg.msg}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)" }}>{label}</label>
      {children}
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, padding: "8px 12px", borderRadius: 10, background: "var(--hint-bg)", color: "var(--hint-text)", fontSize: 13 }}>
      <Info size={14} style={{ flexShrink: 0 }} />
      <span>{text}</span>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px", borderRadius: "var(--radius-sm)",
      background: "var(--bg-sunken)",
    }}>
      <div style={{ color: "var(--text-muted)" }}>{icon}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-strong)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
