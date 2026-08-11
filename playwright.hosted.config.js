import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-hosted",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  outputDir: "/tmp/project-sequencer-hosted-playwright",
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4207",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "VITE_HOSTED_DEMO=true npx vite --host 127.0.0.1 --port 4207 --strictPort",
    url: "http://127.0.0.1:4207/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
