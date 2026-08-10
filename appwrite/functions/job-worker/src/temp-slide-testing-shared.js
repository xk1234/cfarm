// Generated from lib/temp-slide-testing-shared.ts. Do not edit by hand.
import { clean, isRecord } from "./guards.js";
import { llmSlopPromptLine } from "./llm-slop.js";
import { normalizeSocialPostMetadata, socialPostMetadataPromptLines, socialPostMetadataSchemaProperties, } from "./social-post-metadata.js";
export const defaultTempSlideSystemPrompt = "You fill metadata and text placeholders for TikTok slideshow posts. The selected hook is the source of truth for the slideshow topic: never change it, and never introduce a different concept from the automation name, a content direction, or an example. Each placeholder's content direction defines what that text box must say about the hook and its required format; treat a content direction as format guidance (heading, list item, explanation), never as permission to change the subject. Within those topic constraints, the configured Tone governs the voice — register, diction, sentence rhythm, capitalization, and word choice — and you must follow it exactly, even when it calls for lowercase, slang, a raw or personal register, or a break from polished literary habits. Do not override the configured Tone with a generic literary default. Return only JSON matching the schema. Never invent studies, statistics, or sources, and do not fabricate testimonials as quoted research; first-person voice in character is allowed. Do not add visual parameters, image prompts, commentary, markdown, or extra keys.";
export const defaultTempSlideUserInstructions = "Generate a concise slideshow title, a short social caption, and broad niche hashtags. Fill every non-hook placeholder text box. Use the fixed hook as context only and do not rewrite it. Every body slide must directly develop the exact subject and claim in the selected hook while following its own content direction. Body slides should be specific to the hook, not merely the automation category. Return slide text only in the schema's text object.";
export function buildTempSlideUserPrompt(input) {
    const placeholderLines = input.placeholders.map((placeholder) => {
        return `- ${placeholder.id}: ${placeholder.slideId}, ${placeholder.section}, ${placeholderRequirement(placeholder)}`;
    });
    const captionPolicy = promptUsesExactHookCaption(input.promptInstructions)
        ? "exact_hook"
        : "generated";
    return [
        `Automation: ${input.automationName}`,
        `Hook: ${input.hook}`,
        "Tone (governs register, diction, rhythm, and casing — apply to every field; do not substitute a literary default):",
        `Tone: ${input.tone}`,
        "Metadata requirements:",
        ...socialPostMetadataPromptLines("slideshow", { captionPolicy }),
        "Prompt instructions:",
        input.promptInstructions,
        ...performanceMemoryLines(input.performanceMemory),
        "Hook-to-content coherence rules:",
        "- The selected Hook above is the source of truth for this one slideshow. First identify its exact subject, people/sign/product, and claim or question.",
        "- Every body slide must directly answer, explain, support, exemplify, or continue that exact hook. Reuse the hook's specific subject where needed so the connection is unmistakable.",
        "- Do not switch to a different concept, stock framework, or theme just because it appears in the automation name, tone, or an example inside a content direction.",
        "- Follow each placeholder's content direction about the selected hook. If a direction specifies format (for example heading, explanation, list item), treat it as format—not as permission to change topics.",
        "- Text boxes sharing the same slide id are one unit: later text boxes must explain or support the first text box on that slide, never introduce an unrelated point.",
        "- Across body slides, create a logical progression without repeating the same point.",
        ...avoidSimilarOutputLines(input.avoidSimilarOutputs),
        ...avoidSimilarHeadingLines(input.avoidSimilarHeadings),
        ...strictOutputRuleLines(input.tone),
        "Placeholders:",
        ...placeholderLines,
    ].join("\n");
}
function performanceMemoryLines(memory) {
    const proven = (memory?.provenPatterns ?? []).map(clean).filter(Boolean);
    const avoid = (memory?.avoidPatterns ?? []).map(clean).filter(Boolean);
    if (proven.length === 0 && avoid.length === 0)
        return [];
    return [
        "Performance memory from prior scored posts:",
        ...proven.map((value) => `- Proven: ${value}`),
        ...avoid.map((value) => `- Avoid: ${value}`),
        "Use this only as strategic guidance; the selected hook and field directions still control the topic.",
    ];
}
export function toneRequestsLowercase(tone) {
    return /lower\s*case|all\s*lowercase/i.test(tone ?? "");
}
function strictOutputRuleLines(tone) {
    const lines = [
        "Strict output rules:",
        "- Fill EVERY field. Never return an empty string for title, caption, hashtags, or any placeholder.",
        "- Keep each placeholder within the exact word range stated for it; count words before answering.",
        "- hashtags must be a JSON array of 3-5 tags, each starting with '#' (e.g. ['#focus', '#wellness', '#mindset']).",
    ];
    if (toneRequestsLowercase(tone)) {
        lines.push("- Write EVERY value — title, caption, hashtags, and all slide text — in all lowercase with no capital letters anywhere.");
    }
    return lines;
}
function avoidSimilarOutputLines(outputs) {
    const values = (outputs ?? []).map(clean).filter(Boolean).slice(0, 5);
    if (values.length === 0) {
        return [];
    }
    return [
        "Avoid making the title, caption, or body slide text substantially similar to these prior outputs:",
        ...values.map((value) => `- ${value}`),
    ];
}
function avoidSimilarHeadingLines(headings) {
    const values = (headings ?? []).map(clean).filter(Boolean).slice(0, 20);
    if (values.length === 0)
        return [];
    return [
        "Do not reuse these recently published body headings or substantially repeat their angles:",
        ...values.map((value) => `- ${value}`),
    ];
}
export function promptPreviewHook(automation) {
    return (automation.hooks.map(clean).find(Boolean) ??
        "Create a high-performing TikTok slideshow.");
}
export function hookImpliedSlideCount(hook) {
    const match = clean(hook).match(/^(\d{1,2})\s+[a-zA-Z]/);
    if (!match) {
        return null;
    }
    const count = Number(match[1]);
    return count >= 1 && count <= 10 ? count : null;
}
export function buildTempSlideStructuredOutputSchema(placeholders, options = {}) {
    const promptPlaceholders = placeholders.filter((placeholder) => placeholder.textMode === "prompt");
    const properties = Object.fromEntries(promptPlaceholders.map((placeholder) => [
        placeholder.id,
        {
            type: "string",
            minLength: 1,
            description: placeholderDescription(placeholder),
        },
    ]));
    return {
        type: "object",
        additionalProperties: false,
        properties: {
            ...socialPostMetadataSchemaProperties("slideshow", {
                captionPolicy: options.exactHookCaption ? "exact_hook" : "generated",
            }),
            text: {
                type: "object",
                additionalProperties: false,
                properties,
                required: promptPlaceholders.map((placeholder) => placeholder.id),
            },
        },
        required: ["title", "caption", "hashtags", "text"],
    };
}
export function getTempSlidePromptPlaceholders(automation) {
    return automation.slides.flatMap((slide) => slide.displayText
        ? slide.textItems.filter((textItem) => textItem.textMode === "prompt" && textItem.section !== "hook")
        : []);
}
/**
 * Single source of truth for the system + user prompt and the structured-output
 * schema used by BOTH the Next app (lib/slideshow-text-generation-payload.ts) and
 * the Windmill pipeline handler (windmill/runtime/production-pipeline-handlers.ts,
 * kept in sync via scripts/sync-function-shared.mjs). Feeding identical primitives
 * here yields byte-identical prompts on both paths.
 *
 * The banned-AI-tell line is always appended (adoption of the worker's behaviour
 * app-side), and the raw `prompt_formatting.narrative` template dump is never
 * included — callers must not pass it as `promptInstructions` (see
 * lib/automation-runner.ts for the rationale).
 */
export function buildScheduledSlideshowPrompt(input) {
    const promptInstructions = clean(input.promptInstructions) || defaultTempSlideUserInstructions;
    const systemPrompt = clean(input.systemPrompt) || defaultTempSlideSystemPrompt;
    const exactHookCaption = promptUsesExactHookCaption(promptInstructions);
    return {
        system: `${systemPrompt}\n${llmSlopPromptLine()}`,
        user: buildTempSlideUserPrompt({
            automationName: input.automationName,
            hook: input.hook,
            tone: input.tone,
            promptInstructions,
            placeholders: input.placeholders,
            avoidSimilarOutputs: input.avoidSimilarOutputs,
            avoidSimilarHeadings: input.avoidSimilarHeadings,
            performanceMemory: input.performanceMemory,
        }),
        schema: buildTempSlideStructuredOutputSchema(input.placeholders, {
            exactHookCaption,
        }),
    };
}
function promptUsesExactHookCaption(value) {
    return /Caption requirement:\s*return exactly the selected Hook text/i.test(value);
}
/** Shared word-count rule for both the generation repair loop and output QA. */
export function wordRangeViolation(words, min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max))
        return null;
    if (words < min)
        return "below";
    if (words > max)
        return "above";
    return null;
}
export function countSlideWords(value) {
    return value.split(/\s+/).filter(Boolean).length;
}
/**
 * Validation error (ready for a structured-output repair loop) when a
 * placeholder's generated text breaks its configured word range, or null when
 * in range. Used by the app generation loop and the job-worker so both paths
 * repair word-limit violations instead of silently shipping invalid output.
 */
export function placeholderWordRangeError(placeholder, text) {
    const words = countSlideWords(text);
    const direction = wordRangeViolation(words, Number(placeholder.wordLengthMin), Number(placeholder.wordLengthMax));
    if (!direction)
        return null;
    return direction === "below"
        ? `${placeholder.id} has ${words} words, but its configured minimum is ${placeholder.wordLengthMin}.`
        : `${placeholder.id} has ${words} words, but its configured maximum is ${placeholder.wordLengthMax}.`;
}
export function normalizeTempSlideStructuredOutput(output, placeholders, options = {}) {
    const textRecord = isRecord(output) && isRecord(output.text) ? output.text : {};
    const maybeLower = (value) => options.lowercase ? value.toLowerCase() : value;
    const metadata = normalizeSocialPostMetadata(output, options);
    return {
        title: metadata.title,
        caption: metadata.caption,
        hashtags: metadata.hashtags.join(" "),
        text: Object.fromEntries(placeholders.map((placeholder) => [
            placeholder.id,
            maybeLower(clean(typeof textRecord[placeholder.id] === "string"
                ? textRecord[placeholder.id]
                : "")),
        ])),
    };
}
function placeholderDescription(placeholder) {
    return `${placeholder.label}. ${placeholderRequirement(placeholder)}.`;
}
function placeholderRequirement(placeholder) {
    const direction = placeholder.contentDirection || "Fill this slideshow text box.";
    const normalizedDirection = direction.trim().replace(/[.。]+$/, "");
    const wordRange = `${placeholder.wordLengthMin}-${placeholder.wordLengthMax} words`;
    const mentionedRange = firstWordRangeMention(normalizedDirection);
    if (!mentionedRange) {
        return `${normalizedDirection}. ${wordRange}`;
    }
    // Schema wins over any word range stated in the content direction. When they
    // agree, keep the direction as-is (no duplication). When they conflict, replace
    // the direction's stated range with the schema range so the model sees exactly
    // one authoritative range instead of being told "1-2 words" and then failing
    // QA for a configured minimum of 2.
    return mentionedRange === wordRange
        ? normalizedDirection
        : normalizedDirection.replace(mentionedRange, wordRange);
}
function firstWordRangeMention(value) {
    return value.match(/\b\d+\s*[-–—+]\s*\d*\s*words?\b/i)?.[0] ?? null;
}
