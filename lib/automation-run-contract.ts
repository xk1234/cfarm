/** Shared, serialization-safe automation run contracts used by server and UI. */
export type AutomationRunStatus = "running" | "succeeded" | "failed"

export type AutomationRunSlideRole = "hook" | "content" | "cta"

export type AutomationRunSlideView = {
  id?: string
  role?: AutomationRunSlideRole
  imageUrl?: string
  sourceImageUrl?: string
  imageCaption?: string
  text?: string
  durationMs?: number
  aspectRatio?: string
}
