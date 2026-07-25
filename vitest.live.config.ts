import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["lib/__live__/**/*.live.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Same stub the unit config uses. Without it every live test that
      // reaches a server-only module fails to import, which is why the whole
      // live suite has never run.
      "server-only": fileURLToPath(
        new URL("./test/server-only.ts", import.meta.url)
      ),
    },
  },
})
