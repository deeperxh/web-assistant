import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "test-report" }],
  ],
  use: {
    headless: false,
    viewport: { width: 420, height: 700 },
    screenshot: "only-on-failure",
  },
});
