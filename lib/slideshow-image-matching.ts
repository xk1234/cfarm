import { clean } from "@/lib/guards"
import { fetchJson, providerErrorMessage } from "@/lib/http"
import { defaultSlideshowTextModel } from "@/lib/realfarm-generation-model-registry"

export type SlideshowImageCandidate = {
  id: string
  imageUrl: string
  caption: string
}

type OpenRouterContentResponse = {
  choices?: { message?: { content?: unknown } }[]
}

/**
 * How many candidates survive local ranking and reach the model.
 *
 * Sending every candidate used to compile an enum of one id per image. With a
 * real collection (200+ images, 64-char ids) that schema is ~13KB, which
 * Anthropic rejects outright ("Schema is too complex for compilation") and
 * which pushed the call past its timeout. A shortlist keeps the prompt small,
 * the schema trivial, and the cost bounded.
 */
export const imageShortlistSize = 12

const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "has", "have", "how", "in", "into", "is", "it", "its", "of", "on", "or",
  "she", "that", "the", "their", "them", "they", "this", "to", "was",
  "what", "when", "who", "will", "with", "you", "your",
])

function tokenize(value: string) {
  return clean(value)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 2 && !stopWords.has(token))
}

/**
 * Prompt for deriving VISUAL concepts from slide copy.
 *
 * Ranking captions against raw slide text matches poorly: the copy is about
 * behaviour and feeling ("she goes quiet for three days"), while captions
 * describe what is depicted ("crescent moon over dark water"). Asking for the
 * imagery implied by the copy gives the local ranker vocabulary that actually
 * overlaps with captions.
 */
export function visualConceptsPayload(input: {
  slideTexts: string[]
  model?: string
}) {
  return {
    model: clean(input.model) || defaultSlideshowTextModel,
    messages: [
      {
        role: "system",
        content:
          "For each slide, list the visual concepts an art director would search for to illustrate it: concrete subjects, objects, settings, lighting and colour. Describe what would be SHOWN, never the wording or the emotion in the abstract. Short noun phrases only.",
      },
      {
        role: "user",
        content: input.slideTexts
          .map((text, index) => `Slide ${index}:\n${clean(text)}`)
          .join("\n\n"),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "slide_visual_concepts",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["slides"],
          properties: {
            slides: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["concepts"],
                properties: {
                  concepts: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
  }
}

/**
 * Rank candidates by how well their captions cover the slide's visual
 * concepts. Pure and network-free so matching quality is unit-testable.
 *
 * A whole concept phrase appearing in a caption is much stronger evidence than
 * incidental word overlap, so phrase hits are weighted above token hits.
 */
export function rankImageCandidates(input: {
  concepts: string[]
  slideText?: string
  candidates: SlideshowImageCandidate[]
  limit?: number
}) {
  const limit = input.limit ?? imageShortlistSize
  const phrases = input.concepts
    .map((concept) => clean(concept).toLowerCase())
    .filter(Boolean)
  const conceptTokens = new Set(phrases.flatMap(tokenize))
  // Slide text is a weak secondary signal; it breaks ties when concepts miss.
  const textTokens = new Set(tokenize(input.slideText ?? ""))

  const scored = input.candidates.map((candidate, index) => {
    const caption = clean(candidate.caption).toLowerCase()
    const captionTokens = new Set(tokenize(caption))
    let score = 0
    for (const phrase of phrases) {
      if (phrase.includes(" ") && caption.includes(phrase)) score += 10
    }
    for (const token of conceptTokens) {
      if (captionTokens.has(token)) score += 3
    }
    for (const token of textTokens) {
      if (captionTokens.has(token)) score += 1
    }
    return { candidate, score, index }
  })

  return scored
    .sort((left, right) =>
      right.score === left.score
        ? left.index - right.index
        : right.score - left.score
    )
    .slice(0, Math.max(1, limit))
    .map((entry) => entry.candidate)
}

/**
 * Ask the model to choose from a shortlist by INDEX.
 *
 * The schema deliberately carries no `enum`, `minimum` or `maximum`: Anthropic's
 * structured-output compiler rejects all three, and the range is enforced by the
 * caller anyway.
 */
export function slideshowImageMatchingPayload(input: {
  slideText: string
  candidates: SlideshowImageCandidate[]
  concepts?: string[]
  model?: string
}) {
  const conceptLine = input.concepts?.length
    ? `\n\nVisual concepts for this slide:\n${input.concepts.join(", ")}`
    : ""
  const content: Array<{ type: "text"; text: string }> = [
    {
      type: "text",
      text: `Slide text:\n${clean(input.slideText)}${conceptLine}\n\nChoose from these candidate images:`,
    },
  ]
  for (const [index, candidate] of input.candidates.entries()) {
    content.push({
      type: "text",
      text: `Candidate ${index}: ${clean(candidate.caption) || "No caption available"}`,
    })
    // Deliberately no `image_url` block. Providers fetch those server-side and
    // refuse plenty of hosts ("This URL is disallowed by the website's
    // robots.txt file"), which fails the whole selection. Captions already
    // describe the image and are what the local ranker scores, so attaching
    // the bytes adds cost and a failure mode without adding signal.
  }

  return {
    model: clean(input.model) || defaultSlideshowTextModel,
    messages: [
      {
        role: "system",
        content:
          "Select the single image most visually relevant to the slide. Answer with its candidate number. Prefer a direct subject match over a generic aesthetic match.",
      },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "slideshow_image_match",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["selectedImageIndex"],
          properties: { selectedImageIndex: { type: "integer" } },
        },
      },
    },
  }
}

function parsedContent(response: OpenRouterContentResponse) {
  const content = response.choices?.[0]?.message?.content
  if (content === undefined || content === null) return null
  try {
    return typeof content === "string" ? JSON.parse(content) : content
  } catch {
    return null
  }
}

/** Derive per-slide visual concepts in one call. Returns [] per slide on failure. */
export async function deriveSlideVisualConcepts(input: {
  slideTexts: string[]
  apiKey: string
  model?: string
  fetchImpl?: typeof fetch
}): Promise<string[][]> {
  if (input.slideTexts.length === 0) return []
  const empty = input.slideTexts.map(() => [] as string[])
  try {
    const response = await fetchJson<OpenRouterContentResponse>(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(visualConceptsPayload(input)),
      },
      {
        fetchImpl: input.fetchImpl,
        timeoutMs: 60_000,
        errorMessage: providerErrorMessage("Visual concept derivation failed"),
      }
    )
    const parsed = parsedContent(response) as
      | { slides?: { concepts?: unknown }[] }
      | null
    if (!parsed?.slides) return empty
    // Concepts only narrow a shortlist, so a partial or malformed answer should
    // degrade ranking rather than fail the generation.
    return input.slideTexts.map((_, index) => {
      const concepts = parsed.slides?.[index]?.concepts
      return Array.isArray(concepts)
        ? concepts.map((entry) => clean(String(entry))).filter(Boolean)
        : []
    })
  } catch {
    return empty
  }
}

export async function selectSlideshowImageWithAi(input: {
  slideText: string
  candidates: SlideshowImageCandidate[]
  apiKey: string
  concepts?: string[]
  model?: string
  fetchImpl?: typeof fetch
}) {
  if (input.candidates.length === 0) return null
  if (input.candidates.length === 1) return input.candidates[0].id

  const shortlist = rankImageCandidates({
    concepts: input.concepts ?? [],
    slideText: input.slideText,
    candidates: input.candidates,
  })
  if (shortlist.length === 1) return shortlist[0].id

  const response = await fetchJson<OpenRouterContentResponse>(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        slideshowImageMatchingPayload({ ...input, candidates: shortlist })
      ),
    },
    {
      fetchImpl: input.fetchImpl,
      timeoutMs: 60_000,
      errorMessage: providerErrorMessage("AI image matching failed"),
    }
  )
  const parsed = parsedContent(response) as
    | { selectedImageIndex?: unknown }
    | null
  const index = parsed?.selectedImageIndex
  // The schema cannot express the bound, so the caller enforces it. Falling back
  // to the top-ranked candidate keeps a healthy generation from dying on a
  // single sloppy answer.
  return Number.isInteger(index) &&
    (index as number) >= 0 &&
    (index as number) < shortlist.length
    ? shortlist[index as number].id
    : shortlist[0].id
}
