import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { derivePillarsFromNiche } from "@/lib/x-automation-generation"
import { getXAutomation, upsertXAutomation } from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

export const POST = withHandler(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params
    const automation = await getXAutomation(id)
    if (!automation) throw new ApiError(404, "X automation not found")
    if (!automation.niche.label.trim()) {
      throw new ApiError(400, "Add a niche before generating its strategy")
    }
    const brief = await derivePillarsFromNiche({
      niche: automation.niche.label,
      model: automation.generation.model,
    })
    const updated = await upsertXAutomation({ ...automation, brief })
    return NextResponse.json({ automation: updated, brief })
  }
)
