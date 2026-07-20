import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import {
  createGeneratedVideoExport,
  isGeneratedVideoType,
  listGeneratedVideoExports,
  updateGeneratedVideoExport,
  type GeneratedVideoStatus,
} from "@/lib/generated-videos"
import { generatedVideoDeletionBlockReason } from "@/lib/generated-video-deletion"
import { listPostFastPostRecords } from "@/lib/postfast-posts"
import { enqueueReminder } from "@/lib/reminders"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const rawType = searchParams.get("type")
  const automationId = searchParams.get("automationId")?.trim() || undefined
  const rawLimit = Number(searchParams.get("limit"))
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined
  const [exports, posts] = await Promise.all([
    listGeneratedVideoExports({
      type: isGeneratedVideoType(rawType) ? rawType : undefined,
      automationId,
      limit,
    }),
    listPostFastPostRecords(),
  ])

  return NextResponse.json({
    exports: exports.map((item) => ({
      ...item,
      deletionBlockedBy:
        (item.manuallyPublishedAt
          ? "published"
          : generatedVideoDeletionBlockReason(item.id, posts)) ?? undefined,
    })),
  })
})

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)

  if (!payload || !isGeneratedVideoType(payload.type)) {
    return NextResponse.json(
      { error: "A valid generated video type is required" },
      { status: 400 }
    )
  }

  const videoUrl = stringValue(payload.videoUrl)
  const requestedStatus = isGeneratedVideoStatus(payload.status)
    ? payload.status
    : undefined
  const generatedExport = await createGeneratedVideoExport({
    type: payload.type,
    status: videoUrl ? "ready" : (requestedStatus ?? "queued"),
    title: stringValue(payload.title),
    description: stringValue(payload.description),
    hashtags: stringArrayValue(payload.hashtags),
    caption: stringValue(payload.caption),
    sourceConfig: recordValue(payload.sourceConfig),
    previewUrl: stringValue(payload.previewUrl),
    videoUrl,
  })
  if (generatedExport.status === "ready") {
    await enqueueGeneratedVideoReminder(
      generatedExport.id,
      generatedExport.title
    )
  }

  return NextResponse.json({ export: generatedExport }, { status: 201 })
})

export const PATCH = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)

  if (!payload?.id || !isGeneratedVideoStatus(payload.status)) {
    return NextResponse.json(
      { error: "A valid export id and status are required" },
      { status: 400 }
    )
  }

  const generatedExport = await updateGeneratedVideoExport({
    id: String(payload.id),
    status: payload.status,
    previewUrl: stringValue(payload.previewUrl),
    videoUrl: stringValue(payload.videoUrl),
    error: stringValue(payload.error),
  })

  if (!generatedExport) {
    return NextResponse.json(
      { error: "Generated video export not found" },
      { status: 404 }
    )
  }
  if (generatedExport.status === "ready") {
    await enqueueGeneratedVideoReminder(
      generatedExport.id,
      generatedExport.title
    )
  }

  return NextResponse.json({ export: generatedExport })
})

async function enqueueGeneratedVideoReminder(id: string, title: string) {
  await enqueueReminder({
    event: "generated",
    sourceType: "video",
    sourceId: id,
    text: `Video generated\n${title}`,
  }).catch(() => undefined)
}

function isGeneratedVideoStatus(value: unknown): value is GeneratedVideoStatus {
  return (
    value === "queued" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed"
  )
}

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((item): item is string => Boolean(item))
    : typeof value === "string"
      ? value
          .split(/\s+/)
          .map(stringValue)
          .filter((item): item is string => Boolean(item))
      : []
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}
