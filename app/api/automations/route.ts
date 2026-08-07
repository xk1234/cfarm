import { isRecord } from "@/lib/guards"
import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import {
  automationCollectionInventory,
  automationGenerationBlockers,
} from "@/lib/automation-readiness"
import {
  automationRecordToSummary,
  type AutomationRecord,
  createLocalAutomationRecord,
  getAutomationRecord,
  listAutomationRecords,
  patchAutomationRecord,
  upsertAutomationRecords,
} from "@/lib/automations"
import { listImageCollections } from "@/lib/image-collections"
import type {
  AutomationSchedule,
  AutomationSchema,
  AutomationSocialIntegration,
  AutomationStatus,
  RuntimeAutomationTemplate,
} from "@/lib/realfarm-automation"
import { automationHookItems } from "@/lib/realfarm-automation"
import { ugcLiveConfigurationErrors } from "@/lib/realfarm-automation"
import { usedHookIdsForAutomation } from "@/lib/hook-publications"
import { listWordCollections } from "@/lib/word-collections"

export const dynamic = "force-dynamic"

export const GET = withHandler(async () => {
  const records = await listAutomationRecords()
  const readyRecords = await reconcileAutomationReadiness(records)
  return NextResponse.json({
    records: readyRecords.map(({ record }) => record),
    automations: readyRecords.map(automationWithBlockers),
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
    automationKind:
      payload?.automationKind === "video" || payload?.automationKind === "ugc"
        ? payload.automationKind
        : undefined,
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
  const readyRecords = await reconcileAutomationReadiness(next)
  const created =
    readyRecords.find((item) => item.record.id === record.id) ?? readyRecords[0]

  return NextResponse.json(
    {
      record: created.record,
      automation: automationWithBlockers(created),
      records: readyRecords.map((item) => item.record),
      automations: readyRecords.map(automationWithBlockers),
    },
    { status: 201 }
  )
})

export const PATCH = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const id = typeof payload?.id === "string" ? payload.id.trim() : ""

  if (!id) {
    return NextResponse.json(
      { error: "A template id is required" },
      { status: 400 }
    )
  }

  if (isRecord(payload.schema)) {
    const current = await getAutomationRecord(id)
    if (!current) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
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

  if (isRecord(payload.schema)) {
    const errors = ugcLiveConfigurationErrors(
      payload.status === "paused" ? "paused" : "live",
      payload.schema as AutomationSchema
    )
    if (errors.length)
      return NextResponse.json({ error: errors[0], errors }, { status: 400 })
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
    return NextResponse.json({ error: "Template not found" }, { status: 404 })
  }

  const [ready] = await reconcileAutomationReadiness([record])
  return NextResponse.json({
    record: ready.record,
    automation: automationWithBlockers(ready),
  })
})

type AutomationReadinessResult = {
  record: AutomationRecord
  blockers: ReturnType<typeof automationGenerationBlockers>
}

async function reconcileAutomationReadiness(
  records: AutomationRecord[]
): Promise<AutomationReadinessResult[]> {
  const [storedCollections, wordCollections] = await Promise.all([
    listImageCollections(),
    listWordCollections(),
  ])
  const collections = automationCollectionInventory(storedCollections)

  return Promise.all(
    records.map(async (record) => {
      const blockers = automationGenerationBlockers({
        schema: record.schema,
        collections,
        wordCollections,
      })
      if (blockers.length === 0 || record.status === "paused") {
        return { record, blockers }
      }
      const paused =
        (await patchAutomationRecord({
          id: record.id,
          status: "paused",
          schema: {
            ...record.schema,
            schedule: {
              ...record.schema.schedule,
              paused: true,
            },
          },
        })) ?? record
      return { record: paused, blockers }
    })
  )
}

function automationWithBlockers({
  record,
  blockers,
}: AutomationReadinessResult) {
  return {
    ...automationRecordToSummary(record),
    generationBlockers: blockers.map((blocker) => blocker.message),
  }
}
