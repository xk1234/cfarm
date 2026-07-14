import { clean, isRecord } from "@/lib/guards"
import { DateTime } from "luxon"

import type {
  PostFastSocialIntegration,
  PostFastSocialProvider,
} from "@/lib/postfast-client"
import {
  defaultPostFastProviderControls,
  type PostFastProviderControls,
  type PostFastProviderControlsByProvider,
} from "@/lib/postfast-provider-controls"
import { defaultAutomationTemplateDefaults } from "@/lib/automation-template-defaults"
import type { Automation } from "@/lib/realfarm-data"
import {
  defaultAutomationLanguage,
  defaultAutomationPublishType,
  defaultSlideshowDuration,
  defaultSlideshowTransition,
  slideshowDurationValue,
} from "@/lib/slideshow-publishing-config"

export type AutomationStatus = "paused" | "live"
// Canonical persisted/lifecycle status. `unknown` covers records that predate
// the enum. This is the single source of truth for automation status shared by
// the stored record and the UI summary view.
export type AutomationLifecycleStatus = AutomationStatus | "unknown"
export type AutomationAspectRatio = "9:16" | "4:5" | "3:4" | "3:2" | "1:1"
export type AutomationImageFit = "cover" | "contain" | "fit"
export type AutomationImageGrid = "none" | "2x2" | "1x2" | "1x3"
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
  hook_case?: import("@/lib/hook-casing").HookCaseMode
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
    cta_collection_check: boolean
    cta_collection_id: string
    image_id: string | null
    cta_location: "last_slide" | string
  }
  video_demo_asset_id?: string
}

export type PostTextSetting = {
  mode: "prompt" | "static"
  static_text: string
  prompt_text: string
}

export type TextItem = {
  id: string
  text: string
  fontSize: string
  textStyle: string
  font: string
  textPosition: AutomationTextPosition
  textItemWidth: string
  wordLengthMin: number
  wordLengthMax: number
  contentDirection: string
  textMode: "prompt" | "static"
  staticText: string
  textAlign: AutomationTextAlign
  textAnchor: AutomationTextAnchor
  textVerticalAnchor?: AutomationTextAnchor
}

/** @deprecated Use TextItem; kept as a source-compatible alias. */
export type AutomationTextItem = TextItem

export type AutomationFormatSectionId = "hook" | "body" | "cta"

export type AutomationSlideOverride = {
  slideIndex: number
  contentDirection: string
}

export type AutomationImageOverride = {
  slideIndex: number
  collectionId: string
}

export type AutomationFormatSection = {
  id: AutomationFormatSectionId
  image_url: string
  textItems: AutomationTextItem[]
  aspect_ratio: AutomationAspectRatio
  imageGrid: AutomationImageGrid
  slideCount: number
  slideCountMode?: "static" | "varying"
  slideCountMin?: number
  slideCountMax?: number
  noText: boolean
  overlay: boolean
  aiImageSelection?: boolean
  overlayImage?: {
    enabled: boolean
    collectionId?: string
    padding: number
  }
  slideOverrides?: AutomationSlideOverride[]
  imageOverrides?: AutomationImageOverride[]
  ctaLocation?: "last" | "static"
  ctaStaticPosition?: string
  imageMode?: AutomationImageMode
}

export type AutomationToneSection = {
  value: string
  preset: string
}

export const automationTonePresetOptions = [
  "Conversational & Relatable",
  "Motivational & Empowering",
  "Educational & Informative",
  "Bold & Provocative",
  "Calm & Reflective",
  "Witty & Humorous",
  "Witty & Relatable",
  "Practical & Aspirational",
  "Authoritative & Reassuring",
] as const

export type AutomationTonePresetOption =
  (typeof automationTonePresetOptions)[number]

export type AutomationFormattingItem = AutomationFormatSection

export type RuntimeAutomationTemplate = Pick<
  AutomationSchema,
  | "automationKind"
  | "aspect_ratio"
  | "font"
  | "prompt_formatting"
  | "tone"
  | "formatting"
  | "tiktok_post_settings"
  | "image_collection_ids"
  | "image_fit"
  | "language"
  | "web_search_enabled"
  | "video_format"
> & {
  social_post_settings?: AutomationSocialPostSettings
  social_publish_as?: AutomationSocialPublishAs
}

export type AutomationSocialProvider = PostFastSocialProvider
export type AutomationSocialIntegration = PostFastSocialIntegration
export type AutomationSocialPostSettings = Partial<{
  [
    Provider in AutomationSocialProvider
  ]: Provider extends keyof PostFastProviderControlsByProvider
    ? PostFastProviderControlsByProvider[Provider]
    : PostFastProviderControls
}>
export type AutomationSocialPublishAs = Partial<
  Record<AutomationSocialProvider, TikTokPublishType>
>

export type AutomationSchedule = {
  timezone: string
  posting_times: {
    time: Time
    days: AutomationDay[]
    enabled?: boolean
  }[]
  paused?: boolean
  jitter_minutes?: number
  min_gap_minutes?: number
}

type LegacyAutomationScheduleInterval = {
  every_n_hours: number
  start_time: Time
  end_time: Time
  days: AutomationDay[]
  enabled?: boolean
}

export type AutomationReusePolicy = {
  image_exclusion_days?: number
  image_exclusion_limit?: number
  hook_exclusion_days?: number
  text_exclusion_days?: number
  text_exclusion_limit?: number
  text_similarity_threshold?: number
}

export type AutomationContentFormat =
  "visual_decision" | "mistake_replacement" | "designer_recommendation"

export type AutomationCtaStrategy =
  "comment_prompt" | "save_prompt" | "customer_prompt"

export type AutomationContentRoute = {
  id: string
  format: AutomationContentFormat
  hook_patterns: string[]
  collection_ids: string[]
  cta_strategy: AutomationCtaStrategy
}

export type AutomationContentStrategy = {
  routes: AutomationContentRoute[]
}

export type AutomationVideoTemplateId =
  | "ugc_ad"
  | "react_reveal"
  | "compilation"
  | "birdseye_pov"
  | "screen_record"
  | "screenshot_pictures"
  | "aesthetic"

export const automationVideoTemplateIds: AutomationVideoTemplateId[] = [
  "ugc_ad",
  "react_reveal",
  "compilation",
  "birdseye_pov",
  "screen_record",
  "screenshot_pictures",
  "aesthetic",
]

export type AutomationVideoTransition = "cut" | "fade"

export type AutomationVideoSegment = {
  id: string
  label: string
  guidance: string
  mediaSource: "collection" | "demo_asset" | "slideshow_automation"
  mediaKind: "video" | "image"
  collectionId: string
  demoAssetId: string
  slideshowAutomationId?: string
  clipCount: number
  clipDurationMs: number
  playFullVideo?: boolean
  transition: AutomationVideoTransition
  textItems: AutomationTextItem[]
}

export type AutomationVideoFormat = {
  template: AutomationVideoTemplateId
  hookPlacement: "global" | "first_segment"
  globalTextItems: AutomationTextItem[]
  segments: AutomationVideoSegment[]
}

export type AutomationSchema = {
  automationKind: "slideshow" | "video"
  aspect_ratio: AutomationAspectRatio
  font: string
  image_fit: AutomationImageFit
  language: string
  created_at: Date
  title: string
  status: AutomationStatus
  social_integrations: AutomationSocialIntegration[]
  prompt_formatting: PromptFormatting
  image_collection_ids: ImageCollectionConfig
  tone: AutomationToneSection
  formatting: AutomationFormattingItem[]
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
    publish_type?: TikTokPublishType
    slideshow_transition_style?: string
    slideshow_slide_duration?: number
    slideshow_sound_id?: string
    slideshow_sound_name?: string
    slideshow_sound_url?: string
  }
  social_post_settings: AutomationSocialPostSettings
  social_publish_as: AutomationSocialPublishAs
  schedule: AutomationSchedule
  hook_slots?: Record<string, string>
  hook_no_duplicate_slots?: boolean
  knowledge_base_ids?: string[]
  web_search_enabled?: boolean
  reuse_policy?: AutomationReusePolicy
  content_strategy?: AutomationContentStrategy
  video_format?: AutomationVideoFormat
}

export const automationAspectRatios: AutomationAspectRatio[] = [
  "9:16",
  "4:5",
  "3:4",
  "3:2",
  "1:1",
]
export const automationImageGrids: AutomationImageGrid[] = [
  "none",
  "2x2",
  "1x2",
  "1x3",
]
export const automationWordLengths = [2, 3, 5, 7, 10, 15, 30]
export const automationAlignments: AutomationTextAlign[] = [
  "left",
  "center",
  "right",
]
export const automationAnchors: AutomationTextAnchor[] = ["padded", "flush"]

export function defaultAutomationTextItem(
  overrides: Partial<AutomationTextItem> = {}
): AutomationTextItem {
  return {
    id: `text-${Math.random().toString(36).slice(2, 10)}`,
    text: "",
    fontSize: "8px",
    textStyle: "whiteText",
    font: "TikTok Display Medium",
    textPosition: "center",
    textItemWidth: "60%",
    wordLengthMin: 5,
    wordLengthMax: 10,
    contentDirection: "",
    textMode: "prompt",
    staticText: "",
    textAlign: "center",
    textAnchor: "padded",
    textVerticalAnchor: "padded",
    ...overrides,
  }
}

export function defaultAutomationSchema(
  automation: Automation
): AutomationSchema {
  const status =
    automation.status.toLowerCase() === "paused" ? "paused" : "live"
  const template = defaultAutomationTemplate(automation)
  const allDays: AutomationDay[] = [
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ]

  return {
    created_at: DateTime.now()
      .minus({
        days: Math.max(0, Number(automation.id.replace(/\D/g, "")) || 0),
      })
      .toJSDate(),
    title: automation.name,
    status,
    social_integrations: [],
    ...template,
    social_post_settings:
      template.social_post_settings ?? defaultSocialPostSettings(),
    social_publish_as: normalizeSocialPublishAs(template.social_publish_as, {}),
    schedule: {
      timezone: DateTime.local().zoneName,
      posting_times: (automation.times.length > 0
        ? automation.times
        : [defaultAutomationTemplateDefaults.schedule.defaultPostingTime]
      )
        .slice(0, 5)
        .map((time) => ({
          time,
          days: allDays,
        })),
    },
  }
}

export function defaultAutomationTemplate(
  automation: Automation
): RuntimeAutomationTemplate {
  const themeTones = defaultAutomationTemplateDefaults.themeTones
  const tone =
    themeTones[automation.theme as keyof typeof themeTones] ??
    themeTones.default
  const hookDefaults = defaultAutomationTemplateDefaults.formatting.hook
  const bodyDefaults = defaultAutomationTemplateDefaults.formatting.body
  const ctaDefaults = defaultAutomationTemplateDefaults.formatting.cta

  return {
    automationKind:
      automation.automationKind === "video" ? "video" : "slideshow",
    aspect_ratio: bodyDefaults.aspect_ratio,
    font: bodyDefaults.textItem.font,
    image_fit: defaultAutomationTemplateDefaults.image_fit,
    language: defaultAutomationTemplateDefaults.language,
    prompt_formatting: {
      ...defaultAutomationTemplateDefaults.prompt_formatting,
    },
    image_collection_ids: defaultImageCollectionConfig(),
    tone: { value: tone, preset: "custom" },
    formatting: [
      {
        id: "hook",
        image_url: hookDefaults.image_url,
        textItems: [
          defaultAutomationTextItem({
            ...hookDefaults.textItem,
          }),
        ],
        aspect_ratio: hookDefaults.aspect_ratio,
        imageGrid: hookDefaults.imageGrid,
        slideCount: hookDefaults.slideCount,
        noText: hookDefaults.noText,
        overlay: hookDefaults.overlay,
      },
      {
        id: "body",
        image_url: bodyDefaults.image_url,
        textItems: [
          defaultAutomationTextItem({
            ...bodyDefaults.textItem,
          }),
        ],
        aspect_ratio: bodyDefaults.aspect_ratio,
        imageGrid: bodyDefaults.imageGrid,
        slideCount: bodyDefaults.slideCount,
        noText: bodyDefaults.noText,
        overlay: bodyDefaults.overlay,
      },
      {
        id: "cta",
        image_url: ctaDefaults.image_url,
        textItems: [
          defaultAutomationTextItem({
            ...ctaDefaults.textItem,
          }),
        ],
        aspect_ratio: ctaDefaults.aspect_ratio,
        imageGrid: ctaDefaults.imageGrid,
        slideCount: ctaDefaults.slideCount,
        ctaLocation: ctaDefaults.ctaLocation,
        ctaStaticPosition: ctaDefaults.ctaStaticPosition,
        noText: ctaDefaults.noText,
        overlay: ctaDefaults.overlay,
        imageMode: ctaDefaults.imageMode,
      },
    ],
    tiktok_post_settings: {
      ...defaultAutomationTemplateDefaults.tiktok_post_settings,
      caption: {
        ...defaultAutomationTemplateDefaults.tiktok_post_settings.caption,
      },
      description: {
        ...defaultAutomationTemplateDefaults.tiktok_post_settings.description,
      },
      publish_type:
        automation.automationKind === "video"
          ? "video"
          : defaultAutomationTemplateDefaults.tiktok_post_settings.publish_type,
    },
    social_post_settings: defaultSocialPostSettings(),
    social_publish_as: {},
    web_search_enabled: false,
  }
}

export function mergeAutomationSchema(
  automation: Automation,
  draft?: AutomationSchema
): AutomationSchema {
  const defaults = defaultAutomationSchema(automation)
  if (!draft) {
    return defaults
  }
  const normalizedDraft = normalizeAutomationSchema(draft, automation)

  return {
    ...defaults,
    ...normalizedDraft,
    title: normalizedDraft.title || automation.name,
    created_at: normalizedDraft.created_at ?? defaults.created_at,
    prompt_formatting: {
      ...defaults.prompt_formatting,
      ...normalizedDraft.prompt_formatting,
    },
    image_collection_ids: normalizeImageCollectionConfig(
      normalizedDraft.image_collection_ids,
      defaults.image_collection_ids
    ),
    tone: normalizeAutomationTone(normalizedDraft.tone, defaults.tone),
    formatting: normalizeFormatting(
      normalizedDraft.formatting,
      defaults.formatting
    ),
    social_integrations: normalizeAutomationSocialIntegrations(
      normalizedDraft.social_integrations
    ),
    tiktok_post_settings: {
      ...defaults.tiktok_post_settings,
      ...normalizedDraft.tiktok_post_settings,
      caption: normalizePostTextSetting(
        normalizedDraft.tiktok_post_settings.caption,
        defaults.tiktok_post_settings.caption
      ),
      description: normalizePostTextSetting(
        normalizedDraft.tiktok_post_settings.description,
        defaults.tiktok_post_settings.description
      ),
    },
    social_post_settings: normalizeSocialPostSettings(
      normalizedDraft.social_post_settings,
      defaults.social_post_settings,
      normalizedDraft.tiktok_post_settings,
      normalizedDraft.social_publish_as
    ),
    social_publish_as: normalizeSocialPublishAs(
      normalizedDraft.social_publish_as,
      defaults.social_publish_as
    ),
    schedule: {
      ...defaults.schedule,
      ...normalizedDraft.schedule,
      posting_times: normalizePostingTimes(
        normalizedDraft.schedule.posting_times,
        defaults.schedule.posting_times
      ),
    },
    hook_slots: normalizeHookSlots(normalizedDraft.hook_slots),
    hook_no_duplicate_slots: Boolean(normalizedDraft.hook_no_duplicate_slots),
    knowledge_base_ids: normalizeIdList(normalizedDraft.knowledge_base_ids),
    web_search_enabled: Boolean(normalizedDraft.web_search_enabled),
    reuse_policy: normalizeReusePolicy(normalizedDraft.reuse_policy),
    content_strategy: normalizeContentStrategy(
      normalizedDraft.content_strategy
    ),
    video_format: normalizeVideoFormat(normalizedDraft.video_format),
  }
}

export function normalizeAutomationSchema(
  schema: AutomationSchema,
  automation: Automation
): AutomationSchema {
  const defaults = defaultAutomationSchema(automation)
  const source = schema
  const sourceRecord = source as unknown as Record<string, unknown>
  const sourceSchedule = source.schedule as AutomationSchedule & {
    interval?: LegacyAutomationScheduleInterval
  }
  const normalizedFormatting = normalizeFormatting(
    source.formatting,
    defaults.formatting
  )
  const normalizedContent = normalizedFormatting.find(
    (item) => item.id === "body"
  )

  return {
    ...defaults,
    ...source,
    automationKind: source.automationKind === "video" ? "video" : "slideshow",
    aspect_ratio: automationAspectRatios.includes(
      sourceRecord.aspect_ratio as AutomationAspectRatio
    )
      ? (sourceRecord.aspect_ratio as AutomationAspectRatio)
      : (normalizedContent?.aspect_ratio ?? defaults.aspect_ratio),
    font:
      clean(sourceRecord.font) ||
      normalizedContent?.textItems[0]?.font ||
      defaults.font,
    image_fit: normalizeAutomationImageFit(sourceRecord.image_fit),
    language: clean(sourceRecord.language) || defaultAutomationLanguage,
    created_at: toDate(source.created_at),
    title: source.title || automation.name,
    status: source.status === "paused" ? "paused" : "live",
    social_integrations: normalizeAutomationSocialIntegrations(
      source.social_integrations
    ),
    prompt_formatting: normalizePromptFormatting(
      source.prompt_formatting,
      defaults.prompt_formatting
    ),
    image_collection_ids: normalizeImageCollectionConfig(
      source.image_collection_ids,
      defaults.image_collection_ids
    ),
    tone: normalizeAutomationTone(
      source.tone ?? legacyToneFromFormatting(source.formatting),
      defaults.tone
    ),
    formatting: normalizedFormatting,
    tiktok_post_settings: {
      ...normalizeTikTokPostSettings(
        source.tiktok_post_settings,
        defaults.tiktok_post_settings
      ),
      ...(source.automationKind === "video" ? { publish_type: "video" } : {}),
    },
    social_post_settings: normalizeSocialPostSettings(
      source.social_post_settings,
      defaults.social_post_settings,
      source.tiktok_post_settings,
      source.social_publish_as
    ),
    social_publish_as: normalizeSocialPublishAs(
      source.social_publish_as,
      defaults.social_publish_as
    ),
    schedule: {
      timezone: sourceSchedule?.timezone ?? defaults.schedule.timezone,
      posting_times: normalizeSchedulePostingTimes(
        sourceSchedule,
        defaults.schedule.posting_times
      ),
      paused: Boolean(sourceSchedule?.paused),
      jitter_minutes: normalizeNonNegativeNumber(
        sourceSchedule?.jitter_minutes
      ),
      min_gap_minutes: normalizeNonNegativeNumber(
        sourceSchedule?.min_gap_minutes
      ),
    },
    hook_slots: normalizeHookSlots(source.hook_slots),
    hook_no_duplicate_slots: Boolean(source.hook_no_duplicate_slots),
    knowledge_base_ids: normalizeIdList(source.knowledge_base_ids),
    web_search_enabled: Boolean(source.web_search_enabled),
    reuse_policy: normalizeReusePolicy(source.reuse_policy),
    content_strategy: normalizeContentStrategy(source.content_strategy),
    video_format: normalizeVideoFormat(source.video_format),
  }
}

export function normalizeVideoFormat(
  value: unknown
): AutomationVideoFormat | undefined {
  if (!isRecord(value)) return undefined
  const template = automationVideoTemplateIds.includes(
    value.template as AutomationVideoTemplateId
  )
    ? (value.template as AutomationVideoTemplateId)
    : "ugc_ad"
  const segments = Array.isArray(value.segments)
    ? value.segments.flatMap(normalizeVideoSegment)
    : []
  if (template === "ugc_ad" && segments.length === 0) {
    return undefined
  }
  const templateSegments =
    template === "react_reveal"
      ? segments.map((segment) => {
          if (segment.id === "react-anticipation") {
            return {
              ...segment,
              mediaSource: "collection" as const,
              mediaKind: "video" as const,
              clipCount: 1,
              playFullVideo: true,
              transition: "cut" as const,
            }
          }
          if (segment.id === "react-reveal") {
            return {
              ...segment,
              mediaSource: "demo_asset" as const,
              mediaKind: "video" as const,
              clipCount: 1,
              playFullVideo: true,
              transition: "cut" as const,
            }
          }
          return segment
        })
      : segments
  return {
    template,
    hookPlacement:
      value.hookPlacement === "global" ? "global" : "first_segment",
    globalTextItems: Array.isArray(value.globalTextItems)
      ? value.globalTextItems.map(normalizeTextItem)
      : [],
    segments: templateSegments,
  }
}

function normalizeVideoSegment(value: unknown): AutomationVideoSegment[] {
  if (!isRecord(value)) return []
  return [
    {
      id:
        clean(value.id) || `segment-${Math.random().toString(36).slice(2, 10)}`,
      label: clean(value.label) || "Segment",
      guidance: clean(value.guidance),
      mediaSource:
        value.mediaSource === "demo_asset" ||
        value.mediaSource === "slideshow_automation"
          ? value.mediaSource
          : "collection",
      mediaKind: value.mediaKind === "image" ? "image" : "video",
      collectionId: clean(value.collectionId),
      demoAssetId: clean(value.demoAssetId),
      slideshowAutomationId: clean(value.slideshowAutomationId),
      clipCount: Math.max(
        1,
        Math.min(12, Math.round(numberValue(value.clipCount, 1)))
      ),
      clipDurationMs: Math.max(
        800,
        Math.min(60_000, Math.round(numberValue(value.clipDurationMs, 2500)))
      ),
      playFullVideo: value.playFullVideo === true,
      transition: value.transition === "fade" ? "fade" : "cut",
      textItems: Array.isArray(value.textItems)
        ? value.textItems.map(normalizeTextItem)
        : [],
    },
  ]
}

function normalizeContentStrategy(
  value: unknown
): AutomationContentStrategy | undefined {
  if (!isRecord(value) || !Array.isArray(value.routes)) return undefined
  const formats = new Set<AutomationContentFormat>([
    "visual_decision",
    "mistake_replacement",
    "designer_recommendation",
  ])
  const ctaStrategies = new Set<AutomationCtaStrategy>([
    "comment_prompt",
    "save_prompt",
    "customer_prompt",
  ])
  const routes = value.routes.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = clean(item.id)
    const format = clean(item.format) as AutomationContentFormat
    const ctaStrategy = clean(item.cta_strategy) as AutomationCtaStrategy
    const hookPatterns = normalizeIdList(item.hook_patterns)
    const collectionIds = normalizeIdList(item.collection_ids)
    if (
      !id ||
      !formats.has(format) ||
      !ctaStrategies.has(ctaStrategy) ||
      hookPatterns.length === 0 ||
      collectionIds.length === 0
    ) {
      return []
    }
    return [
      {
        id,
        format,
        hook_patterns: hookPatterns,
        collection_ids: collectionIds,
        cta_strategy: ctaStrategy,
      },
    ]
  })
  return routes.length > 0 ? { routes } : undefined
}

function normalizeIdList(value: unknown) {
  if (!Array.isArray(value)) return []
  return [
    ...new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    ),
  ]
}

export function automationFormatSection(
  schema: Pick<AutomationSchema, "formatting">,
  role: "hook" | "content" | "cta"
) {
  const id = role === "content" ? "body" : role
  return (
    schema.formatting.find(
      (item): item is AutomationFormatSection => item.id === id
    ) ?? defaultAutomationSection(id)
  )
}

export function updateAutomationFormatSection<
  K extends "hook" | "content" | "cta",
>(
  schema: AutomationSchema,
  role: K,
  patch: Partial<AutomationFormatSection>
): AutomationSchema {
  const id: AutomationFormatSectionId = role === "content" ? "body" : role
  const seen = new Set<string>()
  const formatting = schema.formatting.map((item) => {
    if (item.id !== id) {
      return item
    }
    seen.add(id)
    return {
      ...defaultAutomationSection(id),
      ...item,
      ...patch,
      id,
    } satisfies AutomationFormatSection
  })

  if (!seen.has(id)) {
    formatting.push({ ...defaultAutomationSection(id), ...patch, id })
  }

  return {
    ...schema,
    formatting,
  }
}

export function automationHooks(
  schema: Pick<AutomationSchema, "formatting" | "title"> &
    Partial<Pick<AutomationSchema, "prompt_formatting">>
) {
  const narrativeHooks = cleanHookLines(schema.prompt_formatting?.narrative)
  const hooks = automationStoredHooks(schema).filter(
    (hook) => !isAutomationHookInstruction(hook)
  )
  if (shouldUseNarrativeHooks(narrativeHooks, hooks)) {
    return narrativeHooks
  }
  if (hooks.length > 0) {
    return hooks
  }
  return narrativeHooks
}

export function automationStoredHooks(
  schema: Pick<AutomationSchema, "formatting">
) {
  const hookSection = automationFormatSection(schema, "hook")
  return hookSection.textItems
    .map((item) => textItemValue(item))
    .filter(Boolean)
}

function cleanHookLines(value: unknown) {
  if (typeof value !== "string") {
    return []
  }
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\d+[.)]\s*/, ""))
    .filter((line) => line && !isAutomationHookInstruction(line))
}

export function isAutomationHookInstruction(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  if (
    [
      "hook text",
      "hook text, all lowercase",
      "fixed hook text from the automation",
      "create a concise slideshow narrative for the selected topic.",
    ].includes(normalized)
  ) {
    return true
  }
  return (
    normalized.startsWith("hook text") ||
    [
      "lowercase numbered list introduction",
      "numbered list concept introduction",
      "numbered heading",
    ].some((marker) => normalized.startsWith(marker)) ||
    normalized.includes("using narratives") ||
    normalized.includes("content varies based on narrative") ||
    normalized.includes("e.g.")
  )
}

function shouldUseNarrativeHooks(
  narrativeHooks: string[],
  _storedHooks: string[]
) {
  return narrativeHooks.length > 0
}

export function schemaWithAutomationHooks(
  schema: AutomationSchema,
  hooks: string[]
): AutomationSchema {
  const nextHooks = hooks.filter(Boolean)

  return {
    ...schema,
    prompt_formatting: {
      ...schema.prompt_formatting,
      narrative: nextHooks.join("\n"),
    },
  }
}

export function schemaWithAutomationHookCase(
  schema: AutomationSchema,
  hookCase: import("@/lib/hook-casing").HookCaseMode
): AutomationSchema {
  return {
    ...schema,
    prompt_formatting: { ...schema.prompt_formatting, hook_case: hookCase },
  }
}

export function schemaWithAutomationHookSlots(
  schema: AutomationSchema,
  hookSlots: Record<string, string>
): AutomationSchema {
  return {
    ...schema,
    hook_slots: normalizeHookSlots(hookSlots),
  }
}

export function automationTone(schema: Pick<AutomationSchema, "tone">) {
  const tone = schema.tone
  return tone?.value || "Conversational & Relatable"
}

export function automationToneRawValue(schema: Pick<AutomationSchema, "tone">) {
  return schema.tone.value ?? ""
}

export function automationToneSelection(
  schema: Pick<AutomationSchema, "tone">
): AutomationTonePresetOption | "Custom" {
  const tone = schema.tone
  const value = tone?.value.trim().toLowerCase()
  const valueMatch = automationTonePresetOptions.find(
    (option) => option.toLowerCase() === value
  )
  if (valueMatch) return valueMatch

  const preset = tone?.preset.trim().toLowerCase()
  return tonePresetLabelByKey[preset ?? ""] ?? "Custom"
}

export function schemaWithAutomationTone(
  schema: AutomationSchema,
  value: string,
  preset = tonePresetKey(value)
): AutomationSchema {
  return {
    ...schema,
    tone: { value, preset },
  }
}

const tonePresetLabelByKey: Record<
  string,
  AutomationTonePresetOption | undefined
> = {
  conversational: "Conversational & Relatable",
  motivational: "Motivational & Empowering",
  educational: "Educational & Informative",
  bold: "Bold & Provocative",
  calm: "Calm & Reflective",
  witty: "Witty & Humorous",
  witty_relatable: "Witty & Relatable",
  practical_aspirational: "Practical & Aspirational",
  authoritative_reassuring: "Authoritative & Reassuring",
}

function tonePresetKey(value: string) {
  const label = automationTonePresetOptions.find(
    (option) => option.toLowerCase() === value.trim().toLowerCase()
  )
  if (!label) return "custom"
  return (
    Object.entries(tonePresetLabelByKey).find(
      ([, option]) => option === label
    )?.[0] ?? "custom"
  )
}

export function automationTotalSlideCount(
  schema: Pick<AutomationSchema, "prompt_formatting" | "formatting">
) {
  const configured = Number(schema.prompt_formatting?.num_of_slides)
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.round(configured))
  }
  const total = schema.formatting.reduce(
    (sum, item) => sum + Math.max(0, item.slideCount || 0),
    0
  )
  return Math.max(
    1,
    total || automationFormatSection(schema, "content").slideCount || 1
  )
}

export function postTextValue(setting: PostTextSetting) {
  return setting.mode === "static" ? setting.static_text : setting.prompt_text
}

export function postTextSettingWithValue(
  setting: PostTextSetting,
  value: string
): PostTextSetting {
  return setting.mode === "static"
    ? { ...setting, static_text: value }
    : { ...setting, prompt_text: value }
}

export function automationPublishType(
  schema: Pick<AutomationSchema, "tiktok_post_settings">
) {
  return schema.tiktok_post_settings.publish_type ?? "slideshow"
}

export function automationProviderPublishAs(
  schema: Pick<AutomationSchema, "social_publish_as">,
  provider: AutomationSocialProvider
): TikTokPublishType {
  const publishAs = schema.social_publish_as ?? {}
  const direct = publishAs[provider]
  const alias =
    provider === "twitter"
      ? publishAs.x
      : provider === "x"
        ? publishAs.twitter
        : undefined

  return direct === "video" || alias === "video" ? "video" : "slideshow"
}

export function automationProviderPublishesVideo(
  schema: Pick<
    AutomationSchema,
    "automationKind" | "social_publish_as" | "tiktok_post_settings"
  >,
  provider: AutomationSocialProvider
) {
  if (schema.automationKind === "video") {
    return true
  }
  return (
    automationPublishType(schema) === "video" &&
    automationProviderPublishAs(schema, provider) === "video"
  )
}

export function automationCollectionId(
  schema: Pick<AutomationSchema, "image_collection_ids">,
  role: "hook" | "content" | "cta"
) {
  if (role === "hook") {
    return schema.image_collection_ids.first_slide.collection
  }
  if (role === "cta") {
    return (
      schema.image_collection_ids.cta_slide.cta_collection_id ||
      schema.image_collection_ids.all_slides
    )
  }
  return schema.image_collection_ids.all_slides
}

export function automationCollectionIds(
  schema: Pick<AutomationSchema, "image_collection_ids">
) {
  return [
    automationCollectionId(schema, "hook"),
    automationCollectionId(schema, "content"),
    automationCollectionId(schema, "cta"),
  ].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index
  )
}

export function schemaWithAutomationCollectionId(
  schema: AutomationSchema,
  role: "hook" | "content" | "cta",
  collectionId: string
): AutomationSchema {
  if (role === "hook") {
    return {
      ...schema,
      image_collection_ids: {
        ...schema.image_collection_ids,
        first_slide: {
          ...schema.image_collection_ids.first_slide,
          collection: collectionId,
          mode: schema.image_collection_ids.first_slide.mode || "collection",
        },
      },
    }
  }
  if (role === "cta") {
    return {
      ...schema,
      image_collection_ids: {
        ...schema.image_collection_ids,
        cta_slide: {
          ...schema.image_collection_ids.cta_slide,
          check: true,
          cta_collection_check: true,
          cta_collection_id: collectionId,
        },
      },
    }
  }
  return {
    ...schema,
    image_collection_ids: {
      ...schema.image_collection_ids,
      all_slides: collectionId,
    },
  }
}

export function automationSharedSlideStyle(schema: AutomationSchema) {
  const content = automationFormatSection(schema, "content")
  return {
    aspectRatio: schema.aspect_ratio || content.aspect_ratio || "9:16",
    font: schema.font || content.textItems[0]?.font || "TikTok Display Medium",
    imageFit: schema.image_fit,
    overlay: content.overlay,
  }
}

export function schemaWithAutomationSharedSlideStyle(
  schema: AutomationSchema,
  patch: Partial<{
    aspectRatio: AutomationAspectRatio
    font: string
    imageFit: AutomationImageFit
    overlay: boolean
  }>
): AutomationSchema {
  return {
    ...schema,
    aspect_ratio: patch.aspectRatio ?? schema.aspect_ratio,
    font: patch.font ?? schema.font,
    image_fit: patch.imageFit ?? schema.image_fit,
    formatting: schema.formatting.map((item) => ({
      ...item,
      aspect_ratio: patch.aspectRatio ?? item.aspect_ratio,
      overlay: patch.overlay ?? item.overlay,
      textItems: item.textItems.map((textItem) => ({
        ...textItem,
        font: patch.font ?? textItem.font,
      })),
    })),
  }
}

export function normalizePostingTimes(
  value: unknown,
  fallback: AutomationSchedule["posting_times"]
): AutomationSchedule["posting_times"] {
  if (!Array.isArray(value)) {
    return fallback
  }
  const allDays: AutomationDay[] = [
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ]
  return value.slice(0, 5).map((item) => {
    const record =
      typeof item === "object" && item !== null
        ? (item as { time?: unknown; days?: unknown; enabled?: unknown })
        : {}
    return {
      time:
        typeof record.time === "string" && record.time.trim()
          ? record.time.trim()
          : defaultAutomationTemplateDefaults.schedule.defaultPostingTime,
      days:
        Array.isArray(record.days) && record.days.length > 0
          ? (record.days as AutomationDay[])
          : allDays,
      enabled: record.enabled === false ? false : undefined,
    }
  })
}

function normalizeScheduleInterval(
  value: unknown,
  fallback?: LegacyAutomationScheduleInterval
): LegacyAutomationScheduleInterval | undefined {
  const record =
    typeof value === "object" && value !== null
      ? (value as {
          every_n_hours?: unknown
          start_time?: unknown
          end_time?: unknown
          days?: unknown
          enabled?: unknown
        })
      : null
  if (!record) {
    return fallback
  }
  const everyNHours = Number(record.every_n_hours)
  if (!Number.isFinite(everyNHours) || everyNHours <= 0) {
    return fallback
  }
  return {
    every_n_hours: Math.max(1, Math.min(24, Math.floor(everyNHours))),
    start_time: clean(record.start_time) || "9:00 AM",
    end_time: clean(record.end_time) || "5:00 PM",
    days:
      Array.isArray(record.days) && record.days.length > 0
        ? (record.days as AutomationDay[])
        : ["Mon", "Tue", "Wed", "Thu", "Fri"],
    enabled: record.enabled === false ? false : undefined,
  }
}

function normalizeSchedulePostingTimes(
  schedule: (AutomationSchedule & { interval?: unknown }) | undefined,
  fallback: AutomationSchedule["posting_times"]
) {
  const interval = normalizeScheduleInterval(schedule?.interval)
  const explicit = normalizePostingTimes(
    schedule?.posting_times,
    interval ? [] : fallback
  )
  if (!interval || interval.enabled === false) return explicit

  const startMinutes = clockTimeMinutes(interval.start_time)
  const endMinutes = clockTimeMinutes(interval.end_time)
  if (
    startMinutes === undefined ||
    endMinutes === undefined ||
    endMinutes < startMinutes
  ) {
    return explicit
  }

  const generated: AutomationSchedule["posting_times"] = []
  const step = interval.every_n_hours * 60
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += step) {
    generated.push({
      time: minutesToClockTime(minutes),
      days: interval.days,
    })
  }

  const seen = new Set<string>()
  return [...explicit, ...generated]
    .filter((slot) => {
      const key = `${slot.time}|${slot.days.join(",")}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 5)
}

function clockTimeMinutes(value: string) {
  const match = clean(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i)
  if (!match) return undefined
  let hour = Number(match[1])
  const minute = Number(match[2])
  if (minute > 59 || hour > (match[3] ? 12 : 23)) return undefined
  if (match[3]) {
    hour %= 12
    if (match[3].toUpperCase() === "PM") hour += 12
  }
  return hour * 60 + minute
}

function minutesToClockTime(value: number) {
  const hours = Math.floor(value / 60) % 24
  const minutes = value % 60
  const suffix = hours >= 12 ? "PM" : "AM"
  const displayHour = hours % 12 || 12
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`
}

function normalizeNonNegativeNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function normalizeBoundedNumber(value: unknown, min: number, max: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : undefined
}

function normalizeHookSlots(value: unknown) {
  if (!isRecord(value)) {
    return undefined
  }
  const entries = Object.entries(value)
    .map(([key, collectionId]) => [clean(key), clean(collectionId)] as const)
    .filter(([key, collectionId]) => key && collectionId)
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeReusePolicy(
  value: unknown
): AutomationReusePolicy | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const policy: AutomationReusePolicy = {
    image_exclusion_days: normalizeNonNegativeNumber(
      value.image_exclusion_days
    ),
    image_exclusion_limit: normalizeNonNegativeNumber(
      value.image_exclusion_limit
    ),
    hook_exclusion_days: normalizeNonNegativeNumber(value.hook_exclusion_days),
    text_exclusion_days: normalizeNonNegativeNumber(value.text_exclusion_days),
    text_exclusion_limit: normalizeNonNegativeNumber(
      value.text_exclusion_limit
    ),
    text_similarity_threshold: normalizeBoundedNumber(
      value.text_similarity_threshold,
      0,
      1
    ),
  }
  return policy.image_exclusion_days ||
    policy.image_exclusion_limit ||
    policy.hook_exclusion_days ||
    policy.text_exclusion_days ||
    policy.text_exclusion_limit ||
    policy.text_similarity_threshold
    ? policy
    : undefined
}

export function automationCreatedAt(automation: Automation, index: number) {
  const maybeAutomation = automation as Automation & {
    created_at?: string | Date
  }
  if (maybeAutomation.created_at) {
    return new Date(maybeAutomation.created_at).getTime()
  }
  return DateTime.now().minus({ days: index }).toMillis()
}

export function labelToAspectRatio(value: string): AutomationAspectRatio {
  return value as AutomationAspectRatio
}

export function aspectRatioLabel(value: AutomationAspectRatio) {
  return value
}

export function labelToImageGrid(value: string): AutomationImageGrid {
  return value === "None" ? "none" : (value as AutomationImageGrid)
}

export function imageGridLabel(value: AutomationImageGrid) {
  return value === "none" ? "None" : value
}

export function wordLengthLabel(value: number) {
  return `${value} words`
}

export function labelToWordLength(value: string) {
  return Number(value.replace(" words", "")) || 5
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

function defaultAutomationSection(
  id: AutomationFormatSectionId
): AutomationFormatSection {
  return {
    id,
    image_url: "",
    textItems: [defaultAutomationTextItem()],
    aspect_ratio: "4:5",
    imageGrid: "none",
    slideCount: id === "hook" ? 1 : id === "body" ? 3 : 0,
    slideCountMode: "static",
    noText: false,
    overlay: id !== "cta",
    aiImageSelection: false,
    slideOverrides: [],
    imageOverrides: [],
    ctaLocation: id === "cta" ? "last" : undefined,
    imageMode: id === "cta" ? "collection" : undefined,
  }
}

function defaultImageCollectionConfig(): ImageCollectionConfig {
  const defaults = defaultAutomationTemplateDefaults.image_collection_ids
  return {
    first_slide: {
      ...defaults.first_slide,
    },
    all_slides: defaults.all_slides,
    cta_slide: {
      ...defaults.cta_slide,
    },
    video_demo_asset_id: defaults.video_demo_asset_id,
  }
}

function textItemValue(item: AutomationTextItem) {
  return (
    (item.textMode === "static" ? item.staticText : item.text) ||
    item.contentDirection ||
    item.staticText ||
    item.text
  )
}

function normalizePromptFormatting(
  value: unknown,
  fallback: PromptFormatting
): PromptFormatting {
  const record = isRecord(value) ? value : {}
  return {
    style: clean(record.style) || fallback.style,
    narrative:
      typeof record.narrative === "string"
        ? record.narrative.trim()
        : fallback.narrative,
    num_of_slides: numberValue(record.num_of_slides, fallback.num_of_slides),
    hook_case:
      record.hook_case === "lowercase" ||
      record.hook_case === "uppercase" ||
      record.hook_case === "title" ||
      record.hook_case === "sentence" ||
      record.hook_case === "mixed"
        ? record.hook_case
        : fallback.hook_case,
  }
}

function normalizeImageCollectionConfig(
  value: unknown,
  fallback: ImageCollectionConfig
): ImageCollectionConfig {
  const parsed = typeof value === "string" ? parseJsonRecord(value) : value
  const record = isRecord(parsed) ? parsed : {}
  const firstSlide = isRecord(record.first_slide) ? record.first_slide : {}
  const ctaSlide = isRecord(record.cta_slide) ? record.cta_slide : {}

  return {
    first_slide: {
      collection:
        clean(firstSlide.collection) || fallback.first_slide.collection,
      mode: firstSlide.mode === "single_image" ? "single_image" : "collection",
      single_image: clean(firstSlide.single_image) || null,
    },
    all_slides: clean(record.all_slides) || fallback.all_slides,
    cta_slide: {
      check: booleanValue(ctaSlide.check, fallback.cta_slide.check),
      cta_collection_check: booleanValue(
        ctaSlide.cta_collection_check,
        fallback.cta_slide.cta_collection_check
      ),
      cta_collection_id:
        clean(ctaSlide.cta_collection_id) ||
        fallback.cta_slide.cta_collection_id,
      image_id: clean(ctaSlide.image_id) || null,
      cta_location:
        clean(ctaSlide.cta_location) || fallback.cta_slide.cta_location,
    },
    video_demo_asset_id:
      clean(record.video_demo_asset_id) || fallback.video_demo_asset_id || "",
  }
}

function normalizeAutomationImageFit(value: unknown): AutomationImageFit {
  if (value === "cover" || value === "contain" || value === "fit") {
    return value
  }
  return defaultAutomationTemplateDefaults.image_fit
}

function normalizeFormatting(
  value: unknown,
  fallback: AutomationFormattingItem[]
): AutomationFormattingItem[] {
  const items = Array.isArray(value) ? value : fallback
  const normalized = items.flatMap((item) => normalizeFormattingItem(item))
  const roles: AutomationFormatSectionId[] = ["hook", "body", "cta"]

  for (const role of roles) {
    if (!normalized.some((item) => item.id === role)) {
      normalized.push(defaultAutomationSection(role))
    }
  }
  return normalized
}

function normalizeFormattingItem(value: unknown): AutomationFormattingItem[] {
  const record = isRecord(value) ? value : {}
  const id =
    record.id === "hook" || record.id === "body" || record.id === "cta"
      ? record.id
      : null
  if (!id) {
    return []
  }
  return [
    {
      ...defaultAutomationSection(id),
      id,
      image_url: clean(record.image_url),
      textItems: Array.isArray(record.textItems)
        ? record.textItems.map(normalizeTextItem)
        : defaultAutomationSection(id).textItems,
      aspect_ratio: automationAspectRatios.includes(
        record.aspect_ratio as AutomationAspectRatio
      )
        ? (record.aspect_ratio as AutomationAspectRatio)
        : defaultAutomationSection(id).aspect_ratio,
      imageGrid: automationImageGrids.includes(
        record.imageGrid as AutomationImageGrid
      )
        ? (record.imageGrid as AutomationImageGrid)
        : "none",
      slideCount: numberValue(
        record.slideCount,
        defaultAutomationSection(id).slideCount
      ),
      slideCountMode:
        record.slideCountMode === "varying" ? "varying" : "static",
      slideCountMin:
        record.slideCountMin === undefined
          ? undefined
          : Math.max(1, numberValue(record.slideCountMin, 1)),
      slideCountMax:
        record.slideCountMax === undefined
          ? undefined
          : Math.max(1, numberValue(record.slideCountMax, 1)),
      noText: Boolean(record.noText),
      overlay:
        typeof record.overlay === "boolean"
          ? record.overlay
          : defaultAutomationSection(id).overlay,
      aiImageSelection: Boolean(record.aiImageSelection),
      overlayImage: normalizeOverlayImage(record.overlayImage),
      slideOverrides: normalizeSlideOverrides(record.slideOverrides),
      imageOverrides: normalizeImageOverrides(record.imageOverrides),
      ctaLocation:
        record.ctaLocation === "static"
          ? "static"
          : record.ctaLocation === "last"
            ? "last"
            : defaultAutomationSection(id).ctaLocation,
      ctaStaticPosition: clean(record.ctaStaticPosition) || undefined,
      imageMode:
        record.imageMode === "single_image"
          ? "single_image"
          : record.imageMode === "collection"
            ? "collection"
            : defaultAutomationSection(id).imageMode,
    },
  ]
}

function normalizeAutomationTone(
  value: unknown,
  fallback: AutomationToneSection
): AutomationToneSection {
  const record = isRecord(value) ? value : {}
  return {
    value: clean(record.value) || fallback.value,
    preset: clean(record.preset) || fallback.preset,
  }
}

function legacyToneFromFormatting(value: unknown) {
  return Array.isArray(value)
    ? value.find((item) => isRecord(item) && item.id === "_tone")
    : undefined
}

function normalizeSlideOverrides(value: unknown): AutomationSlideOverride[] {
  return overrideRecordEntries(value).flatMap(({ record, fallbackIndex }) => {
    const contentDirection =
      clean(record.contentDirection) ||
      clean(record.content_direction) ||
      clean(record.prompt) ||
      clean(record.text)
    if (!contentDirection) {
      return []
    }

    return [
      {
        slideIndex: normalizeSlideIndex(record.slideIndex, fallbackIndex),
        contentDirection,
      },
    ]
  })
}

function normalizeImageOverrides(value: unknown): AutomationImageOverride[] {
  return overrideRecordEntries(value).flatMap(({ record, fallbackIndex }) => {
    const collectionId =
      clean(record.collectionId) ||
      clean(record.collection_id) ||
      clean(record.collection)
    if (!collectionId) {
      return []
    }

    return [
      {
        slideIndex: normalizeSlideIndex(record.slideIndex, fallbackIndex),
        collectionId,
      },
    ]
  })
}

function overrideRecordEntries(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      record: isRecord(item) ? item : {},
      fallbackIndex: index + 1,
    }))
  }

  if (!isRecord(value)) {
    return []
  }

  return Object.entries(value).map(([key, item], index) => {
    const numericKey = Number(key)
    return {
      record: isRecord(item) ? item : {},
      fallbackIndex: Number.isFinite(numericKey) ? numericKey + 1 : index + 1,
    }
  })
}

function normalizeSlideIndex(value: unknown, fallback: number) {
  return Math.max(1, Math.round(numberValue(value, fallback)))
}

function normalizeOverlayImage(
  value: unknown
): AutomationFormatSection["overlayImage"] {
  const record = isRecord(value) ? value : null
  if (!record) {
    return undefined
  }
  return {
    enabled: booleanValue(record.enabled, false),
    collectionId: clean(record.collectionId) || undefined,
    padding: numberValue(record.padding, 0),
  }
}

function normalizeTextItem(value: unknown): AutomationTextItem {
  const record = isRecord(value) ? value : {}
  return defaultAutomationTextItem({
    id: clean(record.id) || undefined,
    text: clean(record.text),
    fontSize: clean(record.fontSize) || "8px",
    textStyle: clean(record.textStyle) || "whiteText",
    font: clean(record.font) || "TikTok Display Medium",
    textPosition:
      record.textPosition === "top" ||
      record.textPosition === "bottom" ||
      record.textPosition === "center"
        ? record.textPosition
        : "center",
    textItemWidth: clean(record.textItemWidth) || "60%",
    wordLengthMin: numberValue(record.wordLengthMin, 5),
    wordLengthMax: numberValue(record.wordLengthMax, 10),
    contentDirection: clean(record.contentDirection),
    textMode: record.textMode === "static" ? "static" : "prompt",
    staticText: clean(record.staticText),
    textAlign:
      record.textAlign === "left" ||
      record.textAlign === "right" ||
      record.textAlign === "center"
        ? record.textAlign
        : "center",
    textAnchor: record.textAnchor === "flush" ? "flush" : "padded",
    textVerticalAnchor:
      record.textVerticalAnchor === "flush" ? "flush" : "padded",
  })
}

function normalizeTikTokPostSettings(
  value: unknown,
  fallback: AutomationSchema["tiktok_post_settings"]
): AutomationSchema["tiktok_post_settings"] {
  const record = isRecord(value) ? value : {}
  return {
    caption: normalizePostTextSetting(record.caption, fallback.caption),
    description: normalizePostTextSetting(
      record.description,
      fallback.description
    ),
    visibility:
      record.visibility === "MUTUAL_FOLLOW_FRIENDS" ||
      record.visibility === "SELF_ONLY"
        ? record.visibility
        : "PUBLIC_TO_EVERYONE",
    auto_music: booleanValue(record.auto_music, fallback.auto_music),
    auto_post: booleanValue(record.auto_post, fallback.auto_post),
    allow_comments: booleanValue(
      record.allow_comments,
      fallback.allow_comments
    ),
    allow_duet: booleanValue(record.allow_duet, fallback.allow_duet),
    allow_stitch: booleanValue(record.allow_stitch, fallback.allow_stitch),
    disclose_video_content: booleanValue(
      record.disclose_video_content,
      fallback.disclose_video_content
    ),
    disclose_brand_organic: booleanValue(
      record.disclose_brand_organic,
      fallback.disclose_brand_organic
    ),
    disclose_branded_content: booleanValue(
      record.disclose_branded_content,
      fallback.disclose_branded_content
    ),
    post_mode:
      record.post_mode === "DIRECT_POST" ? "DIRECT_POST" : "MEDIA_UPLOAD",
    publish_type:
      record.publish_type === "video"
        ? "video"
        : record.publish_type === "slideshow"
          ? "slideshow"
          : fallback.publish_type,
    slideshow_transition_style:
      clean(record.slideshow_transition_style) ||
      fallback.slideshow_transition_style ||
      defaultSlideshowTransition,
    slideshow_slide_duration: slideshowDurationValue(
      numberValue(
        record.slideshow_slide_duration,
        fallback.slideshow_slide_duration ?? defaultSlideshowDuration
      )
    ),
    slideshow_sound_id: clean(record.slideshow_sound_id),
    slideshow_sound_name: clean(record.slideshow_sound_name),
    slideshow_sound_url: clean(record.slideshow_sound_url),
  }
}

const socialPostSettingProviders: AutomationSocialProvider[] = [
  "tiktok",
  "instagram",
  "facebook",
  "youtube",
  "x",
  "linkedin",
  "pinterest",
  "threads",
  "telegram",
  "bluesky",
  "google-business-profile",
]

function defaultSocialPostSettings(
  tiktokSettings?: AutomationSchema["tiktok_post_settings"]
): AutomationSocialPostSettings {
  return Object.fromEntries(
    socialPostSettingProviders.map((provider) => [
      provider,
      automationPostFastProviderControls(provider, tiktokSettings),
    ])
  ) as AutomationSocialPostSettings
}

function automationPostFastProviderControls(
  provider: AutomationSocialProvider,
  tiktokSettings?: AutomationSchema["tiktok_post_settings"],
  socialPublishAs?: AutomationSocialPublishAs,
  overrides: Record<string, unknown> = {}
) {
  return defaultPostFastProviderControls(provider, {
    ...(provider === "tiktok" && tiktokSettings
      ? tiktokPostSettingsToPostFastControls(tiktokSettings)
      : {}),
    ...overrides,
    ...fixedAutomationProviderControls(
      provider,
      tiktokSettings,
      socialPublishAs
    ),
  })
}

function fixedAutomationProviderControls(
  provider: AutomationSocialProvider,
  tiktokSettings?: AutomationSchema["tiktok_post_settings"],
  socialPublishAs: AutomationSocialPublishAs = {}
): PostFastProviderControls {
  const video =
    (tiktokSettings?.publish_type ?? defaultAutomationPublishType) ===
      "video" &&
    automationProviderPublishAs(
      { social_publish_as: socialPublishAs },
      provider
    ) === "video"

  switch (provider) {
    case "instagram":
      return {
        instagramPublishType: video ? "REEL" : "TIMELINE",
        instagramPostToGrid: true,
      }
    case "facebook":
      return {
        facebookContentType: video ? "REEL" : "POST",
      }
    case "youtube":
      return {
        youtubeTitle: tiktokSettings
          ? tiktokPostSettingsToPostFastControls(tiktokSettings).tiktokTitle
          : "",
        youtubeIsShort: true,
        youtubeMadeForKids: false,
      }
    case "x":
    case "twitter":
      return {
        xRetweetUrl: "",
      }
    case "linkedin":
      return {
        linkedinAttachmentKey: "",
      }
    default:
      return {}
  }
}

function tiktokPostSettingsToPostFastControls(
  settings: AutomationSchema["tiktok_post_settings"]
) {
  return {
    tiktokTitle: postTextValue(settings.description),
    tiktokIsDraft: settings.post_mode === "MEDIA_UPLOAD",
    tiktokAllowComments: settings.allow_comments,
    tiktokAllowDuet: settings.allow_duet,
    tiktokAllowStitch: settings.allow_stitch,
    tiktokBrandOrganic: settings.disclose_brand_organic,
    tiktokBrandContent: settings.disclose_branded_content,
    tiktokAutoAddMusic: settings.auto_music,
    tiktokIsAigc: settings.disclose_video_content,
  }
}

function normalizeSocialPostSettings(
  value: unknown,
  fallback: AutomationSocialPostSettings,
  tiktokSettings?: AutomationSchema["tiktok_post_settings"],
  socialPublishAs?: AutomationSocialPublishAs
): AutomationSocialPostSettings {
  const record = isRecord(value) ? value : {}
  const defaults = {
    ...defaultSocialPostSettings(tiktokSettings),
    ...fallback,
  }

  return Object.fromEntries(
    socialPostSettingProviders.map((provider) => [
      provider,
      automationPostFastProviderControls(
        provider,
        tiktokSettings,
        socialPublishAs,
        {
          ...(defaults[provider] ?? {}),
          ...(isRecord(record[provider]) ? record[provider] : {}),
        }
      ),
    ])
  ) as AutomationSocialPostSettings
}

function normalizeSocialPublishAs(
  value: unknown,
  fallback: AutomationSocialPublishAs
): AutomationSocialPublishAs {
  const source = isRecord(value) ? value : {}
  const fallbackRecord = isRecord(fallback) ? fallback : {}
  return Object.fromEntries(
    socialPostSettingProviders.map((provider) => {
      const value = source[provider] ?? fallbackRecord[provider]
      return [provider, value === "video" ? "video" : "slideshow"]
    })
  ) as AutomationSocialPublishAs
}

export function normalizeAutomationSocialIntegrations(
  value: unknown
): AutomationSocialIntegration[] {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set<string>()
  return value.flatMap((item) => {
    const record = isRecord(item) ? item : {}
    const provider = normalizeSocialProvider(record.provider)
    const integrationId = clean(record.integration_id ?? record.id)

    if (!provider || !integrationId) {
      return []
    }

    const key = `${provider}:${integrationId}`
    if (seen.has(key)) {
      return []
    }
    seen.add(key)

    return [
      {
        provider,
        integration_id: integrationId,
        name:
          clean(record.name) ||
          clean(record.profile) ||
          providerLabel(provider),
        profile: clean(record.profile) || undefined,
        picture: clean(record.picture) || undefined,
        disabled:
          typeof record.disabled === "boolean" ? record.disabled : undefined,
      },
    ]
  })
}

function normalizeSocialProvider(
  value: unknown
): AutomationSocialProvider | null {
  const provider = clean(value).toLowerCase()
  switch (provider) {
    case "tiktok":
    case "tiktok-creative":
    case "tiktok-seller":
    case "youtube":
    case "instagram":
      return provider
    case "facebook":
    case "x":
    case "twitter":
    case "linkedin":
    case "threads":
    case "pinterest":
    case "bluesky":
    case "telegram":
    case "google":
    case "google-business-profile":
      return provider
    default:
      return null
  }
}

function providerLabel(provider: AutomationSocialProvider) {
  switch (provider) {
    case "youtube":
      return "YouTube"
    case "instagram":
      return "Instagram"
    case "tiktok":
      return "TikTok"
    case "tiktok-creative":
      return "TikTok Creative"
    case "tiktok-seller":
      return "TikTok Seller"
    case "facebook":
      return "Facebook"
    case "x":
      return "X"
    case "twitter":
      return "Twitter"
    case "linkedin":
      return "LinkedIn"
    case "threads":
      return "Threads"
    case "pinterest":
      return "Pinterest"
    case "bluesky":
      return "Bluesky"
    case "telegram":
      return "Telegram"
    case "google":
      return "Google"
    case "google-business-profile":
      return "Google Business Profile"
  }
}

function normalizePostTextSetting(
  value: unknown,
  fallback: PostTextSetting
): PostTextSetting {
  const record = isRecord(value) ? value : {}
  if ("value" in record) {
    return {
      mode: record.mode === "static" ? "static" : "prompt",
      static_text: record.mode === "static" ? clean(record.value) : "",
      prompt_text: record.mode === "static" ? "" : clean(record.value),
    }
  }
  return {
    mode: record.mode === "static" ? "static" : "prompt",
    static_text: clean(record.static_text) || fallback.static_text,
    prompt_text: clean(record.prompt_text) || fallback.prompt_text,
  }
}

function toDate(value: unknown) {
  const date =
    value instanceof Date
      ? value
      : new Date(typeof value === "string" ? value : Date.now())
  return Number.isFinite(date.getTime()) ? date : new Date()
}

function numberValue(value: unknown, fallback: number) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN
  return Number.isFinite(number) ? number : fallback
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback
}

function parseJsonRecord(value: string) {
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}
