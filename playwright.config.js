import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  outputDir: "/tmp/project-sequencer-playwright",
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4197",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node tests/e2e-server.mjs --dev",
    url: "http://127.0.0.1:4197/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
  },
}); 
