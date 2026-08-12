"use client"

import { queueWorkflowAndWait } from "@/lib/client-api"
import type { GeneratedVideoExport } from "@/lib/generated-video-types"
import {
  automationCollectionId,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import { videoAutomationTemplatePreset } from "@/lib/video-automation-templates"

export type AutomationVideoGenerationInput = {
  automation: Automation
  config: AutomationSchema
  collections: CreatedImageCollection[]
  demoVideos: LocalAsset[]
  music: LocalAsset[]
  selectedSound: LocalAsset | null
  onExportUpdate?: (item: GeneratedVideoExport) => void
}

export async function generateAutomationVideo(
  input: AutomationVideoGenerationInput
) {
  const payload = await queueWorkflowAndWait<{
    export?: GeneratedVideoExport
  }>("/api/templates/video-generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeoutMs: 25 * 60_000,
    toastOnError: false,
    body: JSON.stringify({
      templateId: input.automation.id,
      requestId: crypto.randomUUID(),
    }),
  })
  if (!payload.export) {
    throw new Error("Windmill completed without a generated video output")
  }
  input.onExportUpdate?.(payload.export)
  return payload.export
}

export function automationVideoGenerationIssue(
  config: AutomationSchema,
  collections: CreatedImageCollection[],
  demoVideos: LocalAsset[]
) {
  const format =
    config.video_format ?? videoAutomationTemplatePreset("ugc_ad").buildFormat()

  if (format.template === "ugc_ad") {
    return resolveMediaCollection(
      collections,
      automationCollectionId(config, "content"),
      "video"
    )
      ? undefined
      : "Choose or create a video collection with at least one video before generating."
  }

  for (const segment of format.segments) {
    if (segment.mediaSource === "demo_asset") {
      if (!demoVideos.find((video) => video.id === segment.demoAssetId)) {
        return `Choose a demo video for "${segment.label}" before generating.`
      }
      continue
    }
    if (
      !resolveMediaCollection(
        collections,
        segment.collectionId,
        segment.mediaKind
      )
    ) {
      return `Choose or create a ${segment.mediaKind} collection for "${segment.label}" before generating.`
    }
  }

  return undefined
}

export function resolveMediaCollection(
  collections: CreatedImageCollection[],
  collectionId: string,
  mediaKind: "video" | "image"
) {
  const selected = findCollectionByIdOrAlias(collections, collectionId)
  if (selected?.images.length && collectionMatchesMedia(selected, mediaKind)) {
    return selected
  }
  return undefined
}

function collectionMatchesMedia(
  collection: CreatedImageCollection,
  mediaKind: "video" | "image"
) {
  return mediaKind === "video"
    ? collection.mediaType === "video"
    : collection.mediaType !== "video"
}
