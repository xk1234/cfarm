import { NextResponse } from "next/server"

import {
  automationRecordToSummary,
  createLocalAutomationRecord,
  deleteAutomationRecord,
  listAutomationRecords,
  patchAutomationRecord,
  upsertAutomationRecords,
} from "@/lib/automations"
import type { AutomationSchedule, AutomationSchema, AutomationStatus, AutomationTemplate } from "@/lib/realfarm-automation"

export const dynamic = "force-dynamic"

export async function GET() {
  const records = await listAutomationRecords()
  return NextResponse.json({
    records,
    automations: records.map(automationRecordToSummary),
  })
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  const rawAutomations = Array.isArray(payload?.automations) ? payload.automations : Array.isArray(payload) ? payload : []
  if (rawAutomations.length > 0) {
    return NextResponse.json({
      error: "Raw automation imports must use /api/automation-templates",
    }, { status: 400 })
  }

  const record = createLocalAutomationRecord({
    name: typeof payload?.name === "string" ? payload.name : undefined,
    schema: isRecord(payload?.schema) ? payload.schema as AutomationSchema : undefined,
    template: isRecord(payload?.template) ? payload.template as AutomationTemplate : undefined,
    overrides: isRecord(payload?.overrides) ? payload.overrides as {
      status?: AutomationStatus
      tiktok_account_id?: string | null
      schedule?: AutomationSchedule
    } : undefined,
  })
  const next = await upsertAutomationRecords({ records: [record] })

  return NextResponse.json({
    record,
    automation: automationRecordToSummary(record),
    records: next,
    automations: next.map(automationRecordToSummary),
  }, { status: 201 })
}

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null)
  const id = typeof payload?.id === "string" ? payload.id.trim() : ""

  if (!id) {
    return NextResponse.json({ error: "An automation id is required" }, { status: 400 })
  }

  const record = await patchAutomationRecord({
    id,
    name: typeof payload.name === "string" ? payload.name : undefined,
    status: payload.status === "live" || payload.status === "paused" ? payload.status : undefined,
    favorite: typeof payload.favorite === "boolean" ? payload.favorite : undefined,
    schema: isRecord(payload.schema) ? payload.schema as AutomationSchema : undefined,
  })

  if (!record) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 })
  }

  return NextResponse.json({ record, automation: automationRecordToSummary(record) })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")?.trim()

  if (!id) {
    return NextResponse.json({ error: "An automation id is required" }, { status: 400 })
  }

  const record = await deleteAutomationRecord({ id })
  if (!record) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 })
  }

  return NextResponse.json({ record, automation: automationRecordToSummary(record) })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
