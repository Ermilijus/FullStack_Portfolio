import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./Automation",
  timeout: 15_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    viewport: { width: 1920, height: 1080 },
  },
});
