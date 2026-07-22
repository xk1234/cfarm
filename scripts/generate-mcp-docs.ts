import fs from "node:fs"
import path from "node:path"

import { LUMENCLIP_MCP_TOOL_NAMES } from "@/lib/mcp/tool-registry"

const start = "<!-- BEGIN:callable-tools -->"
const end = "<!-- END:callable-tools -->"
const readmePath = path.join(process.cwd(), "mcp", "README.md")
const current = fs.readFileSync(readmePath, "utf8")
const generated = [
  start,
  ...LUMENCLIP_MCP_TOOL_NAMES.map((name) => `- \`${name}\``),
  end,
].join("\n")
const pattern = new RegExp(`${start}[\\s\\S]*?${end}`)
if (!pattern.test(current)) {
  throw new Error(`Missing generated tool markers in ${readmePath}`)
}
const next = current.replace(pattern, generated)
if (process.argv.includes("--check")) {
  if (next !== current) {
    throw new Error("mcp/README.md callable tools are stale; run pnpm mcp:docs")
  }
} else if (next !== current) {
  fs.writeFileSync(readmePath, next)
}
