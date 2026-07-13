import { defineConfig, devices } from "@playwright/test"

// Mocked mode (default) starts `next dev` and stubs /api/* per spec.
// Live mode (E2E_MODE=live) assumes a server is already running against a real
// backend + providers.
const LIVE = process.env.E2E_MODE === "live"
const PORT = Number(process.env.E2E_PORT ?? 3000)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./e2e",
  // Next dev compiles views on demand. Serial journeys avoid four workers
  // fighting the same Turbopack process during the initial compilation.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: LIVE
    ? undefined
    : {
        command: `pnpm dev --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
