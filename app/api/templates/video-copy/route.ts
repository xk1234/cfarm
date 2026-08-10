import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { getAutomationRecord } from "@/lib/automations"
import { clean, isRecord } from "@/lib/guards"
import { generateVideoCopy } from "@/lib/video-copy-generation"
import type {
  VideoCopyItem,
  VideoCopySegmentRole,
} from "@/lib/video-copy-prompt"

export const dynamic = "force-dynamic"

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const templateId = clean(payload?.templateId)
  if (!templateId) {
    return NextResponse.json(
      { error: "A template id is required" },
      { status: 400 }
    )
  }
  const record = await getAutomationRecord(templateId)
  if (!record) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 })
  }
  return NextResponse.json(
    await generateVideoCopy({
      record,
      template: clean(payload?.template),
      requestedHook: clean(payload?.hook),
      items: parseItems(payload?.items),
      segmentRoles: parseSegmentRoles(payload?.segmentRoles),
    })
  )
})

function parseItems(value: unknown): VideoCopyItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = clean(item.id)
    if (!id) return []
    return [
      {
        id,
        segmentLabel: clean(item.segmentLabel),
        guidance: clean(item.guidance),
        contentDirection: clean(item.contentDirection),
        wordLengthMin: boundedWordCount(item.wordLengthMin, 4),
        wordLengthMax: boundedWordCount(item.wordLengthMax, 12),
        count: Math.max(1, Math.min(12, boundedWordCount(item.count, 1))),
      },
    ]
  })
}

function parseSegmentRoles(value: unknown): VideoCopySegmentRole[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((segment) => {
    if (!isRecord(segment)) return []
    const id = clean(segment.id)
    const label = clean(segment.label)
    if (!id || !label) return []
    return [{ id, label, guidance: clean(segment.guidance) }]
  })
}

function boundedWordCount(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(140, Math.round(parsed))
    : fallback
}
