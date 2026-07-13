import { clean } from "@/lib/guards"
import { fetchJson } from "@/lib/http"
import { defaultSlideshowTextModel } from "@/lib/realfarm-generation-model-registry"

export type SlideshowImageCandidate = {
  id: string
  imageUrl: string
  caption: string
}

type OpenRouterImageMatchResponse = {
  choices?: { message?: { content?: unknown } }[]
}

export function slideshowImageMatchingPayload(input: {
  slideText: string
  candidates: SlideshowImageCandidate[]
  model?: string
}) {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: `Slide text:\n${input.slideText}\n\nChoose from these candidate images:`,
    },
  ]
  for (const candidate of input.candidates) {
    content.push({
      type: "text",
      text: `Candidate ${candidate.id}: ${clean(candidate.caption) || "No caption available"}`,
    })
    if (/^https?:\/\//i.test(candidate.imageUrl)) {
      content.push({
        type: "image_url",
        image_url: { url: candidate.imageUrl },
      })
    }
  }

  return {
    model: clean(input.model) || defaultSlideshowTextModel,
    messages: [
      {
        role: "system",
        content:
          "Select the single image that is most visually and semantically relevant to the finalized slide text. Use only a supplied candidate id. Prefer a direct subject/action match over a generic aesthetic match.",
      },
      {
        role: "user",
        content,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "slideshow_image_match",
        strict: true,
        schema: {
          type: "object",
          properties: {
            selectedImageId: {
              type: "string",
              enum: input.candidates.map((candidate) => candidate.id),
            },
          },
          required: ["selectedImageId"],
          additionalProperties: false,
        },
      },
    },
  }
}

export async function selectSlideshowImageWithAi(input: {
  slideText: string
  candidates: SlideshowImageCandidate[]
  apiKey: string
  model?: string
  fetchImpl?: typeof fetch
}) {
  if (input.candidates.length === 0) return null
  if (input.candidates.length === 1) return input.candidates[0].id

  const response = await fetchJson<OpenRouterImageMatchResponse>(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(slideshowImageMatchingPayload(input)),
    },
    {
      fetchImpl: input.fetchImpl,
      timeoutMs: 30_000,
      errorMessage: () => "AI image matching failed",
    }
  )
  const content = response.choices?.[0]?.message?.content
  const parsed = typeof content === "string" ? JSON.parse(content) : content
  const selectedImageId =
    parsed && typeof parsed === "object" && "selectedImageId" in parsed
      ? clean(parsed.selectedImageId)
      : ""
  return input.candidates.some((candidate) => candidate.id === selectedImageId)
    ? selectedImageId
    : null
}
