// Generated from lib/slideshow-text-generation-payload.ts. Do not edit by hand.
import { clean } from "./guards.js";
import { defaultSlideshowTextModel } from "./realfarm-generation-model-registry.js";
import { sanitizeStructuredSchema } from "./openrouter.js";
import { buildScheduledSlideshowPrompt, getTempSlidePromptPlaceholders, promptPreviewHook, } from "./temp-slide-testing-shared.js";
export function slideshowTextGenerationPayload(input) {
    const model = clean(input.model) || defaultSlideshowTextModel;
    const selectedHook = clean(input.selectedHook) || promptPreviewHook(input.automation);
    const placeholders = getTempSlidePromptPlaceholders(input.automation);
    const bundle = buildScheduledSlideshowPrompt({
        automationName: input.automation.name,
        hook: selectedHook,
        tone: input.automation.tone,
        systemPrompt: input.systemPrompt,
        promptInstructions: input.promptInstructions,
        placeholders,
        avoidSimilarOutputs: input.avoidSimilarOutputs,
        avoidSimilarHeadings: input.avoidSimilarHeadings,
        performanceMemory: input.performanceMemory,
    });
    return {
        model,
        stream: false,
        max_tokens: Math.min(8_192, Math.max(2_048, 512 + placeholders.length * 256)),
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
                content: bundle.system,
            },
            {
                role: "user",
                content: [
                    input.webSearchEnabled
                        ? `Web search is required. Search for current, authoritative facts about this exact hook before writing: ${selectedHook}. Do not substitute generic facts about the broader niche.`
                        : "",
                    bundle.user,
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
                // Keep the unified prompt bundle's schema, but strip the keywords
                // Anthropic's structured-output compiler rejects.
                schema: sanitizeStructuredSchema(bundle.schema),
            },
        },
    };
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
    };
}
