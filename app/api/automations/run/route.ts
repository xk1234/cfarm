import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { runDueAutomations } from "@/lib/automation-runner"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  return runAutomations(request)
})

export const POST = withHandler(async (request: Request) => {
  return runAutomations(request)
})

async function runAutomations(request: Request) {
  const url = new URL(request.url)
  const body = request.method === "POST" ? await request.json().catch(() => null) : null
  const now = dateValue(body?.now ?? url.searchParams.get("now"))
  const lookbackMinutes = numberValue(body?.lookbackMinutes ?? url.searchParams.get("lookbackMinutes"))
  const automationId = stringValue(body?.automationId ?? url.searchParams.get("automationId"))
  const result = await runDueAutomations({
    automationId,
    force: request.method === "POST" && body?.force === true,
    now,
    lookbackMinutes,
  })

  return NextResponse.json(result)
}

function dateValue(value: unknown) {
  const date = typeof value === "string" ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date : undefined
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  return Number.isFinite(number) && number > 0 ? number : undefined
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
