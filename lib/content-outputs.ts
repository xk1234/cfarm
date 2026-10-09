import type { GeneratedVideoExport } from "@/lib/generated-video-types"
import type { SlideshowRecord } from "@/lib/slideshows"
import type { XAutomationRun } from "@/lib/x-automation"

export type ContentOutputKind = "slideshow" | "video" | "text"
export type ContentOutputStatus = "draft" | "generating" | "failed"

export type ContentOutputMedia = {
  kind: "image" | "video" | "thumbnail"
  url: string
  order: number
}

export type ContentOutput = {
  id: string
  templateId?: string
  kind: ContentOutputKind
  status: ContentOutputStatus
  title: string
  text: string
  media: ContentOutputMedia[]
  scheduledAt?: string
  publishedAt?: string
  createdAt: string
  updatedAt: string
}

export function outputFromSlideshow(slideshow: SlideshowRecord): ContentOutput {
  return {
    id: slideshow.id,
    templateId: slideshow.automationId,
    kind: "slideshow",
    status: slideshow.status === "failed" ? "failed" : "draft",
    title: slideshow.title || "Untitled slideshow",
    text: slideshow.caption,
    media: slideshow.output_images.map((url, order) => ({
      kind: "image",
      url,
      order,
    })),
    createdAt: slideshow.created_at,
    updatedAt: slideshow.updated_at,
  }
}

export function outputFromVideo(video: GeneratedVideoExport): ContentOutput {
  const media = [
    ...(video.videoUrl
      ? [{ kind: "video" as const, url: video.videoUrl, order: 0 }]
      : []),
    ...(video.previewUrl
      ? [{ kind: "thumbnail" as const, url: video.previewUrl, order: 1 }]
      : []),
  ]
  return {
    id: video.id,
    templateId: video.sourceAutomationId,
    kind: "video",
    status:
      video.status === "failed"
        ? "failed"
        : video.status === "queued" || video.status === "processing"
          ? "generating"
          : "draft",
    title: video.title || "Untitled video",
    text: video.description,
    media,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  }
}

export function outputFromGeneratedPost(run: XAutomationRun): ContentOutput {
  return {
    id: run.id,
    templateId: run.automationId,
    kind: "text",
    status: run.status === "failed" ? "failed" : "draft",
    title: run.articleTitle || run.topic || "Untitled post",
    text:
      run.contentType === "article"
        ? run.articleBody || run.posts.map((post) => post.text).join("\n\n")
        : run.posts.map((post) => post.text).join("\n\n"),
    media: run.imageUrls.map((url, order) => ({ kind: "image", url, order })),
    scheduledAt: run.scheduledFor,
    publishedAt: run.status === "published" ? run.updatedAt : undefined,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}
