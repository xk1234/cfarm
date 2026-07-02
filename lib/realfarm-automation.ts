import { DateTime } from "luxon"

import type { Automation } from "@/lib/realfarm-data"

export type AutomationStatus = "paused" | "live"
export type AutomationAspectRatio = "fit" | "9:16" | "4:5" | "3:4" | "3:2" | "1:1"
export type AutomationImageGrid = "none" | "2x2" | "1x2" | "1x3"
export type AutomationSlideCountMode = "static" | "varying"
export type AutomationImageMode = "collection" | "single_image"
export type AutomationTextWordLength = "1-2" | "2-3" | "3-5" | "5-7" | "5-15" | "25-30"
export type AutomationTextAlign = "left" | "center" | "right"
export type AutomationTextAnchor = "padded" | "flush"
export type TikTokVisibility = "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY"
export type TikTokPostMode = "MEDIA_UPLOAD" | "DIRECT_POST"
export type TikTokPublishType = "slideshow" | "video"
export type AutomationDay = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"

export type PromptFormatting = {
  font: "default" | "bebas-neue" | "elegance" | "elegance-italic"
  style: "outline" | "white-text" | "black-text" | "yellow-text" | "white-background" | "white-50-background" | "black-background" | "black-50-background" | "light-pink" | "muted-red" | "navy-blue"
  font_size: number
}

export type ImageCollectionConfig = {
  hook_collection_id?: string
  content_collection_id?: string
  cta_collection_id?: string
}

export type ToneFormat = {
  voice?: string
  style?: string
}

export type PostTextSetting = {
  mode: "prompt" | "static"
  value: string
}

export type AutomationTextItem = {
  content_direction?: string
  word_length_min: AutomationTextWordLength
  align: AutomationTextAlign
  anchor?: AutomationTextAnchor
  vertical_anchor?: AutomationTextAnchor
}

export type AutomationFormatSection = {
  aspect_ratio: AutomationAspectRatio
  image_grid: AutomationImageGrid
  overlay: boolean
  display_text: boolean
  text_items: AutomationTextItem[]
}

export type AutomationContentFormat = AutomationFormatSection & {
  slide_count_mode: AutomationSlideCountMode
  slide_count?: number
  slide_count_min?: number
  slide_count_max?: number
  overlay_image?: {
    enabled: boolean
    collection_id?: string
    height: number
  }
}

export type AutomationCTAFormat = AutomationFormatSection & {
  enabled: boolean
  image_mode: AutomationImageMode
}

export type AutomationSchema = {
  title: string
  created_at: Date
  status: AutomationStatus
  tiktok_account_id: string | null
  prompt_formatting: PromptFormatting
  image_collection_ids: ImageCollectionConfig
  format: {
    hook: AutomationFormatSection
    content: AutomationContentFormat
    cta: AutomationCTAFormat
    tone?: ToneFormat
  }
  hooks: string[]
  tiktok_post_settings: {
    caption: PostTextSetting
    description: PostTextSetting
    visibility: TikTokVisibility
    auto_music: boolean
    auto_post: boolean
    allow_comments: boolean
    allow_duet: boolean
    allow_stitch: boolean
    disclose_video_content: boolean
    disclose_brand_organic: boolean
    disclose_branded_content: boolean
    post_mode: TikTokPostMode
    publish_type: TikTokPublishType
  }
  schedule: {
    timezone: string
    posting_times: {
      days: AutomationDay[]
    }[]
  }
}

export const automationAspectRatios: AutomationAspectRatio[] = ["fit", "9:16", "4:5", "3:4", "3:2", "1:1"]
export const automationImageGrids: AutomationImageGrid[] = ["none", "2x2", "1x2", "1x3"]
export const automationWordLengths: AutomationTextWordLength[] = ["1-2", "2-3", "3-5", "5-7", "5-15", "25-30"]
export const automationAlignments: AutomationTextAlign[] = ["left", "center", "right"]
export const automationAnchors: AutomationTextAnchor[] = ["padded", "flush"]

export function defaultAutomationTextItem(overrides: Partial<AutomationTextItem> = {}): AutomationTextItem {
  return {
    word_length_min: "3-5",
    align: "center",
    anchor: "padded",
    vertical_anchor: "padded",
    content_direction: "",
    ...overrides,
  }
}

export function defaultAutomationSchema(automation: Automation): AutomationSchema {
  const status = automation.status.toLowerCase() === "paused" ? "paused" : "live"
  const allDays: AutomationDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const hooks = [
    "6 small lies i stopped telling myself that changed everything",
    "my daily routine that fixed my life",
    "4 uncomfortable but healthy relationship questions i've asked my partner",
  ]

  return {
    title: automation.name,
    created_at: DateTime.now().minus({ days: Math.max(0, Number(automation.id.replace(/\D/g, "")) || 0) }).toJSDate(),
    status,
    tiktok_account_id: automation.account.startsWith("@") ? automation.account : null,
    prompt_formatting: {
      font: "default",
      style: "outline",
      font_size: 14,
    },
    image_collection_ids: {
      hook_collection_id: "wolf",
      content_collection_id: "space",
      cta_collection_id: "default-backgrounds",
    },
    format: {
      hook: {
        aspect_ratio: "3:2",
        image_grid: "none",
        overlay: true,
        display_text: true,
        text_items: [defaultAutomationTextItem()],
      },
      content: {
        aspect_ratio: "9:16",
        image_grid: "none",
        slide_count_mode: "varying",
        slide_count_min: 3,
        slide_count_max: 4,
        overlay: false,
        overlay_image: {
          enabled: false,
          height: 50,
        },
        display_text: true,
        text_items: [defaultAutomationTextItem({ word_length_min: "3-5" })],
      },
      cta: {
        enabled: true,
        image_mode: "collection",
        aspect_ratio: "9:16",
        image_grid: "none",
        overlay: false,
        display_text: true,
        text_items: [defaultAutomationTextItem()],
      },
      tone: {
        voice: "direct",
        style: automation.theme,
      },
    },
    hooks,
    tiktok_post_settings: {
      caption: {
        mode: "prompt",
        value: "give me 3-5 broad hashtags related to the topic/niche of the content, all lowercase, nothing else other than 3-5 hashtags",
      },
      description: {
        mode: "prompt",
        value: 'this should be in "title case," same exact text as the first text item',
      },
      visibility: "PUBLIC_TO_EVERYONE",
      auto_music: true,
      auto_post: false,
      allow_comments: true,
      allow_duet: true,
      allow_stitch: true,
      disclose_video_content: false,
      disclose_brand_organic: false,
      disclose_branded_content: false,
      post_mode: "MEDIA_UPLOAD",
      publish_type: "slideshow",
    },
    schedule: {
      timezone: DateTime.local().zoneName,
      posting_times: automation.times.slice(0, 5).map(() => ({ days: allDays })),
    },
  }
}

export function mergeAutomationSchema(automation: Automation, draft?: AutomationSchema): AutomationSchema {
  const defaults = defaultAutomationSchema(automation)
  if (!draft) {
    return defaults
  }

  return {
    ...defaults,
    ...draft,
    title: draft.title || automation.name,
    created_at: draft.created_at ?? defaults.created_at,
  }
}

export function automationCreatedAt(automation: Automation, index: number) {
  const maybeAutomation = automation as Automation & { created_at?: string | Date }
  if (maybeAutomation.created_at) {
    return new Date(maybeAutomation.created_at).getTime()
  }
  return DateTime.now().minus({ days: index }).toMillis()
}

export function labelToAspectRatio(value: string): AutomationAspectRatio {
  return value === "Fit" ? "fit" : value as AutomationAspectRatio
}

export function aspectRatioLabel(value: AutomationAspectRatio) {
  return value === "fit" ? "Fit" : value
}

export function labelToImageGrid(value: string): AutomationImageGrid {
  return value === "None" ? "none" : value as AutomationImageGrid
}

export function imageGridLabel(value: AutomationImageGrid) {
  return value === "none" ? "None" : value
}

export function wordLengthLabel(value: AutomationTextWordLength) {
  return `${value} words`
}

export function labelToWordLength(value: string): AutomationTextWordLength {
  return value.replace(" words", "") as AutomationTextWordLength
}

export function alignmentLabel(value: AutomationTextAlign) {
  return `${value[0].toUpperCase()}${value.slice(1)} align`
}

export function labelToAlignment(value: string): AutomationTextAlign {
  return value.toLowerCase().replace(" align", "") as AutomationTextAlign
}

export function anchorLabel(value: AutomationTextAnchor) {
  return value[0].toUpperCase() + value.slice(1)
}

export function labelToAnchor(value: string): AutomationTextAnchor {
  return value.toLowerCase() as AutomationTextAnchor
}
