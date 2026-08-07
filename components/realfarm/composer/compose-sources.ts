import type { PreviewMedia } from "@/components/realfarm/previews/platform-preview"

import type { ComposerSourceOutput, ComposerValue } from "./composer-types"

export type TemplateOutputRun = {
  id: string
  automationId: string
  automationTitle?: string
  status?: string
  createdAt: string
  videoUrl?: string
  thumbnailUrl?: string
  outputImages?: string[]
  renderedSlides?: Array<{
    imageUrl?: string
    sourceImageUrl?: string
    text?: string
  }>
  plan?: {
    title?: string
    caption?: string
    hashtags?: string
    hook?: string
    publishType?: string
    slides?: Array<{ imageUrl?: string; text?: string }>
  }
}

export type SocialOutputRun = {
  id: string
  automationId: string
  automationName: string
  platform: string
  status?: string
  createdAt: string
  hook?: string
  setup?: string
  content?: string[]
  proof?: string
  curiosityGap?: string
  cta?: string
  posts?: Array<{ text: string }>
  imageUrls?: string[]
}

const unusableStatuses = new Set(["failed", "queued", "running", "processing"])

export function composerSourcesFromRuns(input: {
  templateRuns?: readonly TemplateOutputRun[]
  socialRuns?: readonly SocialOutputRun[]
}): ComposerSourceOutput[] {
  const templateSources = (input.templateRuns ?? []).flatMap((run) => {
    if (unusableStatuses.has(run.status ?? "")) return []
    const media = templateRunMedia(run)
    const text = templateRunText(run)
    if (!text && media.length === 0) return []
    const kind = run.videoUrl
      ? "video"
      : media.length > 0
        ? "slideshow"
        : "text"
    return [
      {
        id: run.id,
        templateId: run.automationId,
        templateName: run.automationTitle || "Untitled template",
        title:
          clean(run.plan?.title) ||
          clean(run.plan?.hook) ||
          run.automationTitle ||
          "Untitled output",
        createdAt: run.createdAt,
        kind,
        text,
        media,
        thumbnailUrl: run.thumbnailUrl || media[0]?.url,
      } satisfies ComposerSourceOutput,
    ]
  })

  const socialSources = (input.socialRuns ?? []).flatMap((run) => {
    if (unusableStatuses.has(run.status ?? "")) return []
    const text = socialRunText(run)
    const media = (run.imageUrls ?? []).filter(Boolean).map((url, index) => ({
      id: `${run.id}-image-${index + 1}`,
      kind: "image" as const,
      url,
      alt: `${run.automationName} output image ${index + 1}`,
    }))
    if (!text && media.length === 0) return []
    return [
      {
        id: run.id,
        templateId: run.automationId,
        templateName: run.automationName || "Text template",
        title: clean(run.hook) || run.automationName || "Text output",
        createdAt: run.createdAt,
        kind: "text",
        platform: run.platform,
        text,
        media,
        thumbnailUrl: media[0]?.url,
      } satisfies ComposerSourceOutput,
    ]
  })

  return [...templateSources, ...socialSources].toSorted(
    (first, second) =>
      Date.parse(second.createdAt) - Date.parse(first.createdAt)
  )
}

export function composerValueFromSources(
  sources: readonly ComposerSourceOutput[]
): ComposerValue {
  const uniqueSources = sources.filter(
    (source, index) =>
      sources.findIndex((item) => item.id === source.id) === index
  )
  const media = dedupeMedia(uniqueSources.flatMap((source) => source.media))
  const text = uniqueSources
    .map((source) => source.text.trim())
    .filter(Boolean)
    .join("\n\n")
  return {
    sourceOutputIds: uniqueSources.map((source) => source.id),
    base: { text, media },
    perNetwork: {},
  }
}

function templateRunText(run: TemplateOutputRun) {
  const caption = clean(run.plan?.caption)
  const hashtags = clean(run.plan?.hashtags)
  if (caption || hashtags)
    return [caption, hashtags].filter(Boolean).join("\n\n")

  const slideText = (run.renderedSlides ?? run.plan?.slides ?? [])
    .map((slide) => clean(slide.text))
    .filter(Boolean)
    .join("\n\n")
  return slideText || clean(run.plan?.hook) || clean(run.plan?.title)
}

function socialRunText(run: SocialOutputRun) {
  const posts = (run.posts ?? [])
    .map((post) => clean(post.text))
    .filter(Boolean)
  if (posts.length > 0) return posts.join("\n\n")
  return [
    run.hook,
    run.setup,
    ...(run.content ?? []),
    run.proof,
    run.curiosityGap,
    run.cta,
  ]
    .map(clean)
    .filter(Boolean)
    .join("\n\n")
}

function templateRunMedia(run: TemplateOutputRun): PreviewMedia[] {
  if (run.videoUrl) {
    return [
      {
        id: `${run.id}-video`,
        kind: "video",
        url: run.videoUrl,
        alt: `${run.automationTitle || "Template"} video output`,
      },
    ]
  }
  const urls = [
    ...(run.outputImages ?? []),
    ...(run.renderedSlides ?? []).map(
      (slide) => slide.imageUrl || slide.sourceImageUrl || ""
    ),
    ...(run.plan?.slides ?? []).map((slide) => slide.imageUrl || ""),
  ].filter(Boolean)
  return [...new Set(urls)].map((url, index) => ({
    id: `${run.id}-image-${index + 1}`,
    kind: "image",
    url,
    alt: `${run.automationTitle || "Template"} output ${index + 1}`,
  }))
}

function dedupeMedia(media: readonly PreviewMedia[]) {
  const seen = new Set<string>()
  return media.filter((item) => {
    if (!item.url || seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
