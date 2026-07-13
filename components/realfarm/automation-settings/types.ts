import type { SocialAccountStatusItem } from "@/components/realfarm/social-account-status"

export type AutomationDrawerTab =
  "overview" | "format" | "hooks" | "schedule" | "tiktok" | "settings"

export type AutomationRunApiPayload = {
  created?: AutomationRunApiRecord[]
  skipped?: Array<{
    automationId: string
    reason:
      | "not_live"
      | "not_due"
      | "already_ran"
      | "no_images"
      | "insufficient_unique_images"
      | "hooks_exhausted"
    scheduledFor?: string
  }>
}

export type AutomationRunApiRecord = {
  id: string
  automationId: string
  automationTitle: string
  scheduledFor: string
  status: "succeeded" | "failed" | "generating"
  slideshowId?: string
  videoUrl?: string
  thumbnailUrl?: string
  outputImages?: string[]
  outputDir?: string
  socialStatuses?: SocialAccountStatusItem[]
  renderedSlides?: AutomationRunApiSlide[]
  createdAt: string
  views?: number
  benchmarkId?: string
  benchmarkError?: string
  error?: string
  plan?: {
    title?: string
    caption?: string
    hashtags?: string
    hook?: string
    hookCandidates?: string[]
    textModel?: string
    publishType?: string
    language?: string
    reuseWarnings?: {
      kind: "image"
      key: string
      slideId?: string
      lastUsedAt?: string
      reason: string
    }[]
    debug?: {
      selectedHookIndex?: number
      textModelPrompt?: unknown
    }
    slides?: AutomationRunApiSlide[]
  }
}

export type AutomationRunApiSlide = {
  id?: string
  role?: "hook" | "content" | "cta"
  imageUrl?: string
  sourceImageUrl?: string
  imageCaption?: string
  text?: string
  durationMs?: number
  aspectRatio?: string
}
