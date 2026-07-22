import { clean, isRecord } from "@/lib/guards"
import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { getAutomationRecord, type AutomationRecord } from "@/lib/automations"
import { expandHook } from "@/lib/hook-expansion"
import {
  openRouterChatCompletion,
  parseOpenRouterContent,
} from "@/lib/openrouter"
import { automationHooks, automationTone } from "@/lib/realfarm-automation"
import { openRouterModelForUseCase } from "@/lib/realfarm-generation-model-registry"
import { listWordCollections } from "@/lib/word-collections"
import {
  normalizeSocialPostHashtags,
  normalizeSocialPostMetadata,
  socialPostMetadataPromptLines,
  socialPostMetadataSchemaProperties,
} from "@/lib/social-post-metadata"
import { styleRequestsLowercase } from "@/lib/temp-slide-testing"
import {
  buildVideoCopySystemPrompt,
  buildVideoCopyUserPrompt,
  type VideoCopyItem,
  type VideoCopySegmentRole,
} from "@/lib/video-copy-prompt"

export const dynamic = "force-dynamic"

const commentGateTemplates = new Set(["story_over_broll", "faceless_reel"])

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const automationId = clean(payload?.automationId)
  const template = clean(payload?.template)
  const items = parseItems(payload?.items)
  const segmentRoles = parseSegmentRoles(payload?.segmentRoles)

  if (!automationId) {
    return NextResponse.json(
      { error: "An automation id is required" },
      { status: 400 }
    )
  }

  const record = await getAutomationRecord(automationId)
  if (!record) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 })
  }

  const hooks = automationHooks(record.schema)
  const rawHook =
    hooks.length > 0
      ? hooks[Math.floor(Math.random() * hooks.length)]
      : record.name
  const wordCollections = await listWordCollections()
  const requestedHook = clean(payload?.hook)
  const expanded = requestedHook
    ? { text: requestedHook, substitutions: {} }
    : expandHook(
        rawHook,
        record.schema.hook_slots,
        wordCollections,
        Math.random,
        {
          noDuplicates: Boolean(record.schema.hook_no_duplicate_slots),
          caseMode: record.schema.prompt_formatting.hook_case,
          now: new Date(),
          timeZone: record.schema.schedule.timezone,
        }
      )
  const hook = expanded.text
  const substitutions = expanded.substitutions
  const fallback = fallbackVideoSocialCopy(record, hook)
  const lowercase = styleRequestsLowercase(
    record.schema.prompt_formatting.style
  )
  const videoFormat =
    template || record.schema.video_format?.template || "video"
  const requiresCommentGate = commentGateTemplates.has(videoFormat)

  const apiKey = clean(process.env.OPENROUTER_API_KEY)
  if (!apiKey) {
    return NextResponse.json({ hook, substitutions, texts: {}, ...fallback })
  }

  const { ok, payload: openRouterPayload } = await openRouterChatCompletion({
    apiKey,
    model: openRouterModelForUseCase("slideshowText"),
    messages: [
      {
        role: "system",
        content: buildVideoCopySystemPrompt({ requiresCommentGate }),
      },
      {
        role: "user",
        content: buildVideoCopyUserPrompt({
          automationName: record.name,
          videoFormat,
          tone: automationTone(record.schema),
          style: record.schema.prompt_formatting.style || "(none)",
          hook,
          segmentRoles,
          metadataPromptLines: socialPostMetadataPromptLines("video"),
          requiresCommentGate,
          lowercase,
          items,
        }),
      },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "video_copy_generation",
        strict: true,
        schema: videoCopyStructuredOutputSchema(items),
      },
    },
    timeoutMs: 45_000,
  })

  const content = parseOpenRouterContent(
    openRouterPayload.choices?.[0]?.message?.content
  )
  const generated = ok
    ? parseVideoCopy(content, items, {
        lowercase: lowercase && !requiresCommentGate,
      })
    : null
  return NextResponse.json({
    hook,
    substitutions,
    title: generated?.title || fallback.title,
    caption: generated?.caption || fallback.caption,
    // Temporary compatibility alias for clients created before `caption`.
    description: generated?.caption || fallback.caption,
    hashtags: generated?.hashtags.length
      ? generated.hashtags
      : fallback.hashtags,
    texts: generated?.texts ?? {},
  })
})

function parseItems(value: unknown): VideoCopyItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const id = clean(item.id)
    if (!id) return []
    return [
      {
        id,
        segmentLabel: clean(item.segmentLabel),
        guidance: clean(item.guidance),
        contentDirection: clean(item.contentDirection),
        wordLengthMin: boundedWordCount(item.wordLengthMin, 4),
        wordLengthMax: boundedWordCount(item.wordLengthMax, 12),
        count: Math.max(1, Math.min(12, boundedWordCount(item.count, 1))),
      },
    ]
  })
}

function parseSegmentRoles(value: unknown): VideoCopySegmentRole[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((segment) => {
    if (!isRecord(segment)) return []
    const id = clean(segment.id)
    const label = clean(segment.label)
    if (!id || !label) return []
    return [
      {
        id,
        label,
        guidance: clean(segment.guidance),
      },
    ]
  })
}

function boundedWordCount(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(140, Math.round(parsed))
    : fallback
}

function parseVideoCopy(
  content: string,
  items: VideoCopyItem[],
  options: { lowercase?: boolean } = {}
) {
  try {
    const parsed = JSON.parse(
      content.replace(/^```json?\s*/i, "").replace(/```\s*$/, "")
    )
    const source = isRecord(parsed?.texts) ? parsed.texts : parsed
    const texts: Record<string, string | string[]> = {}
    if (isRecord(source)) {
      for (const item of items) {
        const value = source[item.id]
        if (Array.isArray(value)) {
          const lines = value.map((line) => clean(line)).filter(Boolean)
          if (lines.length > 0) {
            texts[item.id] = lines
          }
          continue
        }
        const text = clean(value)
        if (text) {
          texts[item.id] = text
        }
      }
    }
    return {
      ...normalizeSocialPostMetadata(parsed, options),
      texts,
    }
  } catch {
    return null
  }
}

function fallbackVideoSocialCopy(record: AutomationRecord, hook: string) {
  const captionSetting = record.schema.tiktok_post_settings.description
  const configuredCaption =
    captionSetting.mode === "static" ? captionSetting.static_text : ""
  const caption = configuredCaption || hook
  const existingTags = normalizeSocialPostHashtags(caption.match(/#[\w-]+/g))
  const automationTag = `#${
    record.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 30) || "video"
  }`
  return {
    title: hook || record.name,
    caption,
    hashtags:
      existingTags.length > 0
        ? existingTags
        : [automationTag, "#video", "#socialmedia"],
  }
}

function videoCopyStructuredOutputSchema(items: VideoCopyItem[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      ...socialPostMetadataSchemaProperties("video"),
      texts: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(
          items.map((item) => [
            item.id,
            item.count > 1
              ? {
                  type: "array",
                  minItems: item.count,
                  maxItems: item.count,
                  items: { type: "string", minLength: 1 },
                }
              : { type: "string", minLength: 1 },
          ])
        ),
        required: items.map((item) => item.id),
      },
    },
    required: ["title", "caption", "hashtags", "texts"],
  }
}
