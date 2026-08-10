// Shared OpenRouter chat-completions client (audit V5). Centralizes the
// endpoint, auth header, request/response plumbing that was inlined across
// several route handlers. Each caller supplies its model/messages/format and
// optional extra headers, and reads what it needs from `payload`.
import { clean, isRecord } from "@/lib/guards"
import { recordProviderRequest } from "@/lib/provider-request-trace"

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"

export type OpenRouterChatPayload = {
  choices?: { message?: { content?: unknown } }[]
  error?: { message?: string; metadata?: unknown }
}

export type OpenRouterChatResult = {
  ok: boolean
  status: number
  payload: OpenRouterChatPayload
}

/**
 * Anthropic's structured-output compiler rejects several JSON Schema keywords
 * outright, and any one of them fails the whole request for every provider
 * routed to Anthropic (including via Bedrock):
 *   - `minItems` may only be 0 or 1
 *   - `maxItems` is unsupported
 *   - `minimum` / `maximum` are unsupported on numeric types
 *   - large `enum` arrays can make the compiled schema too complex
 * Strip them at the request boundary so callers can keep expressing intent in
 * the schema, and rely on the prompt plus post-generation validation to enforce
 * the real bounds.
 */
export function sanitizeStructuredSchema<T>(schema: T): T {
  if (Array.isArray(schema)) {
    return schema.map((entry) =>
      sanitizeStructuredSchema(entry)
    ) as unknown as T
  }
  if (!schema || typeof schema !== "object") return schema
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema as object)) {
    if (key === "enum" && Array.isArray(value)) continue
    if (key === "minItems" && typeof value === "number" && value > 1) {
      next[key] = 1
      continue
    }
    if (key === "maxItems" && typeof value === "number") continue
    if ((key === "minimum" || key === "maximum") && typeof value === "number") {
      continue
    }
    next[key] = sanitizeStructuredSchema(value)
  }
  return next as unknown as T
}

export class OpenRouterRequestError extends Error {
  readonly status?: number
  readonly code: "provider_error" | "invalid_json" | "network_error"
  readonly retryable: boolean

  constructor(input: {
    message: string
    status?: number
    code: "provider_error" | "invalid_json" | "network_error"
    retryable: boolean
    cause?: unknown
  }) {
    super(input.message, { cause: input.cause })
    this.name = "OpenRouterRequestError"
    this.status = input.status
    this.code = input.code
    this.retryable = input.retryable
  }
}

export function getOpenRouterApiKey() {
  return clean(process.env.OPENROUTER_API_KEY)
}

export async function openRouterChatCompletion(input: {
  apiKey: string
  model: string
  messages: readonly unknown[]
  responseFormat?: unknown
  headers?: Record<string, string>
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxTokens?: number
  temperature?: number
  plugins?: readonly unknown[]
}): Promise<OpenRouterChatResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const requestBody = {
    model: input.model,
    messages: input.messages,
    ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
    ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
    ...(typeof input.temperature === "number"
      ? { temperature: input.temperature }
      : {}),
    ...(input.plugins ? { plugins: input.plugins } : {}),
  }
  recordProviderRequest({
    provider: "OpenRouter",
    operation: "chat.completions",
    model: input.model,
    request: requestBody,
  })
  let response: Response
  try {
    response = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        ...input.headers,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(input.timeoutMs ?? 60_000),
    })
  } catch (error) {
    throw new OpenRouterRequestError({
      message:
        error instanceof Error && error.name === "TimeoutError"
          ? "The AI provider timed out"
          : "The AI provider could not be reached",
      code: "network_error",
      retryable: true,
      cause: error,
    })
  }
  const payload = (await response
    .json()
    .catch(() => ({}))) as OpenRouterChatPayload
  return { ok: response.ok, status: response.status, payload }
}

export function parseOpenRouterContent(raw: unknown): string {
  if (typeof raw === "string") return raw.trim()

  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (typeof part === "string") return part
        if (isRecord(part) && typeof part.text === "string") return part.text
        return ""
      })
      .join("")
      .trim()
  }

  if (raw && typeof raw === "object") return JSON.stringify(raw)
  if (raw === null) return "null"
  return ""
}

type OpenRouterJsonSchema = {
  name: string
  strict?: boolean
  schema: Record<string, unknown>
}

type OpenRouterJsonInput = {
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
  schema?: OpenRouterJsonSchema
  timeoutMs?: number
  maxTokens?: number
  temperature?: number
  plugins?: readonly unknown[]
} & (
  | { messages: readonly unknown[]; system?: never; user?: never }
  | { messages?: never; system: string; user: string }
)

export async function openRouterJson(
  input: OpenRouterJsonInput
): Promise<Record<string, unknown>> {
  const messages = input.messages ?? [
    { role: "system", content: input.system },
    { role: "user", content: input.user },
  ]
  const result = await openRouterChatCompletion({
    apiKey: input.apiKey,
    model: input.model,
    messages,
    fetchImpl: input.fetchImpl,
    responseFormat: input.schema
      ? {
          type: "json_schema",
          json_schema: sanitizeStructuredSchema(input.schema),
        }
      : { type: "json_object" },
    timeoutMs: input.timeoutMs,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    plugins: input.plugins,
  })
  if (!result.ok) {
    throw new OpenRouterRequestError({
      // OpenRouter's generic "Provider returned error" is undiagnosable on its
      // own; the upstream detail lives in error.metadata. Keep both.
      message: [
        result.payload.error?.message || `OpenRouter failed (${result.status})`,
        `status=${result.status}`,
        result.payload.error?.metadata
          ? `metadata=${JSON.stringify(result.payload.error.metadata).slice(0, 500)}`
          : "",
      ]
        .filter(Boolean)
        .join(" | "),
      status: result.status,
      code: "provider_error",
      retryable:
        result.status === 408 ||
        result.status === 409 ||
        result.status === 425 ||
        result.status === 429 ||
        result.status >= 500,
    })
  }

  try {
    const content = parseOpenRouterContent(
      result.payload.choices?.[0]?.message?.content
    )
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim()
    const objectStart = content.indexOf("{")
    const objectEnd = content.lastIndexOf("}")
    const parsed = JSON.parse(content.slice(objectStart, objectEnd + 1))
    if (isRecord(parsed)) return parsed
  } catch {
    /* repair happens at the caller */
  }

  throw new OpenRouterRequestError({
    message: "The model returned invalid JSON",
    code: "invalid_json",
    retryable: true,
  })
}
