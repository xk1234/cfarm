import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { createLumenClipMcpServer } from "@/lib/mcp/lumenclip-server"
import {
  acquireConcurrencyLease,
  consumeRateLimit,
  releaseConcurrencyLease,
} from "@/lib/request-guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

async function handle(request: Request) {
  const boundedRequest = await readBoundedRequest(request, 2 * 1024 * 1024)
  if (!boundedRequest) {
    return withCors(
      Response.json({ error: "MCP request is too large" }, { status: 413 })
    )
  }
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
  const guard = await guardMcpRequest(boundedRequest)
  if (!guard.allowed) {
    return withCors(
      Response.json(
        { error: guard.message },
        {
          status: 429,
          headers: { "Retry-After": String(guard.retryAfterSeconds ?? 5) },
        }
      )
    )
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  const server = createLumenClipMcpServer(ownerId)
  try {
    await server.connect(transport)
    return withCors(await transport.handleRequest(boundedRequest))
  } finally {
    if (guard.leaseId) {
      await releaseConcurrencyLease(guard.leaseId).catch(() => undefined)
    }
  }
}

async function readBoundedRequest(request: Request, maxBytes: number) {
  if (request.method === "GET" || request.method === "HEAD") return request
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null
  if (!request.body) return request

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  })
}

async function guardMcpRequest(request: Request): Promise<{
  allowed: boolean
  leaseId?: string
  message?: string
  retryAfterSeconds?: number
}> {
  const subject = clientAddress(request)
  const call =
    request.method === "POST" ? await mcpToolCall(request) : { toolName: "" }
  const global = await consumeRateLimit({
    scope: "mcp:all",
    subject,
    limit: positiveInteger(process.env.MCP_REQUESTS_PER_MINUTE, 180),
    windowSeconds: 60,
  })
  if (!global.allowed) {
    return {
      allowed: false,
      message: "MCP request rate limit exceeded",
      retryAfterSeconds: global.retryAfterSeconds,
    }
  }
  if (!call.toolName) return { allowed: true }

  const expensive =
    /(?:generate|pipeline_run|template_run|experiment_run|import_start|batch_start|collect_start)$/.test(
      call.toolName
    )
  const mutation =
    /(?:create|clone|update|upsert|set_enabled|save|add_assets|delete|publish|mark_published|generate|_run|_start|draft|approve|send|select)$/.test(
      call.toolName
    )
  if (mutation) {
    const limited = await consumeRateLimit({
      scope: expensive ? "mcp:expensive" : "mcp:mutation",
      subject,
      limit: expensive
        ? positiveInteger(process.env.MCP_EXPENSIVE_CALLS_PER_MINUTE, 12)
        : positiveInteger(process.env.MCP_MUTATIONS_PER_MINUTE, 30),
      windowSeconds: 60,
    })
    if (!limited.allowed) {
      return {
        allowed: false,
        message: `${expensive ? "Generation" : "Mutation"} rate limit exceeded`,
        retryAfterSeconds: limited.retryAfterSeconds,
      }
    }
  }
  if (!expensive) return { allowed: true }

  const leaseId = await acquireConcurrencyLease({
    scope: "mcp:expensive",
    subject,
    limit: positiveInteger(process.env.MCP_MAX_CONCURRENT_GENERATIONS, 4),
    leaseSeconds: positiveInteger(
      process.env.MCP_GENERATION_LEASE_SECONDS,
      30 * 60
    ),
  })
  return leaseId
    ? { allowed: true, leaseId }
    : {
        allowed: false,
        message: "Too many MCP generations are already running",
        retryAfterSeconds: 5,
      }
}

async function mcpToolCall(request: Request) {
  const payload = await request
    .clone()
    .json()
    .catch(() => null)
  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return { toolName: "" }
  }
  const value = payload as {
    method?: unknown
    params?: { name?: unknown }
  }
  return {
    toolName:
      value.method === "tools/call" && typeof value.params?.name === "string"
        ? value.params.name
        : "",
  }
}

function clientAddress(request: Request) {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  )
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
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
