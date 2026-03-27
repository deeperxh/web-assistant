export interface Bookmark {
  id: string;
  url: string;
  title: string;
  description?: string;
  favicon?: string;
  tags: string[];
  folderId?: string;
  createdAt: number;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  parentId?: string;
  order: number;
}

const BOOKMARKS_KEY = "wa_bookmarks";
const FOLDERS_KEY = "wa_bookmark_folders";

export async function getBookmarks(): Promise<Bookmark[]> {
  const result = await chrome.storage.local.get(BOOKMARKS_KEY);
  return result[BOOKMARKS_KEY] || [];
}

export async function addBookmark(bookmark: Omit<Bookmark, "id" | "createdAt">): Promise<Bookmark> {
  const newBookmark: Bookmark = {
    ...bookmark,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  const bookmarks = await getBookmarks();
  bookmarks.unshift(newBookmark);
  await chrome.storage.local.set({ [BOOKMARKS_KEY]: bookmarks });
  return newBookmark;
}

export async function removeBookmark(id: string): Promise<void> {
  const bookmarks = await getBookmarks();
  await chrome.storage.local.set({
    [BOOKMARKS_KEY]: bookmarks.filter((b) => b.id !== id),
  });
}

export async function updateBookmark(id: string, updates: Partial<Bookmark>): Promise<void> {
  const bookmarks = await getBookmarks();
  const index = bookmarks.findIndex((b) => b.id === id);
  if (index >= 0) {
    bookmarks[index] = { ...bookmarks[index], ...updates };
    await chrome.storage.local.set({ [BOOKMARKS_KEY]: bookmarks });
  }
}

export async function getBookmarkFolders(): Promise<BookmarkFolder[]> {
  const result = await chrome.storage.local.get(FOLDERS_KEY);
  return result[FOLDERS_KEY] || [];
}

export async function addBookmarkFolder(name: string, parentId?: string): Promise<BookmarkFolder> {
  const folders = await getBookmarkFolders();
  const folder: BookmarkFolder = {
    id: crypto.randomUUID(),
    name,
    parentId,
    order: folders.length,
  };
  folders.push(folder);
  await chrome.storage.local.set({ [FOLDERS_KEY]: folders });
  return folder;
}
