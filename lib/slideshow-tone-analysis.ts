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
  wordRangeByRole: {
    hook: { min: number; max: number }
    body: { min: number; max: number }
    cta: { min: number; max: number }
  }
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
    wordRangeByRole: computeWordRangesByRole(transcript.slides),
    language: clean(result.language) || "English",
    observations,
    seedHook: clean(transcript.slides[0]?.text),
  }
}

export function slideshowToneToAutomationFields(
  analysis: SlideshowToneAnalysis
): Partial<AutomationSchema> {
  const hook = clean(analysis.seedHook)
  const { hookSlides, bodySlides, ctaSlides } = analysis.structure
  return {
    tone: analysis.tone,
    language: analysis.language,
    // The analyzer already counts the source's slides and describes its voice.
    // Dropping either produced a "matched" automation that wrote four slides
    // from a two-slide source, in a voice nothing had been told to copy.
    prompt_formatting: {
      style: observationsToStyle(analysis.observations),
      num_of_slides: Math.max(1, hookSlides + bodySlides + ctaSlides),
    },
    formatting: [
      {
        id: "hook",
        slideCount: hookSlides,
        textItems: [
          {
            wordLengthMin: analysis.wordRangeByRole.hook.min,
            wordLengthMax: analysis.wordRangeByRole.hook.max,
          },
        ],
      },
      {
        id: "body",
        slideCount: bodySlides,
        textItems: [
          {
            wordLengthMin: analysis.wordRangeByRole.body.min,
            wordLengthMax: analysis.wordRangeByRole.body.max,
          },
        ],
      },
      {
        id: "cta",
        slideCount: ctaSlides,
        textItems: [
          {
            wordLengthMin: analysis.wordRangeByRole.cta.min,
            wordLengthMax: analysis.wordRangeByRole.cta.max,
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

/**
 * The observations are the only description of the source's voice the match
 * ever produces, and generation reads `prompt_formatting.style`. Joining them
 * into that field is what makes a matched automation write like its source
 * rather than like the default template.
 */
function observationsToStyle(observations: string[]) {
  const lines = observations.map(clean).filter(Boolean)
  if (lines.length === 0) return ""
  return ["Write in the voice of the matched slideshow:", ...lines].join("\n")
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

// A hook and a body slide are not the same length, so one range across both is
// useless: the measured Cancer slideshow spans 8-62 words, which would permit a
// 62-word hook and an 8-word body — the inverse of the slideshow it came from.
export function computeWordRangesByRole(slides: Array<{ text: string }>) {
  const written = slides.filter((slide) => wordCount(slide.text) > 0)
  const overall = computeWordRange(written)
  if (written.length < 2) {
    const only = widen(overall)
    return { hook: only, body: only, cta: only }
  }
  const [hook, ...rest] = written
  // The last slide is only the CTA when it reads like one — the same test
  // computeSlideStructure applies. Assuming every final slide is a CTA filed a
  // plain closing line's length under CTA and dropped it from the body range,
  // so the two halves of one analysis disagreed about the same slide.
  const last = rest[rest.length - 1]
  const cta =
    rest.length > 1 && isCallToAction(last?.text ?? "") ? last : undefined
  const body = cta ? rest.slice(0, -1) : rest
  const bodyRange = widen(computeWordRange(body.length ? body : rest))
  return {
    hook: widen(computeWordRange([hook])),
    body: bodyRange,
    // With no CTA slide there is nothing to measure. The body range is the
    // nearest real evidence; `overall` spans the hook too, which would licence
    // a CTA as long as the longest body slide.
    cta: cta ? widen(computeWordRange([cta])) : bodyRange,
  }
}

/**
 * How far a matched range may drift from the lengths actually measured.
 *
 * One source slide per role is the normal case, and it yields min === max — a
 * body line forced to be exactly five words forever. Half the observed spread
 * (or half the value itself, when a single slide gives no spread) leaves room
 * for a sentence to breathe without losing the source's shape.
 */
export const WORD_RANGE_VARIANCE = 0.5

export function widen({ min, max }: { min: number; max: number }) {
  if (min <= 0 && max <= 0) return { min, max }
  const spread = max - min
  const pad = Math.max(1, Math.round(WORD_RANGE_VARIANCE * (spread || min)))
  return { min: Math.max(1, min - pad), max: max + pad }
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
