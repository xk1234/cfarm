/**
 * Local stdio MCP server: `LUMENCLIP_API_KEY=lc_… pnpm mcp`.
 * The API key selects the workspace, exactly like the HTTP `/mcp` route.
 */
import path from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cloud = readEnv(path.join(root, ".env"))
const local = readEnv(path.join(root, ".env.local"))
Object.assign(process.env, cloud, local)

const apiKey = process.env.LUMENCLIP_API_KEY?.trim()
if (!apiKey) throw new Error("LUMENCLIP_API_KEY is required (create one in Settings → API keys)")

const { authenticateApiKey } = await import("../lib/api-keys")
const { getRepositories } = await import("../lib/data")
const { createLumenClipMcpServer } = await import("../lib/mcp/lumenclip-server")
const { getDisabledMcpToolNames } = await import("../lib/mcp/tool-access")

const repos = getRepositories()
const principal = await authenticateApiKey(repos, apiKey)
if (!principal) throw new Error("LUMENCLIP_API_KEY is unknown, revoked or expired")

const server = createLumenClipMcpServer(
  principal.workspaceId,
  {},
  {
    apiKeyId: principal.apiKeyId,
    disabledToolNames: await getDisabledMcpToolNames(principal.workspaceId, repos),
  }
)
await server.connect(new StdioServerTransport())

function readEnv(file: string) {
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {}
}
