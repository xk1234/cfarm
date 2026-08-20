import type { HookCaseMode } from "@/lib/hook-casing"
import type { PostFastSocialIntegration } from "@/lib/postfast-client"

export type AutomationStatus = "paused" | "live"
// `unknown` preserves records that predate the canonical lifecycle enum.
export type AutomationLifecycleStatus = AutomationStatus | "unknown"
export type AutomationAspectRatio =
  "9:16" | "4:5" | "3:4" | "4:3" | "3:2" | "1:1"
export type AutomationImageFit = "cover" | "contain" | "fit"
export type AutomationImageGrid = "none" | "2x2" | "1x2" | "1x3" | "oval-icons"
export type AutomationImageMode = "collection" | "single_image"
export type AutomationTextAlign = "left" | "center" | "right"
export type AutomationTextAnchor = "padded" | "flush"
export type AutomationTextPosition = "top" | "center" | "bottom"
export type TikTokVisibility =
  "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY"
export type TikTokPostMode = "MEDIA_UPLOAD" | "DIRECT_POST"
export type TikTokPublishType = "slideshow" | "video"
export type AutomationDay =
  "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"
export type Time = string

export type PromptFormatting = {
  style: string
  narrative: string
  num_of_slides: number
  slide_count_min?: number
  slide_count_max?: number
  slide_planning_prompt?: string
  hook_case?: HookCaseMode
}

export type ImageCollectionConfig = {
  first_slide: {
    collection: string
    mode: AutomationImageMode
    single_image: string | null
  }
  all_slides: string
  cta_slide: {
    check: boolean
    cta_collection_id: string
    image_id: string | null
  }
  video_demo_asset_id?: string
}

export type AutomationSchedule = {
  timezone: string
  posting_times: {
    time: Time
    days: AutomationDay[]
    enabled?: boolean
  }[]
  paused?: boolean
  jitter_minutes?: number
}

export type AutomationPostingMode = "manual" | "review" | "auto"

export type Automation = {
  id: string
  name: string
  hidden?: boolean
  automationKind?: "slideshow" | "video" | "ugc" | "x_threads"
  postingMode?: AutomationPostingMode
  generationLeadMinutes?: number
  platform?: "x" | "threads"
  status: AutomationLifecycleStatus
  account: string
  handle: string
  times: string[]
  timezone?: string
  schedule?: AutomationSchedule
  favorite: boolean
  theme: string
  socialIntegrations: PostFastSocialIntegration[]
  created_at?: string
  generationBlockers?: string[]
}
