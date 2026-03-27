# Web Assistant - AI Web Assistant Chrome Extension

A Chrome extension (Manifest V3) that provides an AI assistant in a sidebar, enabling direct interaction with web content. Built for developers and avid readers who want AI assistance while browsing technical docs, articles, and more — without leaving the page.

## Features

- **AI Chat** — Stream-based conversation with Markdown rendering, code highlighting, and conversation history
- **Multi-Provider Support** — OpenAI, Claude, MiniMax, OpenRouter, Ollama, and custom endpoints
- **Text Selection Actions** — Floating buttons for Ask AI / Translate / Save Note on selected text
- **AI Translation** — Translate selected text using your configured AI provider
- **In-Page Search** — TreeWalker-based search with highlight and navigation
- **Web Search** — DuckDuckGo integration
- **Bookmarks** — CRUD, search, and one-click save for the current page
- **Notes** — Create, edit, delete, pin notes; clip content from web pages with source links
- **Data Management** — Export/import all data as JSON for backup and cross-device migration
- **Settings** — Per-provider API key, model, base URL, temperature; auto-save
- **Dark Mode** — Automatic via `prefers-color-scheme`
- **i18n** — Chinese and English, defaults to Chinese

## Tech Stack

| Item | Choice |
|------|--------|
| Extension Framework | WXT 0.20 (Manifest V3) |
| UI | React 19 + TypeScript |
| Styling | TailwindCSS 4 + inline styles |
| State Management | Zustand |
| Build | Vite (via WXT) |
| Testing | Playwright |
| Icons | lucide-react |
| Markdown | react-markdown + remark-gfm + react-syntax-highlighter |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Install Dependencies

```bash
npm install
```

### Development

```bash
npm run dev
```

This starts WXT in dev mode with hot reload. Load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3` directory

### Production Build

```bash
npm run build
```

Output is in `.output/chrome-mv3/`. Load it the same way as above.

### Run Tests

```bash
npx playwright test
```

> Note: Playwright tests require non-headless mode to load Chrome extensions.

## Usage

1. Click the extension icon in Chrome toolbar to open the sidebar
2. Go to **Settings** tab to configure your AI provider (API key, model, etc.)
3. Start chatting in the **Chat** tab, or select text on any page to use floating action buttons
4. Use **Bookmarks** and **Notes** tabs to save and organize content
5. Use **Data Management** in Settings to export/import your data

## Project Structure

```
web-assistant/
├── entrypoints/           # WXT entry points (auto-mapped to manifest)
│   ├── background/        # Service Worker (AI gateway, message routing)
│   ├── sidepanel/         # Sidebar React App (5-tab layout)
│   ├── content/           # Content script (text selection, floating buttons, search)
│   └── translator.content/# Translation content script
├── components/            # React components (chat, search, bookmarks, notes, settings)
├── lib/                   # Core logic
│   ├── ai/                # AI provider adapters (OpenAI, Anthropic, registry)
│   ├── storage/           # chrome.storage.local CRUD modules
│   └── utils/             # i18n, messaging
├── stores/                # Zustand stores
├── hooks/                 # React hooks
├── locales/               # zh-CN.json, en.json
├── public/                # Static assets (icons)
└── tests/                 # Playwright tests
```

## License

ISC
