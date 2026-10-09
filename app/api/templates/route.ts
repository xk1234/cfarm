import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import {
  contentTemplateFromMediaRecord,
  contentTemplateFromPostRecord,
} from "@/lib/content-templates"
import {
  automationRecordToSummary,
  createLocalAutomationRecord,
  getAutomationRecord,
  listAutomationRecords,
  patchAutomationRecord,
  upsertAutomationRecords,
} from "@/lib/automations"
import { createXAutomation, listXAutomations } from "@/lib/x-automation-store"
import type {
  AutomationSchema,
  RuntimeAutomationTemplate,
} from "@/lib/realfarm-automation"
import { clean, isRecord } from "@/lib/guards"

export const dynamic = "force-dynamic"

export const GET = withHandler(async () => {
  const [media, posts] = await Promise.all([
    listAutomationRecords(),
    listXAutomations(),
  ])
  const templates = [
    ...media.map(contentTemplateFromMediaRecord),
    ...posts.map(contentTemplateFromPostRecord),
  ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  return NextResponse.json({
    templates,
    records: media,
    automations: media.map(automationRecordToSummary),
  })
})

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const name = clean(payload?.name) || undefined
  if (payload?.kind === "text" || payload?.kind === "post") {
    const record = await createXAutomation({
      name: name || "Untitled post template",
      platform: payload?.platform === "threads" ? "threads" : "x",
    })
    return NextResponse.json(
      { template: contentTemplateFromPostRecord(record) },
      { status: 201 }
    )
  }

  const kind =
    payload?.kind === "video" ||
    payload?.automationKind === "video" ||
    payload?.automationKind === "ugc"
      ? "video"
      : "slideshow"
  const record = createLocalAutomationRecord({
    name: name || `Untitled ${kind} template`,
    automationKind:
      payload?.automationKind === "ugc"
        ? "ugc"
        : kind === "video"
          ? "video"
          : undefined,
    schema: isRecord(payload?.schema)
      ? (payload.schema as AutomationSchema)
      : isRecord(payload?.editor)
        ? (payload.editor as AutomationSchema)
        : undefined,
    template: isRecord(payload?.template)
      ? (payload.template as RuntimeAutomationTemplate)
      : undefined,
    overrides: { status: "paused" },
  })
  await upsertAutomationRecords({ records: [record] })
  return NextResponse.json(
    {
      template: contentTemplateFromMediaRecord(record),
      record,
      automation: automationRecordToSummary(record),
    },
    { status: 201 }
  )
})

export const PATCH = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const id = clean(payload?.id)
  if (!id) {
    return NextResponse.json(
      { error: "A template id is required" },
      { status: 400 }
    )
  }
  const current = await getAutomationRecord(id)
  if (!current) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 })
  }
  const record = await patchAutomationRecord({
    id,
    name: clean(payload?.name) || undefined,
    favorite:
      typeof payload?.favorite === "boolean" ? payload.favorite : undefined,
    schema: isRecord(payload?.schema)
      ? (payload.schema as AutomationSchema)
      : undefined,
  })
  if (!record) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 })
  }
  return NextResponse.json({
    template: contentTemplateFromMediaRecord(record),
    record,
    automation: automationRecordToSummary(record),
  })
})
