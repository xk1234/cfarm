import type { BrandProfile } from "@/lib/brand-profile"
import { clean } from "@/lib/guards"
import { llmSlopPromptLine } from "@/lib/llm-slop"
import { openRouterJson } from "@/lib/openrouter"

export type GenerationChainStage = {
  model: string
  system?: string
}

export type GenerationChainTrace = {
  stage: "generate" | "humanize" | "review"
  model: string
  content: string
  verdict?: "pass" | "fix"
  issues?: string[]
}

export type GenerationChainResult = {
  content: string
  verdict: "pass" | "fix"
  issues: string[]
  trace: GenerationChainTrace[]
}

type ChainInput = {
  apiKey: string
  prompt: string
  brandProfile?: BrandProfile | null
  fetchImpl?: typeof fetch
}

const contentSchema = {
  name: "content_chain_stage",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["content"],
    properties: { content: { type: "string" } },
  },
}

const reviewSchema = {
  name: "content_chain_review",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "content", "issues"],
    properties: {
      verdict: { type: "string", enum: ["pass", "fix"] },
      content: { type: "string" },
      issues: { type: "array", items: { type: "string" } },
    },
  },
}

export async function runGenerationChain(input: {
  generate: GenerationChainStage
  humanize: GenerationChainStage
  review: GenerationChainStage
  input: ChainInput
}): Promise<GenerationChainResult> {
  const { brandProfile, fetchImpl, apiKey } = input.input
  const trace: GenerationChainTrace[] = []
  const brand = brandProfile ? brandProfilePrompt(brandProfile) : ""
  const draft = await contentPass({
    ...input.generate,
    apiKey,
    fetchImpl,
    system: [input.generate.system, brand].filter(Boolean).join("\n\n"),
    user: input.input.prompt,
  })
  trace.push({ stage: "generate", model: input.generate.model, content: draft })

  // Backward-compatible fallback: callers can use the same entry point without
  // paying for or changing copy through the optional enhancement stages.
  if (!brandProfile)
    return { content: draft, verdict: "pass", issues: [], trace }

  const humanized = await contentPass({
    ...input.humanize,
    apiKey,
    fetchImpl,
    system: [
      input.humanize.system,
      "Rewrite the draft in a natural, specific human voice without changing facts, format, or meaning.",
      llmSlopPromptLine(),
      brand,
    ]
      .filter(Boolean)
      .join("\n\n"),
    user: `DRAFT:\n${draft}`,
  })
  trace.push({
    stage: "humanize",
    model: input.humanize.model,
    content: humanized,
  })

  const reviewed = await openRouterJson({
    apiKey,
    fetchImpl,
    model: input.review.model,
    system: [
      input.review.system,
      "Review the content against every brand rule and factual constraint. Return pass when no changes are needed. Return fix when you corrected anything; content must always contain the publishable final version.",
      brand,
    ]
      .filter(Boolean)
      .join("\n\n"),
    user: `CONTENT:\n${humanized}`,
    schema: reviewSchema,
    temperature: 0.2,
  })
  const verdict = reviewed.verdict === "fix" ? "fix" : "pass"
  const content = clean(reviewed.content) || humanized
  const issues = Array.isArray(reviewed.issues)
    ? reviewed.issues.map(clean).filter(Boolean)
    : []
  trace.push({
    stage: "review",
    model: input.review.model,
    content,
    verdict,
    issues,
  })
  return { content, verdict, issues, trace }
}

async function contentPass(
  input: GenerationChainStage & {
    apiKey: string
    fetchImpl?: typeof fetch
    user: string
  }
) {
  const result = await openRouterJson({
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    model: input.model,
    system: input.system || "Create accurate, useful content.",
    user: input.user,
    schema: contentSchema,
    temperature: 0.7,
  })
  const content = clean(result.content)
  if (!content) throw new Error("Generation chain returned empty content")
  return content
}

export function brandProfilePrompt(profile: BrandProfile): string {
  return `BRAND PROFILE (binding):\n${JSON.stringify({
    niche: profile.niche,
    audience: profile.audience,
    voice: profile.voice,
    pillars: profile.pillars,
    proofPoints: profile.proofPoints,
    prohibitedClaims: profile.prohibitedClaims,
    palette: profile.palette,
  })}`
}
