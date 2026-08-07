import { isRecord } from "@/lib/guards"
import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import {
  listUnifiedTemplateRecords,
  reelfarmAutomationToTemplateRecord,
} from "@/lib/automation-templates"
import {
  automationCollectionInventory,
  automationGenerationBlockers,
} from "@/lib/automation-readiness"
import {
  automationRecordToSummary,
  type AutomationRecord,
  createLocalAutomationRecord,
  getAutomationRecord,
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
  const records = await listUnifiedTemplateRecords()
  const readyRecords = await reconcileAutomationReadiness(records)
  return NextResponse.json({
    records: readyRecords.map(({ record }) => record),
    templates: readyRecords.map(automationWithBlockers),
  })
})

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const rawTemplates: unknown[] = Array.isArray(payload?.templates)
    ? payload.templates
    : Array.isArray(payload)
      ? payload
      : []
  if (rawTemplates.length > 0) {
    const imported = rawTemplates
      .filter(Boolean)
      .map((raw) => reelfarmAutomationToTemplateRecord(raw))
    const next = await upsertAutomationRecords({ records: imported })
    const readyRecords = await reconcileAutomationReadiness(next)
    return NextResponse.json(
      {
        records: readyRecords.map(({ record }) => record),
        templates: readyRecords.map(automationWithBlockers),
        imported: imported.length,
      },
      { status: 201 }
    )
  }

  const record = createLocalAutomationRecord({
    name: typeof payload?.name === "string" ? payload.name : undefined,
    automationKind:
      payload?.kind === "video" || payload?.kind === "ugc"
        ? payload.kind
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
      template: automationWithBlockers(created),
      records: readyRecords.map((item) => item.record),
      templates: readyRecords.map(automationWithBlockers),
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
    hidden: typeof payload.hidden === "boolean" ? payload.hidden : undefined,
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
    template: automationWithBlockers(ready),
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
