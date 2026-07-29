import { defineConfig, defineDocs } from "fumadocs-mdx/config"

export const docs = defineDocs({
  dir: "docs",
  docs: {
    files: [
      "**/*.md",
      "**/*.mdx",
      "!README.md",
      "!ui-audit-2026-07-29/**",
    ],
  },
})

export default defineConfig()
