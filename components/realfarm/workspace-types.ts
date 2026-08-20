import type { SocialAccountStatusItem } from "@/components/realfarm/social-account-status"

export type AutomationRunSummary = {
  ownerId?: string
  id: string
  automationId: string
  automationTitle?: string
  scheduledFor?: string
  generationSource?: "manual" | "scheduled"
  requestId?: string
  status?: string
  progress?: {
    stage: string
    detail?: string
    updatedAt: string
  }
  slideshowId?: string
  socialStatuses?: SocialAccountStatusItem[]
  manuallyPublishedAt?: string
  createdAt: string
  error?: string
  videoUrl?: string
  thumbnailUrl?: string
  durationSeconds?: number
  renderedSlides?: Array<{
    id?: string
    imageUrl?: string
    sourceImageUrl?: string
    text?: string
    imageCaption?: string
    durationMs?: number
    aspectRatio?: string
  }>
  plan?: {
    title?: string
    hook?: string
    publishType?: string
    language?: string
    slides?: Array<{
      id?: string
      imageUrl?: string
      text?: string
      imageCaption?: string
      durationSeconds?: number
    }>
  }
}
