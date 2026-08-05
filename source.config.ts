import { defineConfig, defineDocs } from "fumadocs-mdx/config"

export const docs = defineDocs({
  dir: "docs",
  docs: {
    files: [
      "**/*.md",
      "**/*.mdx",
      "!README.md",
      // Dated audit archives are historical records, not documentation.
      "!ui-audit-2026-07-29/**",
      "!ui-paper-audit-2026-08-01/**",
    ],
  },
})

export default defineConfig()
