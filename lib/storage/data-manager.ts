const ALL_KEYS = [
  "wa_ai_settings",
  "wa_conversations",
  "wa_active_conversation_id",
  "wa_bookmarks",
  "wa_bookmark_folders",
  "wa_notes",
] as const;

export interface StorageStats {
  conversations: number;
  bookmarks: number;
  notes: number;
  totalBytes: number;
}

export interface ExportData {
  version: 1;
  exportedAt: string;
  data: Record<string, unknown>;
}

export async function getStorageStats(): Promise<StorageStats> {
  const result = await chrome.storage.local.get(ALL_KEYS as unknown as string[]);
  const totalBytes = await chrome.storage.local.getBytesInUse(ALL_KEYS as unknown as string[]);

  return {
    conversations: Array.isArray(result.wa_conversations) ? result.wa_conversations.length : 0,
    bookmarks: Array.isArray(result.wa_bookmarks) ? result.wa_bookmarks.length : 0,
    notes: Array.isArray(result.wa_notes) ? result.wa_notes.length : 0,
    totalBytes,
  };
}

export async function exportAllData(): Promise<void> {
  const result = await chrome.storage.local.get(ALL_KEYS as unknown as string[]);

  const payload: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {},
  };
  for (const key of ALL_KEYS) {
    if (result[key] !== undefined) {
      payload.data[key] = result[key];
    }
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `web-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importAllData(file: File): Promise<StorageStats> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed || parsed.version !== 1 || !parsed.data || typeof parsed.data !== "object") {
    throw new Error("INVALID_FORMAT");
  }

  const toWrite: Record<string, unknown> = {};
  for (const key of ALL_KEYS) {
    if (parsed.data[key] !== undefined) {
      toWrite[key] = parsed.data[key];
    }
  }

  await chrome.storage.local.set(toWrite);

  return {
    conversations: Array.isArray(toWrite.wa_conversations) ? (toWrite.wa_conversations as unknown[]).length : 0,
    bookmarks: Array.isArray(toWrite.wa_bookmarks) ? (toWrite.wa_bookmarks as unknown[]).length : 0,
    notes: Array.isArray(toWrite.wa_notes) ? (toWrite.wa_notes as unknown[]).length : 0,
    totalBytes: await chrome.storage.local.getBytesInUse(ALL_KEYS as unknown as string[]),
  };
}
