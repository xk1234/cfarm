import { isRecord } from "@/lib/guards"
import { NextResponse } from "next/server"

import {
  automationRecordToSummary,
  createLocalAutomationRecord,
  deleteAutomationRecord,
  listAutomationRecords,
  patchAutomationRecord,
  upsertAutomationRecords,
} from "@/lib/automations"
import {
  deleteAutomationRuns,
  listAutomationRuns,
} from "@/lib/automation-runner"
import { deletePostFastPostRecords } from "@/lib/postfast-posts"
import type {
  AutomationSchedule,
  AutomationSchema,
  AutomationSocialIntegration,
  AutomationStatus,
  AutomationTemplate,
} from "@/lib/realfarm-automation"
import { deleteSlideshowRecordsForAutomation } from "@/lib/slideshows"

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
      ? (payload.template as AutomationTemplate)
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
}

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null)
  const id = typeof payload?.id === "string" ? payload.id.trim() : ""

  if (!id) {
    return NextResponse.json(
      { error: "An automation id is required" },
      { status: 400 }
    )
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
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")?.trim()

  if (!id) {
    return NextResponse.json(
      { error: "An automation id is required" },
      { status: 400 }
    )
  }

  const record = await deleteAutomationRecord({ id })
  if (!record) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 })
  }
  const automationRuns = await listAutomationRuns({
    automationId: id,
    limit: Number.MAX_SAFE_INTEGER,
  })
  const deletedSlideshows = await deleteSlideshowRecordsForAutomation({
    automationId: id,
    slideshowIds: automationRuns
      .map((run) => run.slideshowId)
      .filter((slideshowId): slideshowId is string => Boolean(slideshowId)),
  })
  const slideshowIds = new Set(
    [
      ...automationRuns
        .map((run) => run.slideshowId)
        .filter((slideshowId): slideshowId is string => Boolean(slideshowId)),
      ...deletedSlideshows.map((slideshow) => slideshow.id),
    ].filter(Boolean)
  )
  const deletedPostFastSlideshowPosts = await deletePostFastPostRecords({
    sourceType: "slideshow",
    sourceIds: [...slideshowIds],
  })
  const deletedPostFastAutomationPosts = await deletePostFastPostRecords({
    sourceType: "automation",
    sourceIds: automationRuns.map((run) => run.id),
  })
  const deletedRuns = await deleteAutomationRuns({
    automationId: id,
    slideshowIds: [...slideshowIds],
  })

  return NextResponse.json({
    record,
    automation: automationRecordToSummary(record),
    deletedSlideshows,
    deletedSlideshowsCount: deletedSlideshows.length,
    deletedResultsCount: deletedSlideshows.length,
    deletedRuns,
    deletedRunsCount: deletedRuns.length,
    deletedPostFastPosts: [
      ...deletedPostFastSlideshowPosts,
      ...deletedPostFastAutomationPosts,
    ],
    deletedPostFastPostsCount:
      deletedPostFastSlideshowPosts.length +
      deletedPostFastAutomationPosts.length,
  })
}

