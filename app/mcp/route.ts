import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { getCurrentUser } from "@/lib/auth"
import { createLumenClipMcpServer } from "@/lib/mcp/lumenclip-server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handle(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 })
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  const server = createLumenClipMcpServer(user.$id)
  await server.connect(transport)
  return transport.handleRequest(request)
}

export const GET = handle
export const POST = handle
export const DELETE = handle
