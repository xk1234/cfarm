import { clean, isRecord } from "@/lib/guards"
import { llmSlopPromptLine } from "@/lib/llm-slop"
import { getOpenRouterApiKey, openRouterJson } from "@/lib/openrouter"
import {
  automationHookId,
  automationTonePresetOptions,
  type AutomationSchema,
  type AutomationTonePresetOption,
} from "@/lib/realfarm-automation"
import { openRouterModelForUseCase } from "@/lib/realfarm-generation-model-registry"
import {
  extractTikTokSlideTexts,
  fetchTikTokSlideshowPost,
} from "@/lib/tiktok-publication-import"

export type TikTokSlideshowTranscript = {
  postId: string
  url: string
  authorUsername: string
  caption: string
  hashtags: string[]
  publishedAt: string
  slides: Array<{ index: number; text: string }>
  transcriptionFallback: boolean
}

export type SlideshowToneAnalysis = {
  tone: { value: string; preset: string }
  structure: {
    hookSlides: number
    bodySlides: number
    ctaSlides: number
  }
  wordRange: { min: number; max: number }
  language: string
  observations: string[]
  seedHook: string
}

export async function transcribeTikTokSlideshow(
  url: string
): Promise<TikTokSlideshowTranscript | null> {
  const post = await fetchTikTokSlideshowPost(url)
  if (!post) return null
  const transcriptionFallback = !getOpenRouterApiKey()
  const texts = await extractTikTokSlideTexts(post)
  return {
    postId: post.id,
    url: post.url,
    authorUsername: post.authorUsername,
    caption: post.caption,
    hashtags: extractHashtags(post.caption),
    publishedAt: post.publishedAt,
    slides: texts.map((text, index) => ({ index: index + 1, text })),
    transcriptionFallback,
  }
}

export async function analyzeSlideshowTone(
  transcript: TikTokSlideshowTranscript
): Promise<SlideshowToneAnalysis> {
  const apiKey = getOpenRouterApiKey()
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
  const result = await openRouterJson({
    apiKey,
    model: openRouterModelForUseCase("toneAnalysis"),
    timeoutMs: 60_000,
    maxTokens: 900,
    temperature: 0,
    schema: {
      name: "slideshow_tone_analysis",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          tone: {
            type: "object",
            additionalProperties: false,
            properties: {
              value: { type: "string" },
              preset: { type: "string" },
            },
            required: ["value", "preset"],
          },
          language: { type: "string" },
          observations: {
            type: "array",
            minItems: 2,
            maxItems: 5,
            items: { type: "string" },
          },
        },
        required: ["tone", "language", "observations"],
      },
    },
    system: [
      "Judge the writing voice of a TikTok slideshow transcript.",
      `Choose tone.value from: ${automationTonePresetOptions.join(", ")} when one is a clear fit. In that case set tone.preset to its lowercase key. Otherwise write a short specific custom tone value and set tone.preset to "custom".`,
      "Return 2-5 short, concrete observations limited to voice, grammatical person, and sentence shape.",
      llmSlopPromptLine(),
    ].join("\n"),
    user: JSON.stringify({
      caption: transcript.caption,
      slides: transcript.slides,
    }),
  })
  const tone = normalizeTone(result.tone)
  const observations = normalizeObservations(result.observations)
  if (observations.length < 2) {
    throw new Error("The tone model returned too few observations")
  }
  return {
    tone,
    structure: computeSlideStructure(transcript.slides),
    wordRange: computeWordRange(transcript.slides),
    language: clean(result.language) || "English",
    observations,
    seedHook: clean(transcript.slides[0]?.text),
  }
}

export function slideshowToneToAutomationFields(
  analysis: SlideshowToneAnalysis
): Partial<AutomationSchema> {
  const hook = clean(analysis.seedHook)
  return {
    tone: analysis.tone,
    language: analysis.language,
    formatting: [
      {
        id: "hook",
        textItems: [
          {
            wordLengthMin: analysis.wordRange.min,
            wordLengthMax: analysis.wordRange.max,
          },
        ],
      },
      {
        id: "body",
        textItems: [
          {
            wordLengthMin: analysis.wordRange.min,
            wordLengthMax: analysis.wordRange.max,
          },
        ],
      },
      {
        id: "cta",
        textItems: [
          {
            wordLengthMin: analysis.wordRange.min,
            wordLengthMax: analysis.wordRange.max,
          },
        ],
      },
    ],
    ...(hook
      ? {
          hooks: [
            {
              id: automationHookId(hook),
              text: hook,
              enabled: true,
              createdAt: new Date().toISOString(),
            },
          ],
        }
      : {}),
  } as Partial<AutomationSchema>
}

export function extractHashtags(caption: string) {
  return [...caption.matchAll(/#[\p{L}\p{N}_-]+/gu)].map((match) =>
    match[0].slice(1)
  )
}

export function computeWordRange(
  slides: Array<{ text: string }>
): { min: number; max: number } {
  const counts = slides
    .map((slide) => wordCount(slide.text))
    .filter((count) => count > 0)
  if (counts.length === 0) return { min: 0, max: 0 }
  return { min: Math.min(...counts), max: Math.max(...counts) }
}

export function normalizeTone(value: unknown): {
  value: string
  preset: string
} {
  const raw = isRecord(value) ? clean(value.value) : ""
  const preset = automationTonePresetOptions.find(
    (option) => option.toLowerCase() === raw.toLowerCase()
  )
  if (!preset) {
    return {
      value: raw || "Direct and concise",
      preset: "custom",
    }
  }
  return { value: preset, preset: tonePresetKey(preset) }
}

function computeSlideStructure(slides: Array<{ text: string }>) {
  const count = slides.length
  if (count === 0) return { hookSlides: 0, bodySlides: 0, ctaSlides: 0 }
  const ctaSlides =
    count > 1 && isCallToAction(slides[count - 1]?.text ?? "") ? 1 : 0
  return {
    hookSlides: 1,
    bodySlides: Math.max(0, count - 1 - ctaSlides),
    ctaSlides,
  }
}

function normalizeObservations(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(clean).filter(Boolean).slice(0, 5)
}

function wordCount(value: string) {
  return clean(value).match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu)
    ?.length ?? 0
}

function isCallToAction(value: string) {
  return /\b(?:follow|save|share|comment|like|subscribe|tap|swipe|link in bio)\b/iu.test(
    value
  )
}

function tonePresetKey(value: AutomationTonePresetOption) {
  const keys: Record<AutomationTonePresetOption, string> = {
    "Conversational & Relatable": "conversational",
    "Motivational & Empowering": "motivational",
    "Educational & Informative": "educational",
    "Bold & Provocative": "bold",
    "Calm & Reflective": "calm",
    "Witty & Humorous": "witty",
    "Witty & Relatable": "witty_relatable",
    "Practical & Aspirational": "practical_aspirational",
    "Authoritative & Reassuring": "authoritative_reassuring",
  }
  return keys[value]
}
