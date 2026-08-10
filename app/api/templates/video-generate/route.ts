import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { runVideoTemplateWorkflow } from "@/lib/generation-workflows"
import { clean } from "@/lib/guards"

export const dynamic = "force-dynamic"

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const templateId = clean(payload?.templateId)
  if (!templateId) throw new ApiError(400, "A template id is required")
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, "Authentication is required")
  const result = await runVideoTemplateWorkflow({
    templateId,
    ownerId: user.$id,
    requestId: clean(payload?.requestId),
  })
  return NextResponse.json(result, { status: 201 })
})
