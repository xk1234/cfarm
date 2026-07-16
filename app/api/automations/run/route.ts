import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { runDueAutomations } from "@/lib/automation-runner"

export const dynamic = "force-dynamic"

export const POST = withHandler(async (request: Request) => {
  return runAutomations(request)
})

async function runAutomations(request: Request) {
  const body = await request.json().catch(() => null)
  const automationId = stringValue(body?.automationId)
  if (!automationId || body?.force !== true) {
    throw new ApiError(
      400,
      "Interactive generation requires automationId and force=true"
    )
  }
  let result
  try {
    result = await runDueAutomations({
      automationId,
      force: true,
      now: dateValue(body?.now),
      requestId: stringValue(body?.requestId),
    })
  } catch (error) {
    if (
      error instanceof Error &&
      /^Hook slot .+ has no words in database collection .+$/.test(
        error.message
      )
    ) {
      throw new ApiError(400, error.message)
    }
    throw error
  }

  return NextResponse.json(result)
}

function dateValue(value: unknown) {
  const date = typeof value === "string" ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date : undefined
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
