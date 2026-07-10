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
export type AutomationAspectRatio =
  "fit" | "9:16" | "4:5" | "3:4" | "3:2" | "1:1"
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
}

export type ImageCollectionConfig = {
  first_slide: {
    collection: string
    mode: AutomationImageMode
    single_image: string | null
  }
  all_slides: string
  aspect_ratio?: AutomationAspectRatio
  is_bg_overlay_on?: boolean
  cta_slide: {
    check: boolean
    cta_collection_check: boolean
    cta_collection_id: string
    image_id: string | null
    cta_location: "last_slide" | string
  }
  keepOriginalAspectRatio?: boolean
  background_opacity?: number
  is_bg_overlay_on_hook_image?: boolean
  textOnFirstSlideOnly?: boolean
  noTextOnSlides?: boolean
  autoPullImagesNotCollections?: boolean
  autoImagesNoTextOnImages?: boolean
  disableAutoImageForFirstSlide?: boolean
  video_demo_asset_id?: string
  language?: string
}

export type PostTextSetting = {
  mode: "prompt" | "static"
  static_text: string
  prompt_text: string
}

export type AutomationTextItem = {
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
}

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
  noText: boolean
  overlay: boolean
  overlayOpacity: number
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
  id: "_tone"
  value: string
  preset: string
}

export type AutomationFormattingItem =
  AutomationFormatSection | AutomationToneSection

export type AutomationTemplate = Pick<
  AutomationSchema,
  | "automationKind"
  | "prompt_formatting"
  | "formatting"
  | "tiktok_post_settings"
  | "image_collection_ids"
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
  interval?: {
    every_n_hours: number
    start_time: Time
    end_time: Time
    days: AutomationDay[]
    enabled?: boolean
  }
}

export type AutomationReusePolicy = {
  image_exclusion_days?: number
  image_exclusion_limit?: number
  hook_exclusion_days?: number
  text_exclusion_days?: number
  text_exclusion_limit?: number
  text_similarity_threshold?: number
}

export type AutomationSchema = {
  automationKind: "slideshow" | "video"
  created_at: Date
  title: string
  status: AutomationStatus
  social_integrations: AutomationSocialIntegration[]
  prompt_formatting: PromptFormatting
  image_collection_ids: ImageCollectionConfig
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
  reuse_policy?: AutomationReusePolicy
}

export const automationAspectRatios: AutomationAspectRatio[] = [
  "fit",
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
): AutomationTemplate {
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
    prompt_formatting: {
      ...defaultAutomationTemplateDefaults.prompt_formatting,
    },
    image_collection_ids: defaultImageCollectionConfig(),
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
        overlayOpacity: hookDefaults.overlayOpacity,
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
        overlayOpacity: bodyDefaults.overlayOpacity,
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
        overlayOpacity: ctaDefaults.overlayOpacity,
        imageMode: ctaDefaults.imageMode,
      },
      {
        id: "_tone",
        value: tone,
        preset: "custom",
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
      interval: normalizeScheduleInterval(
        normalizedDraft.schedule.interval,
        defaults.schedule.interval
      ),
    },
    hook_slots: normalizeHookSlots(normalizedDraft.hook_slots),
    reuse_policy: normalizeReusePolicy(normalizedDraft.reuse_policy),
  }
}

export function normalizeAutomationSchema(
  schema: AutomationSchema,
  automation: Automation
): AutomationSchema {
  const defaults = defaultAutomationSchema(automation)
  const source = schema

  return {
    ...defaults,
    ...source,
    automationKind: source.automationKind === "video" ? "video" : "slideshow",
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
    formatting: normalizeFormatting(source.formatting, defaults.formatting),
    tiktok_post_settings: normalizeTikTokPostSettings(
      source.tiktok_post_settings,
      defaults.tiktok_post_settings
    ),
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
      timezone: source.schedule?.timezone ?? defaults.schedule.timezone,
      posting_times: normalizePostingTimes(
        source.schedule?.posting_times,
        defaults.schedule.posting_times
      ),
      paused: Boolean(source.schedule?.paused),
      jitter_minutes: normalizeNonNegativeNumber(
        source.schedule?.jitter_minutes
      ),
      min_gap_minutes: normalizeNonNegativeNumber(
        source.schedule?.min_gap_minutes
      ),
      interval: normalizeScheduleInterval(source.schedule?.interval),
    },
    hook_slots: normalizeHookSlots(source.hook_slots),
    reuse_policy: normalizeReusePolicy(source.reuse_policy),
  }
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
  storedHooks: string[]
) {
  if (narrativeHooks.length === 0) {
    return false
  }
  return narrativeHooks.length > 1 || storedHooks.length === 0
}

export function schemaWithAutomationHooks(
  schema: AutomationSchema,
  hooks: string[]
): AutomationSchema {
  const nextHooks = hooks.filter(Boolean)
  const textItems = nextHooks.map((hook, index) =>
    defaultAutomationTextItem({
      ...(automationFormatSection(schema, "hook").textItems[index] ?? {}),
      contentDirection: hook,
      text: "",
      staticText: "",
      textMode: "prompt",
    })
  )

  return {
    ...updateAutomationFormatSection(schema, "hook", { textItems }),
    prompt_formatting: {
      ...schema.prompt_formatting,
      narrative: nextHooks.join("\n"),
    },
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

export function automationTone(schema: Pick<AutomationSchema, "formatting">) {
  const tone = schema.formatting.find(
    (item): item is AutomationToneSection => item.id === "_tone"
  )
  return tone?.value || "Conversational & Relatable"
}

export function schemaWithAutomationTone(
  schema: AutomationSchema,
  value: string
): AutomationSchema {
  const hasTone = schema.formatting.some((item) => item.id === "_tone")
  return {
    ...schema,
    formatting: hasTone
      ? schema.formatting.map((item) =>
          item.id === "_tone" ? { ...item, value, preset: "custom" } : item
        )
      : [...schema.formatting, { id: "_tone", value, preset: "custom" }],
  }
}

export function automationTotalSlideCount(
  schema: Pick<AutomationSchema, "prompt_formatting" | "formatting">
) {
  const configured = Number(schema.prompt_formatting?.num_of_slides)
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.round(configured))
  }
  const total = schema.formatting.reduce(
    (sum, item) =>
      item.id === "_tone" ? sum : sum + Math.max(0, item.slideCount || 0),
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
  schema: Pick<AutomationSchema, "social_publish_as" | "tiktok_post_settings">,
  provider: AutomationSocialProvider
) {
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
  fallback?: AutomationSchedule["interval"]
): AutomationSchedule["interval"] {
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
  return value === "Fit" ? "fit" : (value as AutomationAspectRatio)
}

export function aspectRatioLabel(value: AutomationAspectRatio) {
  return value === "fit" ? "Fit" : value
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
    aspect_ratio: id === "cta" ? "fit" : "4:5",
    imageGrid: "none",
    slideCount: id === "hook" ? 1 : id === "body" ? 3 : 0,
    noText: false,
    overlay: id !== "cta",
    overlayOpacity: 25,
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
    aspect_ratio: defaults.aspect_ratio,
    is_bg_overlay_on: defaults.is_bg_overlay_on,
    cta_slide: {
      ...defaults.cta_slide,
    },
    keepOriginalAspectRatio: defaults.keepOriginalAspectRatio,
    background_opacity: defaults.background_opacity,
    is_bg_overlay_on_hook_image: defaults.is_bg_overlay_on_hook_image,
    textOnFirstSlideOnly: defaults.textOnFirstSlideOnly,
    noTextOnSlides: defaults.noTextOnSlides,
    autoPullImagesNotCollections: defaults.autoPullImagesNotCollections,
    autoImagesNoTextOnImages: defaults.autoImagesNoTextOnImages,
    disableAutoImageForFirstSlide: defaults.disableAutoImageForFirstSlide,
    video_demo_asset_id: defaults.video_demo_asset_id,
    language: defaults.language,
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
    aspect_ratio: automationAspectRatios.includes(
      record.aspect_ratio as AutomationAspectRatio
    )
      ? (record.aspect_ratio as AutomationAspectRatio)
      : fallback.aspect_ratio,
    is_bg_overlay_on: booleanValue(
      record.is_bg_overlay_on,
      fallback.is_bg_overlay_on ?? true
    ),
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
    keepOriginalAspectRatio: booleanValue(
      record.keepOriginalAspectRatio,
      fallback.keepOriginalAspectRatio ?? true
    ),
    background_opacity: numberValue(
      record.background_opacity,
      fallback.background_opacity ?? 25
    ),
    is_bg_overlay_on_hook_image: booleanValue(
      record.is_bg_overlay_on_hook_image,
      fallback.is_bg_overlay_on_hook_image ?? true
    ),
    textOnFirstSlideOnly: booleanValue(
      record.textOnFirstSlideOnly,
      fallback.textOnFirstSlideOnly ?? false
    ),
    noTextOnSlides: booleanValue(
      record.noTextOnSlides,
      fallback.noTextOnSlides ?? false
    ),
    autoPullImagesNotCollections: booleanValue(
      record.autoPullImagesNotCollections,
      fallback.autoPullImagesNotCollections ?? false
    ),
    autoImagesNoTextOnImages: booleanValue(
      record.autoImagesNoTextOnImages,
      fallback.autoImagesNoTextOnImages ?? false
    ),
    disableAutoImageForFirstSlide: booleanValue(
      record.disableAutoImageForFirstSlide,
      fallback.disableAutoImageForFirstSlide ?? false
    ),
    video_demo_asset_id:
      clean(record.video_demo_asset_id) || fallback.video_demo_asset_id || "",
    language:
      clean(record.language) || fallback.language || defaultAutomationLanguage,
  }
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
  if (!normalized.some((item) => item.id === "_tone")) {
    const fallbackTone = fallback.find(
      (item): item is AutomationToneSection => item.id === "_tone"
    )
    normalized.push(
      fallbackTone ?? {
        id: "_tone",
        value: "Conversational & Relatable",
        preset: "custom",
      }
    )
  }

  return normalized
}

function normalizeFormattingItem(value: unknown): AutomationFormattingItem[] {
  const record = isRecord(value) ? value : {}
  if (record.id === "_tone") {
    return [
      {
        id: "_tone",
        value: clean(record.value) || "Conversational & Relatable",
        preset: clean(record.preset) || "custom",
      },
    ]
  }
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
      noText: Boolean(record.noText),
      overlay:
        typeof record.overlay === "boolean"
          ? record.overlay
          : defaultAutomationSection(id).overlay,
      overlayOpacity: numberValue(record.overlayOpacity, 25),
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
