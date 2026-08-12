import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { queueLinkedInWorkflow } from "@/lib/generation-workflows"
import { clean } from "@/lib/guards"
import type { LinkedInBrief } from "@/lib/linkedin-automation-generation"

export const dynamic = "force-dynamic"

/**
 * Stateless LinkedIn post generator. The API preserves the original response
 * contract while Windmill owns the full production workflow.
 *
 * POST body:
 *   { niche, brief?, persona?, archetypeId?, hookStyleId?, pillar?, topic?,
 *     excludedTopics?, proof?, count?, model? }
 */
export const POST = withHandler(async (request: Request) => {
  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!payload) throw new ApiError(400, "A JSON body is required")

  const niche = clean(payload.niche)
  if (!niche) throw new ApiError(400, "A niche is required")
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, "Authentication is required")
  const workflow = await queueLinkedInWorkflow({
    ownerId: user.$id,
    requestId: clean(payload.requestId),
    niche,
    topic: clean(payload.topic) || undefined,
    excludedTopics: asStringArray(payload.excludedTopics),
    proof: asStringArray(payload.proof),
    persona: payload.persona === "practitioner" ? "practitioner" : "educator",
    brief: isBrief(payload.brief)
      ? (payload.brief as LinkedInBrief)
      : undefined,
    briefModel: clean(payload.briefModel) || undefined,
    model: clean(payload.model) || undefined,
    count: Math.min(Math.max(Number(payload.count) || 1, 1), 4),
    archetypeId: clean(payload.archetypeId) || undefined,
    hookStyleId: clean(payload.hookStyleId) || undefined,
    pillar: clean(payload.pillar) || undefined,
  })
  return NextResponse.json(
    {
      status: "queued",
      workflow,
      pollUrl: `/api/workflow-runs/${encodeURIComponent(workflow.jobId)}`,
    },
    { status: 202 }
  )
})

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => clean(item)).filter(Boolean)
    : []
}

function isBrief(value: unknown): value is LinkedInBrief {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as LinkedInBrief).pillars) &&
    typeof (value as LinkedInBrief).audience === "string"
  )
}
