import { NextResponse } from "next/server"

import {
  createGeneratedVideoExport,
  deleteGeneratedVideoExport,
  isGeneratedVideoType,
  listGeneratedVideoExports,
  updateGeneratedVideoExport,
  type GeneratedVideoStatus,
} from "@/lib/generated-videos"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawType = searchParams.get("type")
  const exports = await listGeneratedVideoExports({
    type: isGeneratedVideoType(rawType) ? rawType : undefined,
  })

  return NextResponse.json({ exports })
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)

  if (!payload || !isGeneratedVideoType(payload.type)) {
    return NextResponse.json({ error: "A valid generated video type is required" }, { status: 400 })
  }

  const videoUrl = stringValue(payload.videoUrl)
  const requestedStatus = isGeneratedVideoStatus(payload.status) ? payload.status : undefined
  const generatedExport = await createGeneratedVideoExport({
    type: payload.type,
    status: videoUrl ? "ready" : requestedStatus ?? "queued",
    title: stringValue(payload.title),
    caption: stringValue(payload.caption),
    sourceConfig: recordValue(payload.sourceConfig),
    previewUrl: stringValue(payload.previewUrl),
    videoUrl,
  })

  return NextResponse.json({ export: generatedExport }, { status: 201 })
}

export async function PATCH(request: Request) {
  const payload = await request.json().catch(() => null)

  if (!payload?.id || !isGeneratedVideoStatus(payload.status)) {
    return NextResponse.json({ error: "A valid export id and status are required" }, { status: 400 })
  }

  const generatedExport = await updateGeneratedVideoExport({
    id: String(payload.id),
    status: payload.status,
    previewUrl: stringValue(payload.previewUrl),
    videoUrl: stringValue(payload.videoUrl),
    error: stringValue(payload.error),
  })

  if (!generatedExport) {
    return NextResponse.json({ error: "Generated video export not found" }, { status: 404 })
  }

  return NextResponse.json({ export: generatedExport })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")?.trim()

  if (!id) {
    return NextResponse.json({ error: "A generated video export id is required" }, { status: 400 })
  }

  const generatedExport = await deleteGeneratedVideoExport({ id })

  if (!generatedExport) {
    return NextResponse.json({ error: "Generated video export not found" }, { status: 404 })
  }

  return NextResponse.json({ export: generatedExport })
}

function isGeneratedVideoStatus(value: unknown): value is GeneratedVideoStatus {
  return value === "queued" || value === "processing" || value === "ready" || value === "failed"
}

function recordValue(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined
}
