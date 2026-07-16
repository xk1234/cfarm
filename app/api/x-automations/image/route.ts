import path from "node:path"
import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { buildNanoBananaProPayload } from "@/lib/character-workflows"
import { clean } from "@/lib/guards"
import {
  downloadRemoteImageToLocalAsset,
  getKieApiKey,
  runKieMarketTask,
} from "@/lib/kie-image"
import {
  getXAutomationRun,
  upsertXAutomationRun,
} from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const runId = clean(payload?.runId)
  const run = await getXAutomationRun(runId)
  if (!run) throw new ApiError(404, "X automation run not found")
  const prompt = clean(payload?.prompt) || clean(run.imagePrompt)
  if (!prompt) throw new ApiError(400, "An image prompt is required")
  const apiKey = getKieApiKey()
  if (!apiKey) throw new ApiError(503, "KIE_KEY is not configured")
  const { taskId, url } = await runKieMarketTask({
    apiKey,
    body: buildNanoBananaProPayload({
      prompt,
      imageUrls: [],
      aspectRatio: allowedRatio(payload?.aspectRatio),
    }),
    pollLimit: 80,
    pollDelayMs: 3_000,
  })
  const imageUrl = await downloadRemoteImageToLocalAsset({
    imageUrl: url,
    taskId,
    folder: path.join(process.cwd(), "data", "x-automations", "images"),
    publicPrefix: "/api/local-assets/x-automations/images",
    fallbackName: "x-post-image",
    failureMessage: "Failed to save generated X image",
  })
  const updated = {
    ...run,
    imageUrls: [...run.imageUrls, imageUrl].slice(0, 4),
    updatedAt: new Date().toISOString(),
  }
  await upsertXAutomationRun(updated)
  return NextResponse.json({ run: updated, imageUrl }, { status: 201 })
})

function allowedRatio(value: unknown) {
  return value === "1:1" || value === "4:5" || value === "16:9" ? value : "16:9"
}
