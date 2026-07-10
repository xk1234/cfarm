import { isRecord } from "@/lib/guards"
import { NextResponse } from "next/server"

import { runDueAutomations } from "@/lib/automation-runner"
import type { AutomationSchema } from "@/lib/realfarm-automation"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const authError = validateCronRequest(request)
  if (authError) {
    return authError
  }

  return runAutomations(request)
}

export async function POST(request: Request) {
  const authError = validateCronRequest(request)
  if (authError) {
    return authError
  }

  return runAutomations(request)
}

function validateCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    // Local development convenience (mirrors proxy.ts): the browser UI's
    // "run now" button can't send a bearer token. Deployed environments must
    // configure CRON_SECRET; anything non-localhost fails closed.
    if (isLocalhostRequest(request)) {
      return null
    }

    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    )
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return null
}

function isLocalhostRequest(request: Request) {
  const hostname = new URL(request.url).hostname
  return hostname === "localhost" || hostname === "127.0.0.1"
}

async function runAutomations(request: Request) {
  const url = new URL(request.url)
  const body = request.method === "POST" ? await request.json().catch(() => null) : null
  const now = dateValue(body?.now ?? url.searchParams.get("now"))
  const lookbackMinutes = numberValue(body?.lookbackMinutes ?? url.searchParams.get("lookbackMinutes"))
  const automationId = stringValue(body?.automationId ?? url.searchParams.get("automationId"))
  const result = await runDueAutomations({
    automationId,
    schemaOverride: isRecord(body?.schema) ? body.schema as AutomationSchema : undefined,
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
