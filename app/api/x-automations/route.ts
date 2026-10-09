import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { clean } from "@/lib/guards"
import {
  createXAutomation,
  listXAutomations,
  upsertXAutomation,
} from "@/lib/x-automation-store"
import { normalizeXAutomation } from "@/lib/x-automation"

export const dynamic = "force-dynamic"

export const GET = withHandler(async () => {
  return NextResponse.json({ automations: await listXAutomations() })
})

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const automation = await createXAutomation({
    name: clean(payload?.name) || undefined,
    platform: payload?.platform === "threads" ? "threads" : "x",
  })
  return NextResponse.json({ automation }, { status: 201 })
})

export const PATCH = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const automation = normalizeXAutomation(payload?.automation ?? payload)
  if (!automation) throw new ApiError(400, "A valid X automation is required")
  return NextResponse.json({ automation: await upsertXAutomation(automation) })
})
