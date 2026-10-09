import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Renderer tests rasterise real PNGs (canvas/sharp), which can exceed
    // the 5s default on slower machines or under load.
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Forces the in-memory repositories; tests never touch Appwrite Cloud.
    setupFiles: ["./vitest.setup.ts"],
    // Provider smoke tests are opt-in: they use real credentials, cost money,
    // and are not deterministic enough for the local regression suite.
    exclude: [
      "lib/__live__/**",
      "e2e/**",
      "node_modules/**",
      ".next/**",
      "tmp/**",
      ".claude/**",
    ],
    // Route tests install process-wide in-memory repositories
    // (`resetMemoryRepositories`), so files run sequentially.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./test/server-only.ts", import.meta.url)
      ),
    },
  },
})
