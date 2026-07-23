import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { createLumenClipMcpServer } from "@/lib/mcp/lumenclip-server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handle(request: Request) {
  const ownerId = mcpOwnerId()
  if (!ownerId) {
    return Response.json(
      {
        error:
          "MCP owner is not configured. Set LUMENCLIP_MCP_OWNER_ID or LUMENCLIP_SYSTEM_OWNER_ID.",
      },
      { status: 503 }
    )
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  const server = createLumenClipMcpServer(ownerId)
  await server.connect(transport)
  return withCors(await transport.handleRequest(request))
}

function mcpOwnerId() {
  return (
    process.env.LUMENCLIP_MCP_OWNER_ID?.trim() ||
    process.env.LUMENCLIP_SYSTEM_OWNER_ID?.trim() ||
    ""
  )
}

export const GET = handle
export const POST = handle
export const DELETE = handle

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  })
}

function withCors(response: Response) {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders())) {
    headers.set(key, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
    "Access-Control-Max-Age": "86400",
  }
}
