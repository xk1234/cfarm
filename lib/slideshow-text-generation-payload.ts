import { clean } from "@/lib/guards"
import { defaultSlideshowTextModel } from "@/lib/realfarm-generation-model-registry"
import {
  buildTempSlideStructuredOutputSchema,
  buildTempSlideUserPrompt,
  defaultTempSlideSystemPrompt,
  defaultTempSlideUserInstructions,
  getTempSlidePromptPlaceholders,
  promptPreviewHook,
  type TempSlideTestingAutomation,
} from "@/lib/temp-slide-testing-shared"

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
