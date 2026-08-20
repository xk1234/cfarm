import type { PostFastMedia } from "@/lib/postfast-client"

export type PublicationLinkState =
  "postfast_published" | "manually_linked" | "unlinked"

export type PostFastPostStatus =
  | "awaiting_manual_post"
  | "ready_for_review"
  | "draft"
  | "scheduled"
  | "published"
  | "failed"

export type PostFastSourceType =
  | "automation"
  | "x_automation"
  | "generated_video"
  | "asset"
  | "greenscreen"
  | "ugc_ad"
  | "image"
  | "slideshow"
  | "manual"
  | "external"

export type PostFastAnalyticsPoint = {
  date: string
  total: string | number
}

export type PostFastAnalyticsMetric = {
  label: string
  data: PostFastAnalyticsPoint[]
  percentageChange?: number
}

export type PostFastStatsSource = "postfast" | "tiktok_studio"

export type PostFastPostRecord = {
  id: string
  sourceType: PostFastSourceType
  sourceId: string
  postfastPostId?: string
  integrationId: string
  provider: string
  status: PostFastPostStatus
  scheduledAt?: string
  publishedAt?: string
  releaseUrl?: string
  linkState: PublicationLinkState
  statsSources: PostFastStatsSource[]
  externalPostId?: string
  content: string
  media: PostFastMedia[]
  createdAt: string
  updatedAt: string
  lastSyncedAt?: string
  lastAnalyticsSyncedAt?: string
  analytics?: PostFastAnalyticsMetric[]
  error?: string
}
