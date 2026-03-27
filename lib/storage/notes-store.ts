export interface Note {
  id: string;
  content: string;
  source?: {
    url: string;
    title: string;
    selectedText: string;
    clippedAt: number;
  };
  tags: string[];
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
}

const NOTES_KEY = "wa_notes";

export async function getNotes(): Promise<Note[]> {
  const result = await chrome.storage.local.get(NOTES_KEY);
  return result[NOTES_KEY] || [];
}

export async function addNote(note: Omit<Note, "id" | "createdAt" | "updatedAt">): Promise<Note> {
  const now = Date.now();
  const newNote: Note = {
    ...note,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const notes = await getNotes();
  notes.unshift(newNote);
  await chrome.storage.local.set({ [NOTES_KEY]: notes });
  return newNote;
}

export async function updateNote(id: string, updates: Partial<Note>): Promise<void> {
  const notes = await getNotes();
  const index = notes.findIndex((n) => n.id === id);
  if (index >= 0) {
    notes[index] = { ...notes[index], ...updates, updatedAt: Date.now() };
    await chrome.storage.local.set({ [NOTES_KEY]: notes });
  }
}

export async function deleteNote(id: string): Promise<void> {
  const notes = await getNotes();
  await chrome.storage.local.set({
    [NOTES_KEY]: notes.filter((n) => n.id !== id),
  });
}
