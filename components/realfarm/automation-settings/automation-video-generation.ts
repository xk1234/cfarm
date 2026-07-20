"use client"

import {
  renderAndUploadGreenscreenVideo,
  renderAndUploadTemplateVideo,
  renderAndUploadUgcAdVideo,
  type TemplateVideoText,
} from "@/components/realfarm/generated-video-renderer"
import {
  createGeneratedVideoExportRecord,
  updateGeneratedVideoExportRecord,
} from "@/components/realfarm/generated-video-workflow"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { GeneratedVideoExport } from "@/lib/generated-video-types"
import {
  automationCollectionId,
  automationFormatSection,
  automationHooks,
  defaultAutomationTextItem,
  type AutomationSchema,
  type AutomationTextItem,
  type AutomationVideoFormat,
} from "@/lib/realfarm-automation"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import {
  videoAutomationTemplatePreset,
  videoSegmentPlaysFull,
} from "@/lib/video-automation-templates"

import { pickRandomHook, textPlacementFromItem } from "./video-format-helpers"

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
  const format =
    input.config.video_format ??
    videoAutomationTemplatePreset("ugc_ad").buildFormat()

  return format.template === "ugc_ad"
    ? generateUgcAdVideo(input)
    : format.template === "greenscreen_meme"
      ? generateGreenscreenMemeVideo(input, format)
      : generateTemplateVideo(input, format)
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

async function generateUgcAdVideo(input: AutomationVideoGenerationInput) {
  const avatarCollection = resolveMediaCollection(
    input.collections,
    automationCollectionId(input.config, "content"),
    "video"
  )
  const avatarVideoUrl = avatarCollection?.images[0]?.imageUrl
  if (!avatarVideoUrl) {
    throw new Error(
      "Choose or create a video collection with at least one video before generating."
    )
  }

  const hooks = automationHooks(input.config)
  const hook = pickRandomHook(
    hooks,
    input.config.title || input.automation.name
  )
  const format =
    input.config.video_format ??
    videoAutomationTemplatePreset("ugc_ad").buildFormat()
  const hookSection = automationFormatSection(input.config, "hook")
  const hookTextItems =
    hookSection.textItems.length > 0
      ? hookSection.textItems
      : [
          defaultAutomationTextItem({
            contentDirection: "hook overlay text for the generated video",
            fontSize: "8px",
            textItemWidth: "70%",
          }),
        ]
  const activeDemoVideo =
    input.demoVideos.find(
      (video) =>
        video.id === input.config.image_collection_ids.video_demo_asset_id
    ) ?? input.demoVideos[0]
  const sound = selectedAutomationSound(input)
  const textPlacement = textPlacementFromItem(hookTextItems[0])
  const copy = await requestVideoCopy(input.automation.id, format, hook)
  let exportRecord: GeneratedVideoExport | null = null

  try {
    exportRecord = await createGeneratedVideoExportRecord(
      {
        type: "ugc_ad",
        status: "processing",
        title: copy.title || hook,
        description: copy.caption || hook,
        hashtags: copy.hashtags,
        caption: copy.caption || hook,
        sourceConfig: {
          automationId: input.automation.id,
          automationName: input.automation.name,
          hook,
          avatarCollectionId: avatarCollection.id,
          avatarVideoUrl,
          demoVideoId: activeDemoVideo?.id,
          demoVideoUrl: activeDemoVideo?.url,
          sound,
          textPlacement,
          hookTextItems,
        },
      },
      "Failed to create AI UGC ad export"
    )
    input.onExportUpdate?.(exportRecord)

    const rendered = await renderAndUploadUgcAdVideo({
      hook,
      avatarVideoUrl,
      demoVideoUrl: activeDemoVideo?.url ?? null,
      soundUrl: sound?.url,
      textPlacement,
      textItems: hookTextItems,
    })
    const ready = await updateGeneratedVideoExportRecord(
      exportRecord.id,
      {
        status: "ready",
        previewUrl: rendered.thumbnailUrl,
        videoUrl: rendered.videoUrl,
      },
      "Failed to update AI UGC ad export"
    )
    input.onExportUpdate?.(ready)
    return ready
  } catch (error) {
    await markFailedExport(exportRecord, error, input.onExportUpdate)
    throw error
  }
}

async function generateTemplateVideo(
  input: AutomationVideoGenerationInput,
  format: AutomationVideoFormat
) {
  const hooks = automationHooks(input.config)
  const hookItemId = templateHookTextItemId(format)
  const copy = await requestVideoCopy(input.automation.id, format)
  const hook =
    copy.hook ||
    pickRandomHook(hooks, input.config.title || input.automation.name)
  const resolved = await resolveSegmentsMedia(
    format,
    input.collections,
    input.demoVideos,
    Object.values(copy.substitutions)
  )
  const globalTexts = resolveTexts(
    format.globalTextItems,
    hookItemId,
    hook,
    copy.texts
  )
  const segments = resolved.map(({ segment, clips }) => ({
    clips: clips.map((clip, clipIndex) => ({
      ...clip,
      texts: resolveTexts(
        segment.textItems,
        hookItemId,
        hook,
        copy.texts,
        clipIndex
      ),
    })),
    clipDurationMs: segment.clipDurationMs,
    playFullVideo: videoSegmentPlaysFull(format, segment),
    transition: segment.transition,
    texts: resolveTexts(segment.textItems, hookItemId, hook, copy.texts),
  }))
  const sound = selectedAutomationSound(input)
  let exportRecord: GeneratedVideoExport | null = null

  try {
    exportRecord = await createGeneratedVideoExportRecord(
      {
        type: "template_video",
        status: "processing",
        title: copy.title || hook,
        description: copy.caption || hook,
        hashtags: copy.hashtags,
        caption: copy.caption || hook,
        sourceConfig: {
          automationId: input.automation.id,
          automationName: input.automation.name,
          template: format.template,
          hook,
          sound,
        },
      },
      "Failed to create video template export"
    )
    input.onExportUpdate?.(exportRecord)

    const rendered = await renderAndUploadTemplateVideo({
      templateId: format.template,
      segments,
      globalTexts,
      soundUrl: sound?.url,
    })
    const ready = await updateGeneratedVideoExportRecord(
      exportRecord.id,
      {
        status: "ready",
        previewUrl: rendered.thumbnailUrl,
        videoUrl: rendered.videoUrl,
      },
      "Failed to update video template export"
    )
    input.onExportUpdate?.(ready)
    return ready
  } catch (error) {
    await markFailedExport(exportRecord, error, input.onExportUpdate)
    throw error
  }
}

async function generateGreenscreenMemeVideo(
  input: AutomationVideoGenerationInput,
  format: AutomationVideoFormat
) {
  const memeSegment = format.segments.find(
    (segment) => segment.id === "greenscreen-meme"
  )
  const backgroundSegment = format.segments.find(
    (segment) => segment.id === "greenscreen-background"
  )
  const memeCollection = memeSegment
    ? resolveMediaCollection(
        input.collections,
        memeSegment.collectionId,
        "video"
      )
    : undefined
  const backgroundCollection = backgroundSegment
    ? resolveMediaCollection(
        input.collections,
        backgroundSegment.collectionId,
        "image"
      )
    : undefined
  const meme = sampleItems(memeCollection?.images ?? [], 1)[0]
  const background = sampleItems(backgroundCollection?.images ?? [], 1)[0]
  if (!meme) {
    throw new Error(
      "Choose a greenscreen meme video collection before generating."
    )
  }
  if (!background) {
    throw new Error("Choose a background image collection before generating.")
  }

  const selectedHook = pickRandomHook(
    automationHooks(input.config),
    input.config.title || input.automation.name
  )
  const copy = await requestVideoCopy(input.automation.id, format, selectedHook)
  const hook = copy.hook || selectedHook
  const sound = selectedAutomationSound(input)
  const hookTextItem = format.globalTextItems[0]
  const textPlacement = textPlacementFromItem(
    hookTextItem ?? defaultAutomationTextItem()
  )
  let exportRecord: GeneratedVideoExport | null = null

  try {
    exportRecord = await createGeneratedVideoExportRecord(
      {
        type: "greenscreen",
        status: "processing",
        title: copy.title || hook,
        description: copy.caption || hook,
        hashtags: copy.hashtags,
        caption: copy.caption || hook,
        sourceConfig: {
          automationId: input.automation.id,
          automationName: input.automation.name,
          template: format.template,
          hook,
          memeCollectionId: memeCollection?.id,
          memeUrl: meme.imageUrl,
          backgroundCollectionId: backgroundCollection?.id,
          backgroundImageUrl: background.imageUrl,
          sound,
          textPlacement,
        },
      },
      "Failed to create greenscreen meme export"
    )
    input.onExportUpdate?.(exportRecord)

    const rendered = await renderAndUploadGreenscreenVideo({
      caption: hook,
      memeUrl: meme.imageUrl,
      backgroundImageUrl: background.imageUrl,
      soundUrl: sound?.url,
      textPlacement,
    })
    const ready = await updateGeneratedVideoExportRecord(
      exportRecord.id,
      {
        status: "ready",
        previewUrl: rendered.thumbnailUrl,
        videoUrl: rendered.videoUrl,
      },
      "Failed to update greenscreen meme export"
    )
    input.onExportUpdate?.(ready)
    return ready
  } catch (error) {
    await markFailedExport(exportRecord, error, input.onExportUpdate)
    throw error
  }
}

function selectedAutomationSound(input: AutomationVideoGenerationInput) {
  const soundId = input.config.tiktok_post_settings.slideshow_sound_id
  return (
    input.music.find((sound) => sound.id === soundId) ??
    (input.selectedSound?.id === soundId ? input.selectedSound : null)
  )
}

async function markFailedExport(
  exportRecord: GeneratedVideoExport | null,
  error: unknown,
  onExportUpdate?: (item: GeneratedVideoExport) => void
) {
  if (!exportRecord) return
  const failed = await updateGeneratedVideoExportRecord(
    exportRecord.id,
    {
      status: "failed",
      error: getApiErrorMessage(error, "Failed to create video"),
    },
    "Failed to update generated video export"
  ).catch(() => null)
  if (failed) onExportUpdate?.(failed)
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

function templateHookTextItemId(format: AutomationVideoFormat) {
  if (format.hookPlacement === "global") {
    return format.globalTextItems[0]?.id ?? ""
  }
  return format.segments[0]?.textItems[0]?.id ?? ""
}

async function resolveSegmentsMedia(
  format: AutomationVideoFormat,
  collections: CreatedImageCollection[],
  demoVideos: LocalAsset[],
  hookSubstitutions: string[]
) {
  return Promise.all(
    format.segments.map(async (segment) => {
      if (segment.mediaSource === "slideshow_automation") {
        const automationId = segment.slideshowAutomationId?.trim()
        if (!automationId) {
          throw new Error(`Choose a slides automation for "${segment.label}"`)
        }
        const payload = await fetchJsonWithTimeout<{
          created?: Array<{
            renderedSlides?: Array<{ imageUrl?: string }>
            outputImages?: string[]
          }>
        }>("/api/automations/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          timeoutMs: 180_000,
          body: JSON.stringify({ automationId, force: true }),
        })
        const run = payload.created?.[0]
        const slideUrls = [
          ...(run?.renderedSlides ?? []).flatMap((slide) =>
            slide.imageUrl ? [slide.imageUrl] : []
          ),
          ...(run?.outputImages ?? []),
        ].filter((url, index, urls) => urls.indexOf(url) === index)
        if (slideUrls.length === 0) {
          throw new Error(
            `The slides automation for "${segment.label}" did not render any slides`
          )
        }
        return {
          segment,
          clips: slideUrls.slice(0, segment.clipCount).map((url) => ({
            url,
            kind: "image" as const,
          })),
        }
      }

      if (segment.mediaSource === "demo_asset") {
        const demo = demoVideos.find(
          (video) => video.id === segment.demoAssetId
        )
        if (!demo) throw new Error(`Choose a demo video for "${segment.label}"`)
        return { segment, clips: [{ url: demo.url, kind: "video" as const }] }
      }

      const collection = resolveMediaCollection(
        collections,
        segment.collectionId,
        segment.mediaKind
      )
      const media = collection?.images ?? []
      if (media.length === 0) {
        throw new Error(
          `Choose a ${segment.mediaKind} collection for "${segment.label}"`
        )
      }
      const matching = media.filter((item) =>
        hookSubstitutions.some((value) =>
          `${item.title ?? ""} ${item.description ?? ""}`
            .toLowerCase()
            .includes(value.toLowerCase())
        )
      )
      const playFullVideo = videoSegmentPlaysFull(format, segment)
      const clipCount = playFullVideo ? 1 : segment.clipCount
      const pool = matching.length >= clipCount ? matching : media
      return {
        segment,
        clips: sampleItems(pool, clipCount).map((item) => ({
          url: item.imageUrl,
          kind: segment.mediaKind,
        })),
      }
    })
  )
}

function sampleItems<T>(items: T[], count: number) {
  const shuffled = [...items].sort(() => Math.random() - 0.5)
  return Array.from(
    { length: count },
    (_, index) => shuffled[index % shuffled.length]
  )
}

async function requestVideoCopy(
  automationId: string,
  format: AutomationVideoFormat,
  hook?: string
) {
  const items = [
    ...format.globalTextItems.map((item) => ({
      item,
      segmentLabel: "Persistent text",
      guidance: "",
      count: 1,
    })),
    ...format.segments.flatMap((segment) =>
      segment.textItems.map((item) => ({
        item,
        segmentLabel: segment.label,
        guidance: segment.guidance,
        count:
          segment.mediaSource !== "demo_asset" &&
          !videoSegmentPlaysFull(format, segment)
            ? segment.clipCount
            : 1,
      }))
    ),
  ]
    .filter(
      ({ item }) => item.textMode !== "static" && Boolean(item.contentDirection)
    )
    .map(({ item, segmentLabel, guidance, count }) => ({
      id: item.id,
      segmentLabel,
      guidance,
      contentDirection: item.contentDirection,
      wordLengthMin: item.wordLengthMin,
      wordLengthMax: item.wordLengthMax,
      count,
    }))

  return fetchJsonWithTimeout<{
    hook?: string
    title?: string
    caption?: string
    /** Compatibility with video-copy responses from before the shared schema. */
    description?: string
    hashtags?: string[]
    substitutions?: Record<string, string>
    texts?: Record<string, string | string[]>
  }>("/api/automations/video-copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeoutMs: 60_000,
    toastOnError: false,
    body: JSON.stringify({
      automationId,
      template: format.template,
      hook,
      segmentRoles: format.segments.map((segment) => ({
        id: segment.id,
        label: segment.label,
        guidance: segment.guidance,
      })),
      items,
    }),
  }).then((payload) => ({
    hook: payload.hook ?? "",
    title: payload.title ?? "",
    caption: payload.caption ?? payload.description ?? "",
    hashtags: payload.hashtags ?? [],
    substitutions: payload.substitutions ?? {},
    texts: payload.texts ?? {},
  }))
}

function resolveTexts(
  items: AutomationTextItem[],
  hookItemId: string,
  hook: string,
  generated: Record<string, string | string[]>,
  clipIndex = 0
): TemplateVideoText[] {
  return items.map((item) => ({
    ...item,
    text:
      item.textMode === "static" && item.staticText
        ? item.staticText
        : generatedTextAt(generated[item.id], clipIndex) ||
          (item.id === hookItemId ? hook : item.contentDirection) ||
          "",
  }))
}

function generatedTextAt(
  value: string | string[] | undefined,
  clipIndex: number
) {
  if (Array.isArray(value)) {
    return value[clipIndex % value.length] ?? value[0] ?? ""
  }
  return value ?? ""
}
