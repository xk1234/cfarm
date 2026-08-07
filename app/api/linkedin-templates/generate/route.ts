import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { clean } from "@/lib/guards"
import {
  deriveLinkedInBrief,
  generateLinkedInPost,
  selectLinkedInPlan,
  type LinkedInBrief,
} from "@/lib/linkedin-automation-generation"
import { defaultSlideshowTextModel } from "@/lib/realfarm-generation-model-registry"

export const dynamic = "force-dynamic"

/**
 * Stateless LinkedIn post generator. Runs the full production pipeline
 * (brief -> plan -> structured generation -> deterministic gate + repair)
 * without persistence, so the template can be exercised end-to-end in-app
 * before the store/UI/scheduler layers are wired.
 *
 * POST body:
 *   { niche, brief?, persona?, archetypeId?, hookStyleId?, pillar?, topic?,
 *     excludedTopics?, proof?, count?, model? }
 */
export const POST = withHandler(async (request: Request) => {
  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!payload) throw new ApiError(400, "A JSON body is required")

  const niche = clean(payload.niche)
  if (!niche) throw new ApiError(400, "A niche is required")

  const model = clean(payload.model) || defaultSlideshowTextModel
  const persona = payload.persona === "practitioner" ? "practitioner" : "educator"
  const excludedTopics = asStringArray(payload.excludedTopics)
  const proof = asStringArray(payload.proof)
  const count = Math.min(Math.max(Number(payload.count) || 1, 1), 4)

  // Brief derivation is a cheap strategy call; keep it on a fast, low-cost
  // model regardless of the post-generation model.
  const briefModel = clean(payload.briefModel) || "google/gemini-3.1-flash-lite"
  const brief: LinkedInBrief = isBrief(payload.brief)
    ? (payload.brief as LinkedInBrief)
    : await deriveLinkedInBrief({ niche, model: briefModel })

  const recentArchetypeIds: string[] = []
  const recentHookIds: string[] = []
  const posts = []
  for (let i = 0; i < count; i += 1) {
    const plan = selectLinkedInPlan({
      brief,
      persona,
      hasProof: proof.length > 0,
      archetypeId: clean(payload.archetypeId) || undefined,
      hookStyleId: clean(payload.hookStyleId) || undefined,
      pillar: clean(payload.pillar) || undefined,
      topic: clean(payload.topic) || undefined,
      recentArchetypeIds,
      recentHookIds,
    })
    const generated = await generateLinkedInPost({
      niche,
      brief,
      plan,
      personaVoiceId: persona,
      model,
      excludedTopics,
      proof,
    })
    recentArchetypeIds.push(generated.archetypeId)
    recentHookIds.push(generated.hookStyleId)
    posts.push(generated)
  }

  return NextResponse.json({ niche, model, brief, posts })
})

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => clean(item)).filter(Boolean) : []
}

function isBrief(value: unknown): value is LinkedInBrief {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as LinkedInBrief).pillars) &&
    typeof (value as LinkedInBrief).audience === "string"
  )
}
