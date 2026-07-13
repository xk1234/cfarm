// Shared OpenRouter chat-completions client (audit V5). Centralizes the
// endpoint, auth header, request/response plumbing that was inlined across
// several route handlers. Each caller supplies its model/messages/format and
// optional extra headers, and reads what it needs from `payload`.
import { clean } from "@/lib/guards"

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
}): Promise<OpenRouterChatResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      ...input.headers,
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
    }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 60_000),
  })
  const payload = (await response
    .json()
    .catch(() => ({}))) as OpenRouterChatPayload
  return { ok: response.ok, status: response.status, payload }
}
