import { defineConfig, devices } from "@playwright/test"

// Default mode starts `pnpm dev` on in-memory repositories with the local e2e
// auth seam (lib/e2e-auth.ts): no Clerk, no Appwrite, no network providers.
// Live mode (E2E_MODE=live) assumes a server is already running against a real
// backend + providers.
const LIVE = process.env.E2E_MODE === "live"
const PORT = Number(process.env.E2E_PORT ?? 3917)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./e2e",
  // Next dev compiles views on demand and the memory store is shared by the
  // one server process, so journeys run serially in one worker.
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  globalSetup: LIVE ? undefined : "./e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Video needs Playwright's ffmpeg download; CI installs it.
    video: process.env.CI ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // E2E_BROWSER_CHANNEL=chrome uses the installed Chrome instead of
        // Playwright's downloaded Chromium.
        ...(process.env.E2E_BROWSER_CHANNEL ? { channel: process.env.E2E_BROWSER_CHANNEL } : {}),
      },
    },
  ],
  webServer: LIVE
    ? undefined
    : {
        command: `pnpm dev --port ${PORT}`,
        url: `${baseURL}/api/v1/health`,
        // Only reuse a server on request (E2E_REUSE_SERVER=1); global-setup
        // still refuses any server that is not running the e2e seam.
        reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
        timeout: 180_000,
        env: {
          NODE_ENV: "development",
          LUMENCLIP_DATA_BACKEND: "memory",
          LUMENCLIP_E2E_USER_ID: "user_e2e",
          FILE_URL_SECRET: "e2e-local-file-url-secret",
          BASE_URL: baseURL,
          // No worker process locally: the web server drains queued jobs
          // (batch renders) itself. Never honoured in production.
          LUMENCLIP_INLINE_JOBS: "1",
          NEXT_TELEMETRY_DISABLED: "1",
          // Providers stay unconfigured so the UI shows its offline states.
          SOCIALBU_API_TOKEN: "",
          PEXELS_KEY: "",
          APIFY_KEY: "",
        },
      },
})
