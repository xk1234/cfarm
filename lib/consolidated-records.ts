import crypto from "node:crypto"

import {
  CREATED_KEYS,
  NAME_KEYS,
  STATUS_KEYS,
  bucketForPath,
  fileIdForPath,
  pickField,
  type StoreRoute,
} from "@/lib/appwrite-stores"

export type OutputMediaDraft = {
  kind: "image" | "video" | "audio" | "file"
  role: string
  position: number
  url: string
  data?: Record<string, unknown>
}

export function canonicalRowFields(
  route: StoreRoute,
  record: unknown,
  storedData: unknown
): Record<string, unknown> {
  const obj = asRecord(record)
  const common = {
    ...(route.table === "outputs" || route.table === "permanent_assets"
      ? { source_key: route.sourceKey }
      : {}),
    name: pickField(record, NAME_KEYS)?.slice(0, 2048) ?? null,
    status: pickField(record, STATUS_KEYS)?.slice(0, 255) ?? null,
    created_raw: pickField(record, CREATED_KEYS)?.slice(0, 64) ?? null,
    data: JSON.stringify(storedData),
  }

  if (route.table === "outputs") {
    const publications = arrayValue(obj.publications)
    const publicationStatus = latestPublicationStatus(publications)
    return {
      ...common,
      kind: outputKind(route.sourceKey, obj),
      subtype: stringValue(obj.type ?? obj.workflowType ?? obj.platform),
      storage_class: "permanent",
      origin: "deployed_app",
      title:
        stringValue(obj.title ?? obj.name ?? obj.hook).slice(0, 2048) || null,
      hook: stringValue(obj.hook).slice(0, 10000) || null,
      caption: outputCaption(obj).slice(0, 100000) || null,
      hashtags: JSON.stringify(outputHashtags(obj)),
      text: outputText(obj).slice(0, 100000) || null,
      text_data: JSON.stringify(outputTextData(obj)),
      source_automation_id: stringValue(obj.automationId).slice(0, 255) || null,
      source_run_id:
        stringValue(obj.runId ?? obj.generationId).slice(0, 255) || null,
      source_entity_id:
        outputSourceEntityId(route.sourceKey, obj).slice(0, 255) || null,
      publication_status: publicationStatus,
      scheduled_at: firstString(publications, "scheduledAt"),
      published_at: firstString(publications, "publishedAt"),
      primary_post_id: firstString(publications, "postfastPostId"),
      primary_release_url: firstString(publications, "releaseUrl"),
      publications: JSON.stringify(publications),
      evaluation: JSON.stringify(obj.evaluation ?? obj.benchmark ?? null),
      error: stringValue(obj.error).slice(0, 100000) || null,
      updated_at:
        stringValue(obj.updatedAt ?? obj.updated_at ?? obj.createdAt) || null,
      migration_source: null,
    }
  }

  if (route.table === "permanent_assets") {
    const fileUrl = permanentAssetUrl(obj)
    const storage = storageReference(fileUrl)
    return {
      ...common,
      visibility: route.public ? "public" : "private",
      asset_type: route.sourceKey,
      kind: permanentAssetKind(route.sourceKey, obj),
      parent_id:
        stringValue(obj.parentId ?? obj.collectionId).slice(0, 255) || null,
      description:
        stringValue(obj.description ?? obj.caption).slice(0, 100000) || null,
      text: permanentAssetText(obj).slice(0, 100000) || null,
      tags: JSON.stringify(arrayValue(obj.tags)),
      storage_bucket: storage?.bucket ?? null,
      storage_file_id: storage?.fileId ?? null,
      storage_path: storage?.path ?? null,
      url: fileUrl.slice(0, 10000) || null,
      mime_type:
        stringValue(obj.mimeType ?? obj.mime_type).slice(0, 255) || null,
      bytes: finiteNumber(obj.bytes ?? obj.size) ?? null,
      width: finiteNumber(obj.width) ?? null,
      height: finiteNumber(obj.height) ?? null,
      duration_ms: finiteNumber(obj.durationMs ?? obj.duration_ms) ?? null,
      checksum: stringValue(obj.hash ?? obj.checksum).slice(0, 255) || null,
      source_url:
        stringValue(obj.sourceUrl ?? obj.source_url).slice(0, 10000) || null,
      position: finiteNumber(obj.position ?? obj.ord) ?? null,
      updated_at:
        stringValue(obj.updatedAt ?? obj.updated_at ?? obj.createdAt) || null,
      migration_source: null,
    }
  }

  return common
}

export function extractOutputMedia(
  sourceKey: string,
  record: unknown
): { storedData: unknown; media: OutputMediaDraft[] } {
  const storedData = clone(record)
  const obj = asRecord(storedData)
  const media: OutputMediaDraft[] = []
  const seen = new Set<string>()
  const add = (
    rawUrl: unknown,
    kind: OutputMediaDraft["kind"],
    role: string,
    position = 0,
    data?: Record<string, unknown>
  ) => {
    const url = stringValue(rawUrl)
    if (!url || seen.has(`${role}:${position}:${url}`)) return
    seen.add(`${role}:${position}:${url}`)
    media.push({ kind, role, position, url, data })
  }

  if (sourceKey === "result") {
    const artifacts = asRecord(obj.artifacts)
    arrayValue(artifacts.outputImages).forEach((url, index) =>
      add(url, "image", "slide", index)
    )
    add(artifacts.videoUrl, "video", "rendered_video")
    add(artifacts.thumbnailUrl, "image", "thumbnail")
    delete artifacts.outputImages
    delete artifacts.videoUrl
    delete artifacts.thumbnailUrl

    const payload = asRecord(obj.payload)
    if (Array.isArray(payload.slides)) {
      payload.slides = payload.slides.map((rawSlide, index) => {
        const slide = asRecord(rawSlide)
        add(slide.image_url, "image", "slide", index)
        delete slide.image_url
        return slide
      })
    }
  } else if (sourceKey === "generated_video") {
    add(obj.videoUrl, "video", "rendered_video")
    add(obj.previewUrl, "image", "thumbnail")
    delete obj.videoUrl
    delete obj.previewUrl
  } else if (sourceKey === "character_image") {
    add(obj.imageUrl, "image", "generated_image")
    add(obj.videoUrl, "video", "rendered_video")
    const metadata = asRecord(obj.workflowMetadata)
    const recipe = asRecord(metadata.recipe)
    add(recipe.rawVideoUrl, "video", "raw_video")
    delete obj.imageUrl
    delete obj.videoUrl
    delete recipe.rawVideoUrl
  } else if (sourceKey === "character_video") {
    add(obj.videoUrl, "video", "rendered_video")
    delete obj.videoUrl
  } else if (sourceKey === "x_automation_run") {
    arrayValue(obj.imageUrls).forEach((url, index) =>
      add(url, "image", "post_image", index)
    )
    delete obj.imageUrls
  } else if (
    sourceKey === "slideshow_benchmark" ||
    sourceKey === "x_benchmark_score"
  ) {
    arrayValue(obj.slides).forEach((rawSlide, index) => {
      const slide = asRecord(rawSlide)
      add(slide.imageUrl, "image", "evaluation_slide", index)
      delete slide.imageUrl
    })
  }

  return { storedData, media }
}

export function hydrateOutputMedia(
  sourceKey: string,
  record: unknown,
  media: OutputMediaDraft[]
): unknown {
  const obj = asRecord(record)
  const sorted = [...media].sort((a, b) => a.position - b.position)
  const one = (role: string) => sorted.find((item) => item.role === role)?.url
  const many = (role: string) =>
    sorted.filter((item) => item.role === role).map((item) => item.url)

  if (sourceKey === "result") {
    const artifacts = asRecord(obj.artifacts)
    artifacts.outputImages = many("slide")
    artifacts.videoUrl = one("rendered_video")
    artifacts.thumbnailUrl = one("thumbnail")
    const payload = asRecord(obj.payload)
    if (Array.isArray(payload.slides)) {
      const slides = many("slide")
      payload.slides = payload.slides.map((rawSlide, index) => ({
        ...asRecord(rawSlide),
        ...(slides[index] ? { image_url: slides[index] } : {}),
      }))
    }
  } else if (sourceKey === "generated_video") {
    obj.videoUrl = one("rendered_video")
    obj.previewUrl = one("thumbnail")
  } else if (sourceKey === "character_image") {
    obj.imageUrl = one("generated_image")
    obj.videoUrl = one("rendered_video")
    const rawVideoUrl = one("raw_video")
    if (rawVideoUrl) {
      const metadata = asRecord(obj.workflowMetadata)
      const recipe = asRecord(metadata.recipe)
      recipe.rawVideoUrl = rawVideoUrl
    }
  } else if (sourceKey === "character_video") {
    obj.videoUrl = one("rendered_video")
  } else if (sourceKey === "x_automation_run") {
    obj.imageUrls = many("post_image")
  } else if (
    sourceKey === "slideshow_benchmark" ||
    sourceKey === "x_benchmark_score"
  ) {
    const images = many("evaluation_slide")
    if (Array.isArray(obj.slides)) {
      obj.slides = obj.slides.map((rawSlide, index) => ({
        ...asRecord(rawSlide),
        ...(images[index] ? { imageUrl: images[index] } : {}),
      }))
    }
  }
  return obj
}

export function outputMediaRowId(
  outputRowId: string,
  media: OutputMediaDraft
): string {
  return `m${crypto
    .createHash("sha256")
    .update(`${outputRowId}:${media.role}:${media.position}:${media.url}`)
    .digest("hex")
    .slice(0, 35)}`
}

export function outputMediaRowFields(
  outputRowId: string,
  ownerId: string,
  media: OutputMediaDraft
): Record<string, unknown> {
  const storage = storageReference(media.url)
  return {
    output_id: outputRowId,
    owner_id: ownerId,
    permanent_asset_id: null,
    kind: media.kind,
    role: media.role,
    position: media.position,
    storage_bucket: storage?.bucket ?? null,
    storage_file_id: storage?.fileId ?? null,
    storage_path: storage?.path ?? null,
    url: media.url,
    mime_type: null,
    bytes: null,
    width: null,
    height: null,
    duration_ms: null,
    checksum: null,
    data: JSON.stringify(media.data ?? null),
    created_at: new Date().toISOString(),
  }
}

function outputKind(sourceKey: string, obj: Record<string, unknown>): string {
  if (sourceKey === "result")
    return stringValue(obj.workflowType) || "generation"
  if (sourceKey === "generated_video") return "video"
  if (sourceKey === "character_image") return "character_image"
  if (sourceKey === "character_video") return "character_video"
  if (sourceKey === "x_automation_run") return "social_post"
  if (sourceKey.includes("benchmark")) return "evaluation"
  return sourceKey
}

function outputCaption(obj: Record<string, unknown>): string {
  const payload = asRecord(obj.payload)
  return stringValue(obj.caption ?? obj.description ?? payload.caption)
}

function outputHashtags(obj: Record<string, unknown>): string[] {
  const payload = asRecord(obj.payload)
  const value = obj.hashtags ?? payload.hashtags
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean)
  return stringValue(value).split(/\s+/).filter(Boolean)
}

function outputText(obj: Record<string, unknown>): string {
  if (typeof obj.text === "string") return obj.text
  if (Array.isArray(obj.content))
    return obj.content.map(stringValue).join("\n\n")
  const posts = arrayValue(obj.posts)
  return posts
    .map((post) => stringValue(asRecord(post).text))
    .filter(Boolean)
    .join("\n\n")
}

function outputTextData(obj: Record<string, unknown>): unknown {
  const payload = asRecord(obj.payload)
  if (Array.isArray(payload.slides)) {
    return payload.slides.map((slide, index) => ({
      position: index,
      textItems: asRecord(slide).textItems ?? [],
    }))
  }
  if (Array.isArray(obj.posts)) return obj.posts
  return null
}

function outputSourceEntityId(
  sourceKey: string,
  obj: Record<string, unknown>
): string {
  if (sourceKey === "result")
    return stringValue(asRecord(obj.artifacts).slideshowId)
  return stringValue(obj.sourceId ?? obj.generationId ?? obj.id)
}

function permanentAssetKind(
  sourceKey: string,
  obj: Record<string, unknown>
): string {
  const explicit = stringValue(obj.kind)
  if (explicit) return explicit
  if (sourceKey.includes("collection")) return "collection"
  if (sourceKey.includes("template")) return "template"
  if (sourceKey.includes("benchmark")) return "benchmark"
  return sourceKey
}

function permanentAssetText(obj: Record<string, unknown>): string {
  return stringValue(obj.text ?? obj.content ?? obj.prompt)
}

function permanentAssetUrl(obj: Record<string, unknown>): string {
  return stringValue(
    obj.fileUrl ?? obj.url ?? obj.imageUrl ?? obj.videoUrl ?? obj.audioUrl
  )
}

function storageReference(
  url: string
): { bucket: string; fileId: string; path: string } | null {
  const prefix = "/api/local-assets/"
  if (!url.startsWith(prefix)) return null
  let relative = ""
  try {
    relative = decodeURIComponent(url.slice(prefix.length).split(/[?#]/)[0])
  } catch {
    return null
  }
  if (!relative || relative.split("/").some((part) => part === ".."))
    return null
  return {
    bucket: bucketForPath(relative),
    fileId: fileIdForPath(relative),
    path: relative,
  }
}

function latestPublicationStatus(publications: unknown[]): string | null {
  const rank = [
    "published",
    "scheduled",
    "ready_for_review",
    "awaiting_manual_post",
    "failed",
    "draft",
  ]
  for (const status of rank) {
    if (publications.some((item) => asRecord(item).status === status))
      return status
  }
  return null
}

function firstString(items: unknown[], key: string): string | null {
  for (const item of items) {
    const value = stringValue(asRecord(item)[key])
    if (value) return value
  }
  return null
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : ""
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
