import {
  buildTempSlideStructuredOutputSchema,
  buildTempSlideUserPrompt,
  defaultTempSlideSystemPrompt,
  defaultTempSlideUserInstructions,
  getTempSlidePromptPlaceholders,
  normalizeTempSlideStructuredOutput,
  promptPreviewHook,
  styleRequestsLowercase,
  type TempSlideStructuredOutput,
  type TempSlideTestingAutomation,
} from "@/lib/temp-slide-testing"
import { defaultSlideshowTextModel } from "@/lib/realfarm-generation-model-registry"
import { clean } from "@/lib/guards"
import { fetchJson } from "@/lib/http"

export { defaultSlideshowTextModel }

type OpenRouterResponse = {
  choices?: {
    message?: {
      content?: unknown
    }
  }[]
  error?: {
    message?: string
  }
}

export type SlideshowTextGenerationResult = {
  model: string
  selectedHook: string
  result: TempSlideStructuredOutput
  skippedOpenRouter: boolean
  promptPayload?: ReturnType<typeof slideshowTextGenerationPayload>
}

export async function generateSlideshowText(input: {
  automation: TempSlideTestingAutomation
  model?: string
  systemPrompt?: string
  promptInstructions?: string
  selectedHook?: string
  avoidSimilarOutputs?: string[]
  apiKey?: string
  fetchImpl?: typeof fetch
}): Promise<SlideshowTextGenerationResult> {
  const model = clean(input.model) || defaultSlideshowTextModel
  const selectedHook =
    clean(input.selectedHook) || promptPreviewHook(input.automation)
  const placeholders = getTempSlidePromptPlaceholders(input.automation)

  const apiKey = clean(input.apiKey)
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured")
  }

  const promptPayload = slideshowTextGenerationPayload({
    automation: input.automation,
    model,
    selectedHook,
    systemPrompt: input.systemPrompt,
    promptInstructions: input.promptInstructions,
    avoidSimilarOutputs: input.avoidSimilarOutputs,
  })
  const payload = await fetchJson<OpenRouterResponse>(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(promptPayload),
    },
    {
      fetchImpl: input.fetchImpl,
      timeoutMs: 30_000,
      errorMessage: (_response, payload) =>
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "object" &&
        payload.error !== null &&
        "message" in payload.error &&
        typeof payload.error.message === "string"
          ? payload.error.message
          : "OpenRouter generation failed",
    }
  )

  const output = parseOpenRouterContent(payload.choices?.[0]?.message?.content)
  const lowercase =
    styleRequestsLowercase(input.automation.style) ||
    styleRequestsLowercase(input.systemPrompt) ||
    styleRequestsLowercase(input.promptInstructions)
  return {
    model,
    selectedHook,
    result: normalizeTempSlideStructuredOutput(output, placeholders, {
      lowercase,
    }),
    skippedOpenRouter: false,
    promptPayload,
  }
}

export function slideshowTextGenerationPayload(input: {
  automation: TempSlideTestingAutomation
  model?: string
  selectedHook?: string
  systemPrompt?: string
  promptInstructions?: string
  avoidSimilarOutputs?: string[]
}) {
  const model = clean(input.model) || defaultSlideshowTextModel
  const selectedHook =
    clean(input.selectedHook) || promptPreviewHook(input.automation)
  const placeholders = getTempSlidePromptPlaceholders(input.automation)
  const systemPrompt = clean(input.systemPrompt) || defaultTempSlideSystemPrompt
  const promptInstructions =
    clean(input.promptInstructions) || defaultTempSlideUserInstructions

  return {
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: buildTempSlideUserPrompt({
          automationName: input.automation.name,
          hook: selectedHook,
          tone: input.automation.tone,
          style: input.automation.style,
          promptInstructions,
          placeholders,
          avoidSimilarOutputs: input.avoidSimilarOutputs,
        }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "temp_slide_testing_text",
        strict: true,
        schema: buildTempSlideStructuredOutputSchema(placeholders),
      },
    },
  }
}

function parseOpenRouterContent(content: unknown) {
  if (typeof content === "string") {
    return JSON.parse(content)
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") {
          return part
        }
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text
        }
        return ""
      })
      .join("")
      .trim()
    return JSON.parse(text)
  }

  if (content && typeof content === "object") {
    return content
  }

  throw new Error("OpenRouter returned an empty response")
}
