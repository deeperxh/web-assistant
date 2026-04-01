# Web Assistant — AI Web Assistant Chrome Extension

[中文](#中文) | [English](#english)

---

## 中文

一个 Chrome 浏览器扩展（Manifest V3），以侧边栏形式提供 AI 助手，可直接与网页内容交互。面向开发者和阅读爱好者，浏览技术文档、文章等网页时无需离开页面即可使用 AI。

### 功能特性

- **AI 对话** — 侧边栏流式聊天，支持 Markdown 渲染、代码高亮、对话历史
- **多 AI 服务商** — OpenAI、Claude、MiniMax、OpenRouter、Ollama、自定义端点
- **文本选中操作** — 选中文字后浮动按钮：问 AI / 翻译 / 保存笔记
- **AI 翻译** — 选中文字即时翻译，复用已配置的 AI 服务商
- **Element Picker** — 可视化选取页面元素，生成 AI 友好的提示词
- **页内搜索** — 关键词高亮 + 上下导航
- **网络搜索** — 集成 DuckDuckGo 搜索
- **书签管理** — 增删改查、搜索、当前页一键收藏
- **笔记系统** — 创建 / 编辑 / 删除 / 置顶，网页剪藏，来源链接可点击
- **数据管理** — 导出 / 导入所有数据为 JSON，支持备份和跨设备迁移
- **深色模式** — 跟随系统 `prefers-color-scheme` 自动切换
- **国际化** — 支持中文和英文，默认中文

### 技术栈

| 项目 | 选型 |
|------|------|
| 扩展框架 | WXT 0.20 (Manifest V3) |
| UI | React 19 + TypeScript |
| 样式 | TailwindCSS 4 + 内联样式 |
| 状态管理 | Zustand |
| 构建 | Vite (WXT 内置) |
| 测试 | Playwright |
| 图标 | lucide-react |
| Markdown | react-markdown + remark-gfm + react-syntax-highlighter |

### 快速开始

#### 环境要求

- Node.js 18+
- npm 或 pnpm

#### 安装依赖

```bash
npm install
```

#### 开发模式

```bash
npm run dev
```

启动 WXT 热重载开发模式。将扩展加载到 Chrome：

1. 打开 `chrome://extensions`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `.output/chrome-mv3` 目录

#### 生产构建

```bash
npm run build
```

构建产物位于 `.output/chrome-mv3/`，加载方式同上。

#### 运行测试

```bash
npx playwright test
```

> 注意：Playwright 测试需要非 headless 模式才能加载 Chrome 扩展。

### 使用方法

1. 点击 Chrome 工具栏的扩展图标打开侧边栏
2. 进入「设置」页签配置 AI 服务商（API Key、模型等）
3. 在「对话」页签与 AI 聊天，或在任意网页选中文字使用浮动按钮
4. 使用「书签」和「笔记」页签保存和整理内容
5. 在设置中使用「数据管理」导出 / 导入数据

### 项目结构

```
web-assistant/
├── entrypoints/           # WXT 入口（自动映射 manifest）
│   ├── background/        # Service Worker（AI 网关 + 消息路由）
│   ├── sidepanel/         # 侧边栏 React App（5 Tab 布局）
│   ├── content/           # 内容脚本（选文 + 浮动按钮 + 页内搜索）
│   └── translator.content/# 翻译内容脚本
├── components/            # React 组件（chat / search / bookmarks / notes / settings）
├── lib/                   # 核心逻辑
│   ├── ai/                # AI Provider 适配层（OpenAI / Anthropic / 注册中心）
│   ├── storage/           # chrome.storage CRUD 模块
│   └── utils/             # 工具函数（i18n、消息传递）
├── stores/                # Zustand store
├── hooks/                 # React hooks
├── locales/               # 国际化文件（zh-CN.json / en.json）
├── public/                # 静态资源（图标）
└── tests/                 # Playwright 测试
```

### 许可证

ISC

---

## English

A Chrome extension (Manifest V3) that provides an AI assistant in a sidebar, enabling direct interaction with web content. Built for developers and avid readers who want AI assistance while browsing technical docs, articles, and more — without leaving the page.

### Features

- **AI Chat** — Stream-based conversation with Markdown rendering, code highlighting, and conversation history
- **Multi-Provider Support** — OpenAI, Claude, MiniMax, OpenRouter, Ollama, and custom endpoints
- **Text Selection Actions** — Floating buttons for Ask AI / Translate / Save Note on selected text
- **AI Translation** — Translate selected text using your configured AI provider
- **Element Picker** — Visually select page elements to generate AI-friendly prompts
- **In-Page Search** — Keyword highlighting with prev/next navigation
- **Web Search** — DuckDuckGo integration
- **Bookmarks** — CRUD, search, and one-click save for the current page
- **Notes** — Create, edit, delete, pin notes; clip content from web pages with source links
- **Data Management** — Export/import all data as JSON for backup and cross-device migration
- **Settings** — Per-provider API key, model, base URL, temperature; auto-save
- **Dark Mode** — Automatic via `prefers-color-scheme`
- **i18n** — Chinese and English, defaults to Chinese

### Tech Stack

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

### Getting Started

#### Prerequisites

- Node.js 18+
- npm or pnpm

#### Install Dependencies

```bash
npm install
```

#### Development

```bash
npm run dev
```

This starts WXT in dev mode with hot reload. Load the extension in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `.output/chrome-mv3` directory

#### Production Build

```bash
npm run build
```

Output is in `.output/chrome-mv3/`. Load it the same way as above.

#### Run Tests

```bash
npx playwright test
```

> Note: Playwright tests require non-headless mode to load Chrome extensions.

### Usage

1. Click the extension icon in Chrome toolbar to open the sidebar
2. Go to **Settings** tab to configure your AI provider (API key, model, etc.)
3. Start chatting in the **Chat** tab, or select text on any page to use floating action buttons
4. Use **Bookmarks** and **Notes** tabs to save and organize content
5. Use **Data Management** in Settings to export/import your data

### Project Structure

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

### License

ISC
