import { DateTime } from "luxon"

import type { Automation } from "@/lib/realfarm-data"

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
  | "prompt_formatting"
  | "formatting"
  | "tiktok_post_settings"
  | "image_collection_ids"
>

export type AutomationSchedule = {
  timezone: string
  posting_times: {
    time: Time
    days: AutomationDay[]
  }[]
}

export type AutomationSchema = {
  created_at: Date
  title: string
  status: AutomationStatus
  tiktok_account_id: string | null
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
  }
  schedule: AutomationSchedule
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
    tiktok_account_id: automation.account.startsWith("@")
      ? automation.account
      : null,
    ...defaultAutomationTemplate(automation),
    schedule: {
      timezone: DateTime.local().zoneName,
      posting_times: (automation.times.length > 0
        ? automation.times
        : ["11:00 AM"]
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
  const tone =
    {
      ugc: "Conversational & Relatable",
      cinema: "Bold & Provocative",
      nature: "Calm & Reflective",
      soccer: "Motivational & Empowering",
      books: "Educational & Informative",
    }[automation.theme] ?? "Conversational & Relatable"

  return {
    prompt_formatting: {
      style:
        "The first slide should have one strong hook text item. Body slides should use concise supporting text. Keep text readable and native to TikTok slideshow memes.",
      narrative: "Create a concise slideshow narrative for the selected topic.",
      num_of_slides: 4,
    },
    image_collection_ids: defaultImageCollectionConfig(),
    formatting: [
      {
        id: "hook",
        image_url: "",
        textItems: [
          defaultAutomationTextItem({
            fontSize: "10px",
            textStyle: "whiteText",
            wordLengthMin: 5,
            wordLengthMax: 10,
            contentDirection: "hook text, all lowercase",
            textAlign: "left",
            textAnchor: "flush",
          }),
        ],
        aspect_ratio: "4:5",
        imageGrid: "none",
        slideCount: 1,
        noText: false,
        overlay: true,
        overlayOpacity: 25,
      },
      {
        id: "body",
        image_url: "",
        textItems: [
          defaultAutomationTextItem({
            fontSize: "8px",
            textStyle: "whiteText",
            textItemWidth: "80%",
            wordLengthMin: 5,
            wordLengthMax: 10,
            contentDirection: "short supporting text, all lowercase",
            textAlign: "left",
            textAnchor: "flush",
          }),
        ],
        aspect_ratio: "4:5",
        imageGrid: "none",
        slideCount: 3,
        noText: false,
        overlay: true,
        overlayOpacity: 25,
      },
      {
        id: "cta",
        image_url: "",
        textItems: [
          defaultAutomationTextItem({
            fontSize: "12px",
            textStyle: "yellowText",
            textItemWidth: "70%",
            wordLengthMin: 5,
            wordLengthMax: 10,
            textAlign: "center",
          }),
        ],
        aspect_ratio: "fit",
        imageGrid: "none",
        slideCount: 0,
        ctaLocation: "last",
        ctaStaticPosition: undefined,
        noText: false,
        overlay: false,
        overlayOpacity: 25,
        imageMode: "collection",
      },
      {
        id: "_tone",
        value: tone,
        preset: "custom",
      },
    ],
    tiktok_post_settings: {
      caption: {
        mode: "prompt",
        static_text: "",
        prompt_text:
          'this should be in "lowercase," same exact text as the first text item.',
      },
      description: {
        mode: "prompt",
        static_text: "",
        prompt_text:
          "give me 3-5 broad hashtags related to the topic/niche of the content, all lowercase, nothing else other than 3-5 hashtags",
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
    schedule: {
      ...defaults.schedule,
      ...normalizedDraft.schedule,
      posting_times: normalizePostingTimes(
        normalizedDraft.schedule.posting_times,
        defaults.schedule.posting_times
      ),
    },
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
    created_at: toDate(source.created_at),
    title: source.title || automation.name,
    status: source.status === "paused" ? "paused" : "live",
    tiktok_account_id: source.tiktok_account_id ?? defaults.tiktok_account_id,
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
    schedule: {
      timezone: source.schedule?.timezone ?? defaults.schedule.timezone,
      posting_times: normalizePostingTimes(
        source.schedule?.posting_times,
        defaults.schedule.posting_times
      ),
    },
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
  schema: Pick<AutomationSchema, "formatting" | "title">
) {
  const hooks = automationStoredHooks(schema)
  return hooks.length > 0 ? hooks : [schema.title]
}

export function automationStoredHooks(
  schema: Pick<AutomationSchema, "formatting">
) {
  const hookSection = automationFormatSection(schema, "hook")
  return hookSection.textItems
    .map((item) => textItemValue(item))
    .filter(Boolean)
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

  return updateAutomationFormatSection(schema, "hook", { textItems })
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
  ].filter((value): value is string => Boolean(value))
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
        ? (item as { time?: unknown; days?: unknown })
        : {}
    return {
      time:
        typeof record.time === "string" && record.time.trim()
          ? record.time.trim()
          : "11:00 AM",
      days:
        Array.isArray(record.days) && record.days.length > 0
          ? (record.days as AutomationDay[])
          : allDays,
    }
  })
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
    ctaLocation: id === "cta" ? "last" : undefined,
    imageMode: id === "cta" ? "collection" : undefined,
  }
}

function defaultImageCollectionConfig(): ImageCollectionConfig {
  return {
    first_slide: {
      collection: "",
      mode: "collection",
      single_image: null,
    },
    all_slides: "",
    aspect_ratio: "9:16",
    is_bg_overlay_on: true,
    cta_slide: {
      check: true,
      cta_collection_check: true,
      cta_collection_id: "",
      image_id: null,
      cta_location: "last_slide",
    },
    keepOriginalAspectRatio: true,
    background_opacity: 25,
    is_bg_overlay_on_hook_image: true,
    textOnFirstSlideOnly: false,
    noTextOnSlides: false,
    autoPullImagesNotCollections: false,
    autoImagesNoTextOnImages: false,
    disableAutoImageForFirstSlide: false,
    language: "English",
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
    language: clean(record.language) || fallback.language || "English",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
