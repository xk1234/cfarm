// Shared OpenRouter chat-completions client (audit V5). Centralizes the
// endpoint, auth header, request/response plumbing that was inlined across
// several route handlers. Each caller supplies its model/messages/format and
// optional extra headers, and reads what it needs from `payload`.
import { clean, isRecord } from "@/lib/guards"

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions"

export type OpenRouterChatPayload = {
  choices?: { message?: { content?: unknown } }[]
  error?: { message?: string }
}

export type OpenRouterChatResult = {
  ok: boolean
  status: number
  payload: OpenRouterChatPayload
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
  let response: Response
  try {
    response = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        ...input.headers,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        ...(input.responseFormat
          ? { response_format: input.responseFormat }
          : {}),
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        ...(typeof input.temperature === "number"
          ? { temperature: input.temperature }
          : {}),
        ...(input.plugins ? { plugins: input.plugins } : {}),
      }),
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
      ? { type: "json_schema", json_schema: input.schema }
      : { type: "json_object" },
    timeoutMs: input.timeoutMs,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    plugins: input.plugins,
  })
  if (!result.ok) {
    throw new OpenRouterRequestError({
      message:
        result.payload.error?.message || `OpenRouter failed (${result.status})`,
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
