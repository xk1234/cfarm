import {
  propagateAttributes,
  startActiveObservation,
  type LangfuseGenerationAttributes,
} from "@langfuse/tracing"

import { LANGFUSE_APP_NAME } from "@/lib/langfuse-config"

export type LangfuseTraceContext = {
  feature: string
  userId?: string
  sessionId?: string
  prompt?: LangfuseGenerationAttributes["prompt"]
  metadata?: Record<string, string | number | boolean>
  fetchImpl?: typeof fetch
}

export type OpenRouterTraceContext = Omit<
  LangfuseTraceContext,
  "feature" | "fetchImpl"
> & {
  feature?: string
}

export async function tracedOpenRouterFetch(
  name: string,
  url: string | URL | Request,
  init: RequestInit,
  context: LangfuseTraceContext
) {
  const requestBody = parseBody(init.body)
  const tracedInit = requestBody
    ? {
        ...init,
        body: JSON.stringify({
          ...requestBody,
          usage: { include: true },
        }),
      }
    : init

  return propagateAttributes(
    {
      traceName: name,
      userId: context.userId,
      sessionId: context.sessionId,
      tags: [`app:${LANGFUSE_APP_NAME}`, `feature:${context.feature}`],
      metadata: stringMetadata({
        app: LANGFUSE_APP_NAME,
        provider: "openrouter",
        ...context.metadata,
      }),
    },
    () =>
      startActiveObservation(
        name,
        async (generation) => {
          generation.update({
            model: stringValue(requestBody?.model),
            modelParameters: modelParameters(requestBody),
            prompt: context.prompt,
            input: sanitizeTraceValue(
              requestBody?.messages ?? requestBody?.input_audio
            ),
          })
          try {
            const response = await (context.fetchImpl ?? fetch)(url, tracedInit)
            const payload = await response
              .clone()
              .json()
              .catch(() => null)
            const usage = recordValue(recordValue(payload)?.usage)
            generation.update({
              output: sanitizeTraceValue(completionOutput(payload)),
              usageDetails: usageDetails(usage),
              costDetails: costDetails(usage),
              metadata: {
                httpStatus: response.status,
                responseId: stringValue(recordValue(payload)?.id) ?? "",
              },
              ...(response.ok
                ? {}
                : {
                    level: "ERROR" as const,
                    statusMessage: providerError(payload, response.status),
                  }),
            })
            return response
          } catch (error) {
            generation.update({
              level: "ERROR",
              statusMessage: safeErrorMessage(error),
            })
            throw error
          }
        },
        { asType: "generation" }
      )
  )
}

export function openRouterOperationName(
  body: BodyInit | null | undefined,
  fallback = "generate-content"
) {
  const parsed = parseBody(body)
  const responseFormat = recordValue(parsed?.response_format)
  const jsonSchema = recordValue(responseFormat?.json_schema)
  const schemaName = stringValue(jsonSchema?.name)
  if (!schemaName) return fallback
  const normalized = schemaName
    .replaceAll(/[^a-z0-9]+/gi, "-")
    .replaceAll(/^-|-$/g, "")
    .toLowerCase()
  return normalized ? `generate-${normalized}` : fallback
}

function parseBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") return null
  try {
    return recordValue(JSON.parse(body))
  } catch {
    return null
  }
}

function modelParameters(body: Record<string, unknown> | null) {
  if (!body) return undefined
  const values = {
    temperature: numberValue(body.temperature),
    maxTokens: numberValue(body.max_tokens),
  }
  return Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number"
    )
  )
}

function usageDetails(
  usage: Record<string, unknown> | null
): LangfuseGenerationAttributes["usageDetails"] {
  if (!usage) return undefined

  const promptTokens = numberValue(usage.prompt_tokens)
  const completionTokens = numberValue(usage.completion_tokens)
  const totalTokens = numberValue(usage.total_tokens)
  if (
    promptTokens !== undefined &&
    completionTokens !== undefined &&
    totalTokens !== undefined
  ) {
    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      ...numericDetails("prompt_tokens_details", usage.prompt_tokens_details),
      ...numericDetails(
        "completion_tokens_details",
        usage.completion_tokens_details
      ),
    }
  }

  const values = {
    input: numberValue(usage.input_tokens),
    output: numberValue(usage.output_tokens),
    total: totalTokens,
  }
  const details = Object.fromEntries(
    Object.entries(values).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number"
    )
  )
  return Object.keys(details).length ? details : undefined
}

function numericDetails(key: string, value: unknown) {
  const record = recordValue(value)
  if (!record) return {}
  const details = Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1])
    )
  )
  return Object.keys(details).length ? { [key]: details } : {}
}

function costDetails(usage: Record<string, unknown> | null) {
  const totalCost = numberValue(usage?.cost)
  return totalCost === undefined ? undefined : { totalCost }
}

function completionOutput(value: unknown) {
  const record = recordValue(value)
  if (!record) return null
  if (typeof record.text === "string") return record.text
  const choices = Array.isArray(record.choices) ? record.choices : []
  const message = recordValue(recordValue(choices[0])?.message)
  return message ?? recordValue(record.error) ?? null
}

function sanitizeTraceValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]"
  if (typeof value === "string") {
    if (/^data:[^;]+;base64,/i.test(value)) return "[MEDIA OMITTED]"
    return value.length > 20_000
      ? `${value.slice(0, 20_000)}…[TRUNCATED]`
      : value
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTraceValue(item, depth + 1))
  }
  const record = recordValue(value)
  if (!record) return value
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      /^(?:authorization|apiKey|api_key|secret|token|password)$/i.test(key)
        ? "[REDACTED]"
        : /^(?:base64|bytes|data)$/i.test(key) && isLikelyBase64(item)
          ? "[MEDIA OMITTED]"
          : sanitizeTraceValue(item, depth + 1),
    ])
  )
}

function isLikelyBase64(value: unknown) {
  if (typeof value !== "string" || value.length < 256) return false
  const compact = value.replaceAll(/\s/g, "")
  return (
    compact.length >= 256 &&
    compact.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(compact)
  )
}

function stringMetadata(
  metadata: Record<string, string | number | boolean>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      String(value).slice(0, 200),
    ])
  )
}

function providerError(value: unknown, status: number) {
  const error = recordValue(recordValue(value)?.error)
  return redactSensitiveText(
    stringValue(error?.message)?.slice(0, 500) ?? `OpenRouter HTTP ${status}`
  )
}

function safeErrorMessage(error: unknown) {
  return redactSensitiveText(
    (error instanceof Error ? error.message : String(error)).slice(0, 500)
  )
}

function redactSensitiveText(value: string) {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED SECRET]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED EMAIL]")
    .replace(/\b(?:\+?\d[\d .()-]{7,}\d)\b/g, "[REDACTED PHONE]")
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
