import { setupAIGateway } from "./ai-gateway";
import { setupMessageHandlers } from "./message-handlers";

export default defineBackground(() => {
  console.log("[Web Assistant] Background service worker started");

  // Open side panel when extension icon is clicked
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  });

  // Set side panel behavior - open on action click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Setup AI chat gateway (port-based streaming)
  setupAIGateway();

  // Setup message handlers for other features
  setupMessageHandlers();
});
