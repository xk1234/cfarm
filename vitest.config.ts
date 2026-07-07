import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Slideshow tests render real PNG frames and videos via sharp/ffmpeg,
    // which can exceed the 5s default on slower machines or under load.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
})
