import { NextResponse } from "next/server"
import { z } from "zod"

import { ApiError, validate, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { estimateUgcCost } from "@/lib/ugc-cost"

export const dynamic = "force-dynamic"

const ugcSchema = z
  .object({
    enabled: z.boolean().optional(),
    actorSource: z.enum(["generate", "gallery", "upload"]).optional(),
    actorAssetUrl: z.string().optional(),
    voiceModel: z.string().optional(),
    lipSyncTier: z.enum(["standard", "premium"]).optional(),
    targetDurationSeconds: z.number().min(15).max(180).optional(),
    brollCount: z.number().int().min(0).max(6).optional(),
  })
  .passthrough()

export const POST = withHandler(async (request: Request) => {
  assertUgcEnabled()
  if (!(await getCurrentUser()))
    throw new ApiError(401, "Authentication is required.")
  const body = await request.json().catch(() => null)
  const ugc = validate(ugcSchema, body?.ugc ?? body)
  return NextResponse.json({ estimate: estimateUgcCost(ugc) })
})

function assertUgcEnabled() {
  if (process.env.ENABLE_UGC_AUTOMATION !== "true")
    throw new ApiError(404, "UGC automation is not enabled.")
}
