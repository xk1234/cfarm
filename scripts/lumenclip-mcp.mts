import path from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { parseEnv } from "node:util"

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cloud = readEnv(path.join(root, ".env"))
const local = readEnv(path.join(root, ".env.local"))
Object.assign(process.env, cloud, local)

const ownerId = resolveOwnerId()

const { createLumenClipMcpServer } = await import("../lib/mcp/lumenclip-server")
const { getDisabledMcpToolNames } = await import("../lib/mcp/tool-access")
const server = createLumenClipMcpServer(
  ownerId,
  {},
  {
    disabledToolNames: await getDisabledMcpToolNames(ownerId),
  }
)
await server.connect(new StdioServerTransport())

function readEnv(file: string) {
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {}
}

function resolveOwnerId() {
  const explicit = process.env.LUMENCLIP_MCP_OWNER_ID?.trim()
  if (explicit) return explicit

  const systemOwner = process.env.LUMENCLIP_SYSTEM_OWNER_ID?.trim()
  if (systemOwner) return systemOwner
  throw new Error("LUMENCLIP_MCP_OWNER_ID is required")
}
