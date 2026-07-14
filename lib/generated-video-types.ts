export type GeneratedVideoType = "greenscreen" | "ugc_ad" | "template_video"
export type GeneratedVideoStatus = "queued" | "processing" | "ready" | "failed"

export const generatedVideoTypeConfig: Record<
  GeneratedVideoType,
  {
    title: string
    pendingLabel: string
  }
> = {
  greenscreen: {
    title: "Greenscreen meme export",
    pendingLabel: "Creating greenscreen video...",
  },
  ugc_ad: {
    title: "AI UGC ad export",
    pendingLabel: "Creating hook video...",
  },
  template_video: {
    title: "Video template export",
    pendingLabel: "Creating template video...",
  },
}

export type GeneratedVideoExport = {
  ownerId?: string
  id: string
  type: GeneratedVideoType
  status: GeneratedVideoStatus
  createdAt: string
  updatedAt: string
  title: string
  description: string
  hashtags: string[]
  /** Legacy publishing alias for description. */
  caption: string
  sourceConfig: Record<string, unknown>
  queuePosition?: number
  previewUrl?: string
  videoUrl?: string
  error?: string
}

export type GeneratedVideoCreatePayload = {
  type: GeneratedVideoType
  status?: GeneratedVideoStatus
  title?: string
  description?: string
  hashtags?: string[]
  caption?: string
  sourceConfig?: Record<string, unknown>
  previewUrl?: string
  videoUrl?: string
}
