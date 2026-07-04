export type GeneratedVideoType = "greenscreen" | "ugc_ad"
export type GeneratedVideoStatus = "queued" | "processing" | "ready" | "failed"

export const generatedVideoTypeConfig: Record<GeneratedVideoType, {
  title: string
  pendingLabel: string
}> = {
  greenscreen: {
    title: "Greenscreen meme export",
    pendingLabel: "Creating greenscreen video...",
  },
  ugc_ad: {
    title: "AI UGC ad export",
    pendingLabel: "Creating hook video...",
  },
}

export type GeneratedVideoExport = {
  id: string
  type: GeneratedVideoType
  status: GeneratedVideoStatus
  createdAt: string
  updatedAt: string
  title: string
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
  caption?: string
  sourceConfig?: Record<string, unknown>
  previewUrl?: string
  videoUrl?: string
}
