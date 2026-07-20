import { isRecord } from "@/lib/guards"
import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import {
  automationRecordToSummary,
  createLocalAutomationRecord,
  getAutomationRecord,
  listAutomationRecords,
  patchAutomationRecord,
  upsertAutomationRecords,
} from "@/lib/automations"
import type {
  AutomationSchedule,
  AutomationSchema,
  AutomationSocialIntegration,
  AutomationStatus,
  RuntimeAutomationTemplate,
} from "@/lib/realfarm-automation"
import { automationHookItems } from "@/lib/realfarm-automation"
import { usedHookIdsForAutomation } from "@/lib/hook-publications"

export const dynamic = "force-dynamic"

export const GET = withHandler(async () => {
  const records = await listAutomationRecords()
  return NextResponse.json({
    records,
    automations: records.map(automationRecordToSummary),
  })
})

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const rawAutomations = Array.isArray(payload?.automations)
    ? payload.automations
    : Array.isArray(payload)
      ? payload
      : []
  if (rawAutomations.length > 0) {
    return NextResponse.json(
      {
        error: "Raw automation imports must use /api/automation-templates",
      },
      { status: 400 }
    )
  }

  const record = createLocalAutomationRecord({
    name: typeof payload?.name === "string" ? payload.name : undefined,
    automationKind: payload?.automationKind === "video" ? "video" : undefined,
    schema: isRecord(payload?.schema)
      ? (payload.schema as AutomationSchema)
      : undefined,
    template: isRecord(payload?.template)
      ? (payload.template as RuntimeAutomationTemplate)
      : undefined,
    overrides: isRecord(payload?.overrides)
      ? (payload.overrides as {
          status?: AutomationStatus
          social_integrations?: AutomationSocialIntegration[]
          schedule?: AutomationSchedule
        })
      : undefined,
  })
  const next = await upsertAutomationRecords({ records: [record] })

  return NextResponse.json(
    {
      record,
      automation: automationRecordToSummary(record),
      records: next,
      automations: next.map(automationRecordToSummary),
    },
    { status: 201 }
  )
})

export const PATCH = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const id = typeof payload?.id === "string" ? payload.id.trim() : ""

  if (!id) {
    return NextResponse.json(
      { error: "An automation id is required" },
      { status: 400 }
    )
  }

  if (isRecord(payload.schema)) {
    const current = await getAutomationRecord(id)
    if (!current) {
      return NextResponse.json(
        { error: "Automation not found" },
        { status: 404 }
      )
    }
    const currentItems = new Map(
      automationHookItems(current.schema).map((item) => [item.id, item])
    )
    const nextItems = new Map(
      automationHookItems(payload.schema as AutomationSchema).map((item) => [
        item.id,
        item,
      ])
    )
    const catalogIds = new Set([...currentItems.keys(), ...nextItems.keys()])
    const changedHookIds = [...catalogIds].filter((hookId) => {
      const before = currentItems.get(hookId)
      const after = nextItems.get(hookId)
      return !before || !after || before.text !== after.text
    })
    const usedIds =
      changedHookIds.length > 0
        ? await usedHookIdsForAutomation(id)
        : new Set<string>()
    const changedUsedHook = changedHookIds.find((hookId) => usedIds.has(hookId))
    if (changedUsedHook) {
      return NextResponse.json(
        {
          error:
            "Published hooks cannot be deleted or renamed. Disable the hook to prevent future use.",
          hookId: changedUsedHook,
        },
        { status: 409 }
      )
    }
  }

  const record = await patchAutomationRecord({
    id,
    name: typeof payload.name === "string" ? payload.name : undefined,
    status:
      payload.status === "live" || payload.status === "paused"
        ? payload.status
        : undefined,
    favorite:
      typeof payload.favorite === "boolean" ? payload.favorite : undefined,
    schema: isRecord(payload.schema)
      ? (payload.schema as AutomationSchema)
      : undefined,
  })

  if (!record) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 })
  }

  return NextResponse.json({
    record,
    automation: automationRecordToSummary(record),
  })
})
