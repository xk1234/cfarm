import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Slideshow tests render real PNG frames and videos via sharp/ffmpeg,
    // which can exceed the 5s default on slower machines or under load.
    testTimeout: 60_000,
    // Store-test setup/teardown clears shared cfarm tables row-by-row over
    // the network, which can exceed the 10s default hook timeout.
    hookTimeout: 30_000,
    // Store tests use the same cfarm database as the application.
    setupFiles: ["./vitest.setup.ts"],
    // Provider smoke tests are opt-in: they use real credentials, cost money,
    // and are not deterministic enough for the local regression suite.
    exclude: ["lib/__live__/**", "node_modules/**", ".next/**"],
    // Test files share cfarm tables (the store rewrites whole tables), so
    // files must run sequentially — parallel workers would clobber each other.
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
