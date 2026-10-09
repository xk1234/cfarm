import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { publicOrigin } from "@/lib/http/public-origin"

import {
  authenticateApiKey,
  createDefaultRateLimiter,
  parseBearerToken,
} from "@/lib/api-keys"
import { getRepositories } from "@/lib/data"
import { createLumenClipMcpServer } from "@/lib/mcp/lumenclip-server"
import { getDisabledMcpToolNames } from "@/lib/mcp/tool-access"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const rateLimiter = createDefaultRateLimiter()

/**
 * Streamable HTTP MCP endpoint. Authenticates with a workspace API key
 * (`Authorization: Bearer lc_…`), which selects the workspace.
 */
async function handle(request: Request) {
  const token = parseBearerToken(request.headers.get("authorization"))
  const repos = getRepositories()
  const principal = token ? await authenticateApiKey(repos, token) : null
  if (!principal) {
    return withCors(
      Response.json(
        {
          error:
            "Authentication required: send a workspace API key as a Bearer token.",
        },
        {
          status: 401,
          headers: { "www-authenticate": 'Bearer realm="lumenclip"' },
        }
      )
    )
  }
  const decision = rateLimiter.take(`key:${principal.apiKeyId}`)
  if (!decision.allowed) {
    return withCors(
      Response.json(
        { error: "Rate limit exceeded." },
        {
          status: 429,
          headers: { "retry-after": String(decision.retryAfterSeconds) },
        }
      )
    )
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  const server = createLumenClipMcpServer(
    principal.workspaceId,
    {
      apiBaseUrl: () => `${publicOrigin(request.url, request.headers)}/api/v1`,
    },
    {
      apiKeyId: principal.apiKeyId,
      scopes: principal.scopes,
      disabledToolNames: await getDisabledMcpToolNames(
        principal.workspaceId,
        repos
      ),
    }
  )
  await server.connect(transport)
  return withCors(await transport.handleRequest(request))
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
