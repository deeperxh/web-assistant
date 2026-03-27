# Web Assistant — AI 网页助手 Chrome 扩展

## 项目概述

一个 Chrome 浏览器插件（Manifest V3），以侧边栏形式提供 AI 助手，直接与网页内容交互。目标用户是程序员和阅读爱好者，在浏览技术文档、小说等网页时无需离开页面即可使用 AI。

## 技术栈

| 项目 | 选型 |
|------|------|
| 扩展框架 | **WXT 0.20** (Manifest V3, 文件即入口) |
| UI | **React 19 + TypeScript** |
| 样式 | **TailwindCSS 4** + 内联 style 对象 |
| 状态管理 | **Zustand** |
| 构建 | **Vite** (WXT 内置) |
| 测试 | **Playwright** (加载真实扩展测试) |
| 图标 | `lucide-react` |
| Markdown | `react-markdown` + `remark-gfm` + `react-syntax-highlighter` |

## 功能列表与开发状态

| 功能 | 状态 | 说明 |
|------|------|------|
| 侧边栏 AI Chat | ✅ 完成 | 流式对话、Markdown 渲染、代码高亮、对话历史 |
| 多 AI 服务商 | ✅ 完成 | OpenAI, Claude, MiniMax, OpenRouter, Ollama, 自定义端点 |
| 文本选中浮动按钮 | ✅ 完成 | Ask AI / Translate / Save Note，含 context invalidated 保护 |
| AI 翻译 | ✅ 完成 | 选中文字翻译（复用 AI 服务商）；全页翻译框架已搭建 |
| 页内搜索 | ✅ 完成 | TreeWalker + mark 高亮 + 上下导航 |
| 网络搜索 | ✅ 完成 | DuckDuckGo API |
| 书签管理 | ✅ 完成 | CRUD, 搜索, 当前页一键收藏 |
| 笔记系统 | ✅ 完成 | 创建/编辑/删除/置顶，网页剪藏，来源链接可点击 |
| 设置页 | ✅ 完成 | Provider/Model/API Key/Base URL/Temperature，自动保存，URL 预览 |
| 深色模式 | ✅ 完成 | `prefers-color-scheme` 自动切换 |
| i18n | ✅ 完成 | 中英文，默认中文 |
| Playwright 测试 | ✅ 44/44 通过 | 覆盖所有 Tab、设置、聊天、笔记 CRUD、构建产物、MiniMax API |

### 待开发功能

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 全页翻译 | 中 | DOM walker 已实现，翻译替换逻辑待完善 |
| 悬浮翻译 | 中 | translator.content 脚本框架已搭建 |
| 网页摘要 | 低 | 一键提取页面主内容让 AI 总结 |
| 代码解读 | 低 | 选中代码块时识别语言并解释 |
| 研究模式 | 低 | 跨多网页收集上下文统一分析 |
| 阅读进度 | 低 | 追踪长文阅读位置 |

## 项目结构

```
web-assistant/
├── entrypoints/                   # WXT 入口（自动映射 manifest）
│   ├── background/                # Service Worker
│   │   ├── index.ts               # defineBackground() - 打开侧栏 + AI gateway
│   │   ├── ai-gateway.ts          # Port 流式中继
│   │   └── message-handlers.ts    # 消息路由（翻译/书签/笔记）
│   ├── sidepanel/                 # 侧边栏 React App
│   │   ├── App.tsx                # 5 Tab 布局
│   │   ├── main.tsx               # React root
│   │   ├── style.css              # 全局 CSS 变量 + 组件样式
│   │   └── index.html
│   ├── content/                   # 内容脚本（选文 + 浮动按钮 + 页内搜索）
│   │   └── index.tsx
│   └── translator.content/        # 翻译内容脚本（悬浮 + 全页翻译）
│       └── index.tsx
├── components/                    # React 组件
│   ├── chat/                      # ChatPanel, ChatInput, MessageBubble, ContextBadge
│   ├── search/                    # SearchPanel
│   ├── bookmarks/                 # BookmarksPanel
│   ├── notes/                     # NotesPanel
│   └── settings/                  # SettingsPanel
├── lib/                           # 核心逻辑（非 UI）
│   ├── ai/                        # AI 适配层
│   │   ├── types.ts               # AIProvider 接口
│   │   ├── anthropic-provider.ts  # Anthropic + MiniMax
│   │   ├── openai-provider.ts     # OpenAI + OpenRouter + Ollama + Custom
│   │   ├── provider-registry.ts   # 注册中心
│   │   └── stream-parser.ts       # SSE 解析
│   ├── storage/                   # chrome.storage CRUD
│   │   ├── settings-store.ts
│   │   ├── conversations-store.ts
│   │   ├── bookmarks-store.ts
│   │   └── notes-store.ts
│   └── utils/
│       ├── i18n.ts                # 国际化
│       └── messaging.ts
├── stores/                        # Zustand store
│   └── chat-store.ts
├── hooks/                         # React hooks
│   └── useChat.ts
├── locales/                       # zh-CN.json, en.json
├── public/                        # 静态资源（图标 PNG）
├── tests/
│   └── extension.spec.ts          # Playwright 44 项测试
├── wxt.config.ts                  # WXT 配置 + manifest
├── playwright.config.ts
├── tsconfig.json
└── package.json
```

## 常用命令

```bash
npm run dev          # 开发模式（热重载）
npm run build        # 生产构建 → .output/chrome-mv3/
npx playwright test  # 运行 44 项 Playwright 测试
```

安装到 Chrome: `chrome://extensions` → 开发者模式 → 加载已解压 → 选 `.output/chrome-mv3`

## AI Provider 架构

统一接口 `AIProvider`，通过 `AsyncGenerator<ChatChunk>` 流式输出：
- **OpenAI 兼容**: `openai-provider.ts` — 共用一个类 `OpenAICompatibleProvider`，通过 `defaultBaseUrl` 区分 OpenAI / OpenRouter / Ollama / Custom
- **Anthropic 兼容**: `anthropic-provider.ts` — `AnthropicCompatibleProvider`，支持 MiniMax 等兼容端点
- Background Service Worker 通过 Port (`chrome.runtime.connect`) 中继流式 token 到 Side Panel
- Service Worker keep-alive: 25s 心跳 ping

## 已知注意事项

1. **Extension context invalidated**: 重载扩展后旧标签页的 content script 会报错，已用 `safeSendMessage()` 包装，提示用户刷新页面
2. **MiniMax thinking block**: MiniMax API 会返回 `thinking_delta` 类型的 SSE 事件，代码已正确跳过
3. **Settings 自动保存**: 改完即存，无需手动点保存
4. **CSS 设计风格**: "Soft Dawn" — 暖奶白底 + 苹果蓝 accent，表单 20px 边距
5. **测试**: Playwright 需要非 headless 模式加载扩展，不能用 headless chromium

## 用户的 MiniMax API 配置

- Provider: MiniMax (Anthropic)
- Base URL: `https://api.minimaxi.com/anthropic`
- 实际请求: `https://api.minimaxi.com/anthropic/v1/messages`
- 兼容 Anthropic Messages API 格式
