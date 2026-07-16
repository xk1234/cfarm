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
import {
  defaultSlideshowTextModel,
  openRouterModelForUseCase,
} from "@/lib/realfarm-generation-model-registry"
import { clean } from "@/lib/guards"
import { fetchJson } from "@/lib/http"
import { llmSlopMatches } from "@/lib/llm-slop"
import { parseOpenRouterContent } from "@/lib/openrouter"

export { defaultSlideshowTextModel }

type OpenRouterResponse = {
  choices?: {
    finish_reason?: string | null
    native_finish_reason?: string | null
    error?: {
      message?: string
    }
    message?: {
      content?: unknown
      annotations?: unknown[]
    }
  }[]
  error?: {
    message?: string
    metadata?: {
      provider_name?: string
      raw?: unknown
    }
  }
  usage?: {
    server_tool_use?: {
      web_search_requests?: number
    }
  }
}

export type SlideshowTextGenerationResult = {
  model: string
  selectedHook: string
  result: TempSlideStructuredOutput
  skippedOpenRouter: boolean
  promptPayload?: ReturnType<typeof slideshowTextGenerationPayload>
  webSearchSources?: SlideshowWebSearchSource[]
}

export type SlideshowWebSearchSource = {
  url: string
  title?: string
  content?: string
}

export async function generateSlideshowText(input: {
  automation: TempSlideTestingAutomation
  model?: string
  systemPrompt?: string
  promptInstructions?: string
  selectedHook?: string
  avoidSimilarOutputs?: string[]
  performanceMemory?: {
    provenPatterns: string[]
    avoidPatterns: string[]
  }
  webSearchEnabled?: boolean
  requireHookSubjectCoverage?: boolean
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

  const research = input.webSearchEnabled
    ? await researchSelectedHook({
        apiKey,
        fetchImpl: input.fetchImpl,
        model: openRouterModelForUseCase("webResearch"),
        hook: selectedHook,
        automationName: input.automation.name,
      })
    : null
  const promptPayload = slideshowTextGenerationPayload({
    automation: input.automation,
    model,
    selectedHook,
    systemPrompt: input.systemPrompt,
    promptInstructions: [
      input.promptInstructions,
      research
        ? `Exact-hook web research:\n${research.content}\n\nUse these sources only for claims that directly answer the selected hook. Do not replace the hook with generic facts from the broader niche.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    avoidSimilarOutputs: input.avoidSimilarOutputs,
    performanceMemory: input.performanceMemory,
  })
  const completion = await requestStructuredOutput({
    apiKey,
    fetchImpl: input.fetchImpl,
    model,
    promptPayload,
    placeholders,
    selectedHook,
    requireHookSubjectCoverage:
      input.requireHookSubjectCoverage ??
      selectedHook !== "Create a high-performing TikTok slideshow.",
  })
  const lowercase =
    styleRequestsLowercase(input.automation.style) ||
    styleRequestsLowercase(input.systemPrompt) ||
    styleRequestsLowercase(input.promptInstructions)
  return {
    model: completion.model,
    selectedHook,
    result: normalizeTempSlideStructuredOutput(
      completion.output,
      placeholders,
      {
        lowercase,
      }
    ),
    skippedOpenRouter: false,
    promptPayload,
    webSearchSources: research?.sources ?? [],
  }
}

async function requestStructuredOutput(input: {
  apiKey: string
  fetchImpl?: typeof fetch
  model: string
  promptPayload: ReturnType<typeof slideshowTextGenerationPayload>
  placeholders: ReturnType<typeof getTempSlidePromptPlaceholders>
  selectedHook: string
  requireHookSubjectCoverage?: boolean
}) {
  let lastError: unknown
  let repairError: unknown

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const attemptModel = input.model
    const attemptPayload = repairError
      ? promptPayloadWithRepairFeedback(input.promptPayload, repairError)
      : input.promptPayload
    const routedPayload = { ...attemptPayload, model: attemptModel }
    let payload: OpenRouterResponse
    try {
      payload = await fetchJson<OpenRouterResponse>(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(routedPayload),
        },
        {
          fetchImpl: input.fetchImpl,
          // Reasoning-heavy models routinely take 30-90s to emit the full
          // structured slideshow JSON; generation runs in the background, so a
          // generous timeout beats failing the run.
          timeoutMs: 120_000,
          errorMessage: (response, payload) => {
            const providerError =
              typeof payload === "object" &&
              payload !== null &&
              "error" in payload &&
              typeof payload.error === "object" &&
              payload.error !== null
                ? payload.error
                : null
            const providerMessage =
              providerError &&
              "message" in providerError &&
              typeof providerError.message === "string"
                ? providerError.message
                : "Provider returned no error details"
            const providerMetadata = openRouterProviderMetadata(providerError)
            return `OpenRouter generation failed (${response.status}): ${providerMessage}${
              providerMetadata ? ` [${providerMetadata}]` : ""
            }`
          },
        }
      )
    } catch (error) {
      lastError = error
      if (attempt < 2) {
        console.warn("OpenRouter slideshow request failed; retrying", {
          attempt,
          model: attemptModel,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      continue
    }

    const choice = payload.choices?.[0]
    try {
      assertCompleteStructuredChoice(choice)
      const output = JSON.parse(
        parseOpenRouterContent(choice?.message?.content)
      )
      const validationErrors = structuredOutputValidationErrors(
        output,
        input.placeholders,
        input.selectedHook
      )
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join("; "))
      }
      const webSearchSources = parseWebSearchSources(
        choice?.message?.annotations
      )
      if (
        input.requireHookSubjectCoverage &&
        !outputDevelopsHookSubject(output, input.selectedHook)
      ) {
        throw new Error(
          `Generated body text does not develop the selected hook subject: ${input.selectedHook}`
        )
      }
      return { output, webSearchSources, model: attemptModel }
    } catch (error) {
      lastError = error
      repairError = error
      if (attempt < 2) {
        console.warn(
          "OpenRouter returned invalid structured slideshow text; retrying",
          {
            attempt,
            model: attemptModel,
            finishReason: choice?.finish_reason ?? null,
            nativeFinishReason: choice?.native_finish_reason ?? null,
            error: error instanceof Error ? error.message : String(error),
          }
        )
      }
    }
  }

  throw new Error(
    `OpenRouter did not return complete structured slideshow text after 2 attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}

function promptPayloadWithRepairFeedback(
  payload: ReturnType<typeof slideshowTextGenerationPayload>,
  error: unknown
): ReturnType<typeof slideshowTextGenerationPayload> {
  const feedback = error instanceof Error ? error.message : String(error)
  return {
    ...payload,
    messages: [
      ...payload.messages,
      {
        role: "user",
        content: `The previous JSON was invalid. Correct only the reported problems and return the complete JSON object again.\nValidation errors:\n- ${feedback.replaceAll(
          "; ",
          "\n- "
        )}`,
      },
    ],
  }
}

function openRouterProviderMetadata(error: unknown) {
  if (!error || typeof error !== "object" || !("metadata" in error)) return ""
  const metadata = error.metadata
  if (!metadata || typeof metadata !== "object") return ""
  const provider =
    "provider_name" in metadata && typeof metadata.provider_name === "string"
      ? clean(metadata.provider_name)
      : ""
  const raw =
    "raw" in metadata
      ? clean(
          typeof metadata.raw === "string"
            ? metadata.raw
            : JSON.stringify(metadata.raw)
        ).slice(0, 500)
      : ""
  return [provider, raw].filter(Boolean).join(": ")
}

function structuredOutputValidationErrors(
  output: unknown,
  placeholders: ReturnType<typeof getTempSlidePromptPlaceholders>,
  selectedHook?: string
) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return ["output must be a JSON object"]
  }
  const record = output as Record<string, unknown>
  const errors: string[] = []
  const title = typeof record.title === "string" ? record.title.trim() : ""
  const caption =
    typeof record.caption === "string" ? record.caption.trim() : ""
  if (!title) errors.push("title must not be empty")
  if (!caption) errors.push("caption must not be empty")

  const text =
    record.text &&
    typeof record.text === "object" &&
    !Array.isArray(record.text)
      ? (record.text as Record<string, unknown>)
      : {}
  const generatedValues: string[] = [title, caption]
  for (const placeholder of placeholders) {
    const rawValue = text[placeholder.id]
    const value = typeof rawValue === "string" ? rawValue.trim() : ""
    if (!value) {
      errors.push(`${placeholder.id} must not be empty`)
      continue
    }
    generatedValues.push(value)
  }
  // Slop terms echoed from the user-authored hook are exempt — the model must
  // develop the hook subject and cannot avoid its wording.
  const hookLower = (selectedHook ?? "").toLowerCase()
  for (const match of llmSlopMatches(generatedValues.join("\n"))) {
    if (hookLower && hookLower.includes(match.toLowerCase())) continue
    errors.push(
      `banned AI-tell wording: "${match}" — rewrite that line in plain human language`
    )
  }
  return errors
}

async function researchSelectedHook(input: {
  apiKey: string
  fetchImpl?: typeof fetch
  model: string
  hook: string
  automationName: string
}) {
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const payload = await fetchJson<OpenRouterResponse>(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: input.model,
            stream: false,
            max_tokens: 2_000,
            plugins: [{ id: "web", engine: "exa", max_results: 5 }],
            messages: [
              {
                role: "system",
                content:
                  "Research the exact slideshow hook using current authoritative sources. Return concise facts that directly answer the hook. Cite every fact with a full source URL. Do not substitute generic facts about the broader niche.",
              },
              {
                role: "user",
                content: `Automation: ${input.automationName}\nExact hook: ${input.hook}`,
              },
            ],
          }),
        },
        {
          fetchImpl: input.fetchImpl,
          timeoutMs: 90_000,
          errorMessage: () => "OpenRouter hook research failed",
        }
      )
      const choice = payload.choices?.[0]
      assertCompleteStructuredChoice(choice)
      const content =
        typeof choice?.message?.content === "string"
          ? choice.message.content.trim()
          : ""
      const sources = [
        ...parseLinkedSources(content),
        ...parseWebSearchSources(choice?.message?.annotations),
      ]
      const uniqueSources = [
        ...new Map(sources.map((source) => [source.url, source])).values(),
      ]
      if (!content || uniqueSources.length === 0) {
        throw new Error(
          "Web research returned without content and cited sources."
        )
      }
      return { content, sources: uniqueSources }
    } catch (error) {
      lastError = error
      if (attempt < 2) {
        console.warn("Exact-hook web research failed; retrying", {
          attempt,
          model: input.model,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  throw new Error(
    `Could not research the selected hook after 2 attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}

function webSearchTool() {
  return {
    type: "openrouter:web_search",
    parameters: {
      engine: "auto",
      max_results: 3,
      max_total_results: 6,
      search_context_size: "medium",
    },
  }
}

export function slideshowTextGenerationPayload(input: {
  automation: TempSlideTestingAutomation
  model?: string
  selectedHook?: string
  systemPrompt?: string
  promptInstructions?: string
  avoidSimilarOutputs?: string[]
  performanceMemory?: {
    provenPatterns: string[]
    avoidPatterns: string[]
  }
  webSearchEnabled?: boolean
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
    stream: false,
    max_tokens: Math.min(
      8_192,
      Math.max(2_048, 512 + placeholders.length * 256)
    ),
    provider: {
      require_parameters: true,
    },
    plugins: [{ id: "response-healing" }],
    ...(input.webSearchEnabled
      ? {
          tool_choice: "required",
          tools: [webSearchTool()],
        }
      : {}),
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          input.webSearchEnabled
            ? `Web search is required. Search for current, authoritative facts about this exact hook before writing: ${selectedHook}. Do not substitute generic facts about the broader niche.`
            : "",
          buildTempSlideUserPrompt({
            automationName: input.automation.name,
            hook: selectedHook,
            tone: input.automation.tone,
            style: input.automation.style,
            promptInstructions,
            placeholders,
            avoidSimilarOutputs: input.avoidSimilarOutputs,
            performanceMemory: input.performanceMemory,
          }),
        ]
          .filter(Boolean)
          .join("\n\n"),
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

const broadHookWords = new Set([
  "about",
  "actually",
  "after",
  "before",
  "best",
  "buying",
  "does",
  "everyone",
  "first",
  "future",
  "happen",
  "happens",
  "housing",
  "most",
  "owner",
  "owners",
  "really",
  "should",
  "shocked",
  "their",
  "these",
  "thing",
  "things",
  "this",
  "truth",
  "what",
  "when",
  "which",
  "will",
  "with",
  "your",
])

export function outputDevelopsHookSubject(output: unknown, hook: string) {
  if (!output || typeof output !== "object" || !("text" in output)) {
    return false
  }
  const text = (output as { text?: unknown }).text
  if (!text || typeof text !== "object" || Array.isArray(text)) {
    return false
  }
  const body = Object.values(text)
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase()
  const subjects = hook
    .toLowerCase()
    .match(/[a-z0-9]+(?:-[a-z0-9]+)*/g)
    ?.filter(
      (word) => word.length >= 3 && word !== "hdb" && !broadHookWords.has(word)
    )

  if (!subjects?.length) {
    return true
  }
  return subjects.some((subject) =>
    new RegExp(`\\b${escapeRegExp(subject)}\\b`, "i").test(body)
  )
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseWebSearchSources(value: unknown): SlideshowWebSearchSource[] {
  if (!Array.isArray(value)) return []
  const sources = value.flatMap((annotation) => {
    if (!annotation || typeof annotation !== "object") return []
    const nested =
      "url_citation" in annotation &&
      annotation.url_citation &&
      typeof annotation.url_citation === "object"
        ? annotation.url_citation
        : annotation
    const url =
      "url" in nested && typeof nested.url === "string" ? nested.url.trim() : ""
    if (!url) return []
    return [
      {
        url,
        title:
          "title" in nested && typeof nested.title === "string"
            ? clean(nested.title) || undefined
            : undefined,
        content:
          "content" in nested && typeof nested.content === "string"
            ? clean(nested.content) || undefined
            : undefined,
      },
    ]
  })
  return [...new Map(sources.map((source) => [source.url, source])).values()]
}

function parseLinkedSources(content: string): SlideshowWebSearchSource[] {
  const markdownLinks = [
    ...content.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g),
  ].map((match) => ({ url: match[2], title: clean(match[1]) || undefined }))
  const linkedUrls = new Set(markdownLinks.map((source) => source.url))
  const plainUrls = [...content.matchAll(/https?:\/\/[^\s)\]]+/g)]
    .map((match) => match[0].replace(/[.,;:]+$/, ""))
    .filter((url) => !linkedUrls.has(url))
    .map((url) => ({ url }))
  return [...markdownLinks, ...plainUrls]
}

function assertCompleteStructuredChoice(
  choice: OpenRouterResponse["choices"] extends (infer T)[] | undefined
    ? T | undefined
    : never
) {
  if (!choice) {
    throw new Error("OpenRouter returned no completion choice")
  }
  if (choice.error?.message) {
    throw new Error(`OpenRouter provider error: ${choice.error.message}`)
  }
  if (choice.finish_reason && choice.finish_reason !== "stop") {
    throw new Error(
      `OpenRouter completion ended with finish_reason=${choice.finish_reason}`
    )
  }
}
