"use client"

import { IconPhoto, IconPlayerPlay } from "@tabler/icons-react"

import { GeneratedVideoThumbnail } from "@/components/realfarm/generated-video-thumbnail"
import { XThreadsBrandIcon } from "@/components/realfarm/x-threads-brand-icon"
import {
  buildFormatPreviewItems,
  formatAspectRatioCss,
  previewSlideshowAspectRatio,
  previewSlideshowFont,
  previewSlideshowSlide,
} from "@/components/realfarm/automation-settings/format-helpers"
import { renderedSlideSvg } from "@/lib/slideshow-renderer"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import { findCollectionByIdOrAlias } from "@/lib/realfarm-collections"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import type { AutomationSchema, TextItem } from "@/lib/realfarm-automation"
import type { XAutomationRecord } from "@/lib/x-automation"

const TEMPLATE_PLACEHOLDER_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#797a76"/><path d="M0 1420 430 930l250 285 400-475v1180H0Z" fill="#92938e"/><circle cx="780" cy="460" r="150" fill="#a9aaa4"/></svg>'
)}`

export function TemplateDefinitionPreview({
  automation,
  config,
  collections,
  demoVideos,
  xTemplate,
  previewImageUrl,
  showGeneratedPreviewFallback = false,
  onOpen,
  actionLabel,
}: {
  automation: Automation
  config?: AutomationSchema
  collections: CreatedImageCollection[]
  demoVideos: LocalAsset[]
  xTemplate?: XAutomationRecord
  previewImageUrl?: string
  showGeneratedPreviewFallback?: boolean
  onOpen: () => void
  actionLabel?: string
}) {
  const kind =
    automation.automationKind === "x_threads"
      ? "post"
      : automation.automationKind === "video" ||
          automation.automationKind === "ugc"
        ? "video"
        : "slideshow"
  const previewAspectRatio = templatePreviewAspectRatio({
    kind,
    config,
    collections,
    useIntrinsicMediaRatio: Boolean(previewImageUrl),
  })

  return (
    <button
      type="button"
      className="relative block w-full overflow-hidden bg-app-media-empty text-left transition duration-200 outline-none hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-app-action focus-visible:ring-inset active:scale-[0.995]"
      style={
        previewAspectRatio ? { aspectRatio: previewAspectRatio } : undefined
      }
      onClick={onOpen}
      aria-label={actionLabel || `Edit ${automation.name} template`}
      data-template-preview-kind={kind}
      data-template-preview-ratio={
        previewAspectRatio ? "configured" : "intrinsic"
      }
    >
      {previewImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Starter previews can come from the external generation archive.
        <img
          src={previewImageUrl}
          alt={`${automation.name} latest generated preview`}
          className="block h-auto w-full"
          draggable={false}
          data-template-preview-media="generated"
        />
      ) : showGeneratedPreviewFallback ? (
        <TemplatePreviewPlaceholder
          icon={kind === "slideshow" ? "slideshow" : "video"}
          name={automation.name}
          message="No generation yet"
        />
      ) : kind === "slideshow" && config ? (
        <SlideshowDefinitionPreview
          config={config}
          collections={collections}
          name={automation.name}
        />
      ) : kind === "video" && config ? (
        <VideoDefinitionPreview
          config={config}
          collections={collections}
          demoVideos={demoVideos}
          name={automation.name}
        />
      ) : (
        <PostDefinitionPreview automation={automation} template={xTemplate} />
      )}
    </button>
  )
}

function templatePreviewAspectRatio({
  kind,
  config,
  collections,
  useIntrinsicMediaRatio,
}: {
  kind: "post" | "slideshow" | "video"
  config?: AutomationSchema
  collections: CreatedImageCollection[]
  useIntrinsicMediaRatio: boolean
}) {
  if (useIntrinsicMediaRatio) return undefined
  if (kind === "post") return "4 / 3"

  if (kind === "slideshow" && config) {
    const previewItem = buildFormatPreviewItems(config, collections)[0]
    if (previewItem) {
      return formatAspectRatioCss(previewSlideshowAspectRatio(previewItem))
    }
  }

  return formatAspectRatioCss(config?.aspect_ratio ?? "9:16")
}

function SlideshowDefinitionPreview({
  config,
  collections,
  name,
}: {
  config: AutomationSchema
  collections: CreatedImageCollection[]
  name: string
}) {
  const item = buildFormatPreviewItems(config, collections)[0]
  if (!item) {
    return <TemplatePreviewPlaceholder icon="slideshow" name={name} />
  }

  const slide = previewSlideshowSlide(item, 0)
  const previewSlide = {
    ...slide,
    textItems: slide.textItems.map((textItem, index) => ({
      ...textItem,
      text: templateTextPreview(
        item.textItems[index],
        `${item.tab} text${index > 0 ? ` ${index + 1}` : ""}`
      ),
    })),
  }
  const sourceUrl = item.image?.imageUrl || TEMPLATE_PLACEHOLDER_IMAGE
  const overlayUrl = previewSlide.overlayImage?.image_url
  const previewSvg = renderedSlideSvg(previewSlide, sourceUrl, overlayUrl, {
    aspectRatio: previewSlideshowAspectRatio(item),
    font: previewSlideshowFont(item),
    iconUrls: previewSlide.iconLayout?.surrounding.map(
      (icon) => icon.image_url
    ),
  }).replace("<svg ", '<svg preserveAspectRatio="xMidYMid slice" ')

  return (
    <div
      className="h-full w-full overflow-hidden bg-[#111] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
      data-template-preview-media="cover"
      role="img"
      aria-label={`${name} current slideshow template`}
      dangerouslySetInnerHTML={{ __html: previewSvg }}
    />
  )
}

function VideoDefinitionPreview({
  config,
  collections,
  demoVideos,
  name,
}: {
  config: AutomationSchema
  collections: CreatedImageCollection[]
  demoVideos: LocalAsset[]
  name: string
}) {
  const source = videoTemplateSource(config, collections, demoVideos)
  const textItem =
    config.video_format?.segments[0]?.textItems[0] ??
    config.video_format?.globalTextItems[0]
  const overlayText = templateTextPreview(textItem, "Hook text")

  return (
    <div className="relative h-full overflow-hidden bg-[#252523]">
      {source?.kind === "video" ? (
        <GeneratedVideoThumbnail videoUrl={source.url} />
      ) : source?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Template sources may be provider or user-hosted media.
        <img
          src={source.url}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <TemplatePreviewPlaceholder icon="video" name={name} />
      )}
      {source?.url && overlayText ? (
        <span className="absolute inset-x-[12%] top-1/2 -translate-y-1/2 text-center text-[15px] leading-tight font-black text-white [text-shadow:0_2px_6px_rgba(0,0,0,0.85)]">
          {overlayText}
        </span>
      ) : null}
      <span className="absolute top-3 left-3 rounded-[5px] bg-black/55 px-2 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
        {videoTemplateLabel(config)}
      </span>
    </div>
  )
}

function PostDefinitionPreview({
  automation,
  template,
}: {
  automation: Automation
  template?: XAutomationRecord
}) {
  const platform = template?.platform ?? automation.platform ?? "x"
  const niche = template?.niche.label || automation.name
  const archetype = template?.output.archetype?.replaceAll("_", " ").trim()
  const detail = [template?.output.contentType, archetype]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="flex h-full flex-col bg-[#1f1f1d] p-5 text-white">
      <div className="flex items-center justify-between">
        <XThreadsBrandIcon platform={platform} className="size-5" />
        <span className="text-[10px] font-semibold tracking-[0.12em] text-white/45 uppercase">
          {template?.generation.voicePreset || "Post template"}
        </span>
      </div>
      <p className="mt-auto max-w-[28ch] text-[18px] leading-[1.15] font-bold text-pretty">
        {niche}
      </p>
      <p className="mt-2 text-[11px] font-medium text-white/52">
        {detail || "Reusable post structure"}
      </p>
    </div>
  )
}

function TemplatePreviewPlaceholder({
  icon,
  name,
  message = "Add media in the editor",
}: {
  icon: "slideshow" | "video"
  name: string
  message?: string
}) {
  return (
    <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_35%_28%,#777873_0,#4d4e4b_38%,#2d2e2c_100%)] px-8 text-center text-white">
      <div>
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-white/12">
          {icon === "video" ? (
            <IconPlayerPlay className="size-5" />
          ) : (
            <IconPhoto className="size-5" />
          )}
        </span>
        <span className="mt-3 block text-[14px] font-bold">{name}</span>
        <span className="mt-1 block text-[11px] font-medium text-white/55">
          {message}
        </span>
      </div>
    </div>
  )
}

function videoTemplateSource(
  config: AutomationSchema,
  collections: CreatedImageCollection[],
  demoVideos: LocalAsset[]
) {
  if (config.automationKind === "ugc" && config.ugc?.actorAssetUrl) {
    return {
      url: config.ugc.actorAssetUrl,
      kind: isVideoUrl(config.ugc.actorAssetUrl) ? "video" : "image",
    } as const
  }

  const segment = config.video_format?.segments[0]
  if (!segment) return null
  if (segment.mediaSource === "demo_asset") {
    const asset = demoVideos.find((item) => item.id === segment.demoAssetId)
    return asset?.url ? ({ url: asset.url, kind: "video" } as const) : null
  }
  if (segment.mediaSource !== "collection") return null

  const collection = findCollectionByIdOrAlias(
    collections,
    segment.collectionId
  )
  const media = collection?.images[0]
  if (!media?.imageUrl) return null
  return {
    url: media.imageUrl,
    kind:
      segment.mediaKind === "video" || isVideoUrl(media.imageUrl)
        ? "video"
        : "image",
  } as const
}

function videoTemplateLabel(config: AutomationSchema) {
  if (config.automationKind === "ugc") return "UGC actor"
  return (config.video_format?.template || "video")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isVideoUrl(url: string) {
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url)
}

function templateTextPreview(textItem: TextItem | undefined, fallback: string) {
  if (textItem?.textMode === "static") {
    const staticText = (textItem.staticText || textItem.text || "").trim()
    if (staticText) return staticText
  }
  return fallback
}
