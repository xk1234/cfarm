import { clean, isRecord } from "@/lib/guards"
import type { AutomationRecord } from "@/lib/automations"
import { expandHook } from "@/lib/hook-expansion"
import { getLumenclipChatPrompt } from "@/lib/langfuse-prompts"
import {
  openRouterChatCompletion,
  parseOpenRouterContent,
} from "@/lib/openrouter"
import { automationHooks, automationTone } from "@/lib/realfarm-automation"
import { openRouterModelForUseCase } from "@/lib/realfarm-generation-model-registry"
import {
  normalizeSocialPostHashtags,
  normalizeSocialPostMetadata,
  socialPostMetadataPromptLines,
  socialPostMetadataSchemaProperties,
} from "@/lib/social-post-metadata"
import { toneRequestsLowercase } from "@/lib/temp-slide-testing"
import {
  buildVideoCopySystemPrompt,
  buildVideoCopyUserPrompt,
  type VideoCopyItem,
  type VideoCopySegmentRole,
} from "@/lib/video-copy-prompt"
import { listWordCollections } from "@/lib/word-collections"

const commentGateTemplates = new Set(["story_over_broll", "faceless_reel"])

export type GeneratedVideoCopy = {
  hook: string
  substitutions: Record<string, string>
  title: string
  caption: string
  hashtags: string[]
  texts: Record<string, string | string[]>
}

export async function generateVideoCopy(input: {
  record: AutomationRecord
  template?: string
  items?: VideoCopyItem[]
  segmentRoles?: VideoCopySegmentRole[]
  requestedHook?: string
}): Promise<GeneratedVideoCopy> {
  const items = input.items ?? []
  const segmentRoles = input.segmentRoles ?? []
  const hooks = automationHooks(input.record.schema)
  const rawHook =
    hooks.length > 0
      ? hooks[Math.floor(Math.random() * hooks.length)]
      : input.record.name
  const wordCollections = await listWordCollections()
  const expanded = clean(input.requestedHook)
    ? { text: clean(input.requestedHook), substitutions: {} }
    : expandHook(
        rawHook,
        input.record.schema.hook_slots,
        wordCollections,
        Math.random,
        {
          noDuplicates: Boolean(input.record.schema.hook_no_duplicate_slots),
          caseMode: input.record.schema.prompt_formatting.hook_case,
          now: new Date(),
          timeZone: input.record.schema.schedule.timezone,
        }
      )
  const hook = expanded.text
  const substitutions = expanded.substitutions
  const fallback = fallbackVideoSocialCopy(input.record, hook)
  const lowercase = toneRequestsLowercase(automationTone(input.record.schema))
  const videoFormat =
    clean(input.template) ||
    input.record.schema.video_format?.template ||
    "video"
  const requiresCommentGate = commentGateTemplates.has(videoFormat)
  const apiKey = clean(process.env.OPENROUTER_API_KEY)
  if (!apiKey) {
    return { hook, substitutions, texts: {}, ...fallback }
  }

  const managedPrompt = await getLumenclipChatPrompt("videoCopy", {
    system_prompt: buildVideoCopySystemPrompt({ requiresCommentGate }),
    user_prompt: buildVideoCopyUserPrompt({
      automationName: input.record.name,
      videoFormat,
      tone: automationTone(input.record.schema),
      style: input.record.schema.prompt_formatting.style || "(none)",
      hook,
      segmentRoles,
      metadataPromptLines: socialPostMetadataPromptLines("video"),
      requiresCommentGate,
      lowercase,
      items,
    }),
  })
  const { ok, payload } = await openRouterChatCompletion({
    apiKey,
    model: openRouterModelForUseCase("slideshowText"),
    messages: managedPrompt.messages,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "video_copy_generation",
        strict: true,
        schema: videoCopyStructuredOutputSchema(items),
      },
    },
    timeoutMs: 45_000,
    trace: { feature: "video-copy", prompt: managedPrompt.prompt },
  })
  const generated = ok
    ? parseVideoCopy(
        parseOpenRouterContent(payload.choices?.[0]?.message?.content),
        items,
        {
          lowercase: lowercase && !requiresCommentGate,
        }
      )
    : null
  return {
    hook,
    substitutions,
    title: generated?.title || fallback.title,
    caption: generated?.caption || fallback.caption,
    hashtags: generated?.hashtags.length
      ? generated.hashtags
      : fallback.hashtags,
    texts: generated?.texts ?? {},
  }
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
          if (lines.length > 0) texts[item.id] = lines
          continue
        }
        const text = clean(value)
        if (text) texts[item.id] = text
      }
    }
    return { ...normalizeSocialPostMetadata(parsed, options), texts }
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
