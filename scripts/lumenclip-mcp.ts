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
const server = createLumenClipMcpServer(ownerId)
await server.connect(new StdioServerTransport())

function readEnv(file: string) {
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {}
}

function resolveOwnerId() {
  const explicit = process.env.LUMENCLIP_MCP_OWNER_ID?.trim()
  if (explicit) return explicit

  const endpoint = process.env.APPWRITE_ENDPOINT?.trim() || ""
  const localAppwrite =
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(endpoint)
  if (localAppwrite) {
    throw new Error(
      "LUMENCLIP_MCP_OWNER_ID is required for local Appwrite. Set it to the local user id that owns the automation rows; the cloud LUMENCLIP_SYSTEM_OWNER_ID is intentionally not used locally."
    )
  }

  const systemOwner = process.env.LUMENCLIP_SYSTEM_OWNER_ID?.trim()
  if (systemOwner) return systemOwner
  throw new Error("LUMENCLIP_MCP_OWNER_ID is required")
}
