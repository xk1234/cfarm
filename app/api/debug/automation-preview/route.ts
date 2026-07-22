import { isRecord } from "@/lib/guards"
import { NextResponse } from "next/server"

import { previewAutomationRunPlan } from "@/lib/automation-runner"
import { internalToolsEnabled } from "@/lib/internal-tools"
import {
  normalizeAutomationSchema,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!internalToolsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  try {
    const payload = await request.json().catch(() => null)
    const automationInput = isRecord(payload?.automation)
      ? payload.automation
      : isRecord(payload)
        ? payload
        : null
    const schemaInput = isRecord(automationInput?.schema)
      ? automationInput.schema
      : isRecord(payload?.schema)
        ? payload.schema
        : null

    if (!schemaInput) {
      return NextResponse.json(
        { error: "Automation JSON must include a schema object" },
        { status: 400 }
      )
    }

    const automation = automationSummaryFromInput(automationInput, schemaInput)
    const schema = normalizeAutomationSchema(
      schemaInput as AutomationSchema,
      automation
    )
    const preview = await previewAutomationRunPlan(schema, {
      automationId: automation.id,
      now: dateValue(payload?.now),
      textModel:
        typeof payload?.textModel === "string" && payload.textModel.trim()
          ? payload.textModel.trim()
          : undefined,
    })

    return NextResponse.json({
      automationId: automation.id,
      automationTitle: automation.name,
      generatedAt: new Date().toISOString(),
      ...preview,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate automation preview",
      },
      { status: 400 }
    )
  }
}

function automationSummaryFromInput(
  automationInput: Record<string, unknown> | null,
  schemaInput: Record<string, unknown>
): Automation {
  const id =
    stringValue(automationInput?.id) ||
    stringValue(automationInput?.sourceAutomationId) ||
    "debug-automation"
  const name =
    stringValue(automationInput?.name) ||
    stringValue(schemaInput.title) ||
    "Debug automation"

  return {
    id,
    name,
    status: automationInput?.status === "paused" ? "paused" : "live",
    account: stringValue(automationInput?.account) || "No social account",
    handle: stringValue(automationInput?.handle),
    times: Array.isArray(automationInput?.times)
      ? automationInput.times.map(stringValue).filter(Boolean)
      : [],
    favorite: Boolean(automationInput?.favorite),
    theme: stringValue(automationInput?.theme) || "ugc",
    socialIntegrations: [],
    automationKind:
      schemaInput.automationKind === "video" ? "video" : "slideshow",
  }
}

function dateValue(value: unknown) {
  const date = typeof value === "string" ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date : undefined
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
