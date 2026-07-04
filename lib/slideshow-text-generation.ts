import {
  buildTempSlideStructuredOutputSchema,
  buildTempSlideUserPrompt,
  defaultTempSlideSystemPrompt,
  defaultTempSlideUserInstructions,
  getTempSlidePromptPlaceholders,
  normalizeTempSlideStructuredOutput,
  promptPreviewHook,
  type TempSlideStructuredOutput,
  type TempSlideTestingAutomation,
} from "@/lib/temp-slide-testing"

export const defaultSlideshowTextModel = "google/gemini-3.1-flash-lite"

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
}

export async function generateSlideshowText(input: {
  automation: TempSlideTestingAutomation
  model?: string
  systemPrompt?: string
  promptInstructions?: string
  selectedHook?: string
  apiKey?: string
  fetchImpl?: typeof fetch
}): Promise<SlideshowTextGenerationResult> {
  const model = clean(input.model) || defaultSlideshowTextModel
  const selectedHook = clean(input.selectedHook) || promptPreviewHook(input.automation)
  const placeholders = getTempSlidePromptPlaceholders(input.automation)

  if (placeholders.length === 0) {
    return {
      model,
      selectedHook,
      result: { text: {} },
      skippedOpenRouter: true,
    }
  }

  const apiKey = clean(input.apiKey)
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured")
  }

  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(slideshowTextGenerationPayload({
        automation: input.automation,
        model,
        selectedHook,
        systemPrompt: input.systemPrompt,
        promptInstructions: input.promptInstructions,
      })),
    }
  )

  const payload = (await response.json()) as OpenRouterResponse
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenRouter generation failed")
  }

  const output = parseOpenRouterContent(payload.choices?.[0]?.message?.content)
  return {
    model,
    selectedHook,
    result: normalizeTempSlideStructuredOutput(output, placeholders),
    skippedOpenRouter: false,
  }
}

export function slideshowTextGenerationPayload(input: {
  automation: TempSlideTestingAutomation
  model?: string
  selectedHook?: string
  systemPrompt?: string
  promptInstructions?: string
}) {
  const model = clean(input.model) || defaultSlideshowTextModel
  const selectedHook = clean(input.selectedHook) || promptPreviewHook(input.automation)
  const placeholders = getTempSlidePromptPlaceholders(input.automation)
  const systemPrompt = clean(input.systemPrompt) || defaultTempSlideSystemPrompt
  const promptInstructions = clean(input.promptInstructions) || defaultTempSlideUserInstructions

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

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
