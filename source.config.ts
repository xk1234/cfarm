import { defineConfig, defineDocs } from "fumadocs-mdx/config"

export const docs = defineDocs({
  dir: "docs",
  docs: {
    files: ["**/*.md", "**/*.mdx", "!README.md"],
  },
})

export default defineConfig()
