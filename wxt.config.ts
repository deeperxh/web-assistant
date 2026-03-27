import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Web Assistant - AI 网页助手",
    description:
      "AI-powered web assistant with translation, chat, bookmarks, and notes",
    version: "1.0.0",
    permissions: ["sidePanel", "activeTab", "storage", "tabs", "contextMenus"],
    host_permissions: [
      "https://api.openai.com/*",
      "https://api.anthropic.com/*",
      "https://openrouter.ai/*",
      "http://localhost:*/*",
      "<all_urls>",
    ],
    icons: {
      16: "icon-16.png",
      32: "icon-32.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
    action: {
      default_title: "Web Assistant",
      default_icon: {
        16: "icon-16.png",
        32: "icon-32.png",
      },
    },
    commands: {
      _execute_action: {
        suggested_key: { default: "Ctrl+Shift+S" },
        description: "Open Web Assistant side panel",
      },
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
