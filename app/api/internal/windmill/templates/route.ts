import { authorizeWindmillRequest } from "@/lib/windmill-auth"
import { listAutomationRecords, type AutomationRecord } from "@/lib/automations"
import { clean, isRecord } from "@/lib/guards"
import { withSystemOwner } from "@/lib/system-owner-context"
import type { XAutomationRecord } from "@/lib/x-automation"
import { listXAutomations } from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

type TemplateKind = "slideshow" | "ugc" | "video" | "x_threads"

export async function POST(request: Request) {
  if (!authorizeWindmillRequest(request.headers.get("authorization"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as unknown
  if (!isRecord(body)) {
    return Response.json(
      { error: "ownerId and kind are required" },
      { status: 400 }
    )
  }
  const ownerId = clean(body.ownerId)
  const kind = clean(body.kind) as TemplateKind
  if (!ownerId || !isTemplateKind(kind)) {
    return Response.json(
      { error: "ownerId and kind are required" },
      { status: 400 }
    )
  }

  const options = await withSystemOwner(ownerId, async () => {
    if (kind === "x_threads") {
      return (await listXAutomations())
        .filter((record) => !record.hidden)
        .map(xAutomationOption)
    }
    return (await listAutomationRecords())
      .filter(
        (record) => !record.hidden && record.schema.automationKind === kind
      )
      .map(automationOption)
  })

  return Response.json({ options })
}

function isTemplateKind(value: string): value is TemplateKind {
  return (
    value === "slideshow" ||
    value === "ugc" ||
    value === "video" ||
    value === "x_threads"
  )
}

function automationOption(record: AutomationRecord) {
  const schema = record.schema
  const enabledHooks = schema.hooks.filter((hook) => hook.enabled)
  const sampleHook = enabledHooks.find((hook) => clean(hook.text))
  const direction = firstText([
    sampleHook?.contentDirection,
    sampleHook?.content,
    ...schema.slide_designs.flatMap((design) => [
      design.instructions,
      ...design.textItems.map((item) => item.contentDirection),
    ]),
    ...schema.formatting.flatMap((section) =>
      section.textItems.map((item) => item.contentDirection)
    ),
    schema.prompt_formatting.narrative,
  ])
  const tone = firstText([schema.tone.value, schema.tone.preset])

  if (schema.automationKind === "ugc") {
    const ugc = schema.ugc
    const duration = ugc?.targetDurationSeconds
      ? `${ugc.targetDurationSeconds}s`
      : "short-form"
    const label = `${record.name} - ${duration} ${schema.aspect_ratio} video`
    const result = [
      ugc?.actorSource ? `${titleCase(ugc.actorSource)} actor` : "UGC actor",
      ugc?.captions.enabled ? "captions" : "no captions",
      ugc?.brollCount ? `${ugc.brollCount} B-roll clips` : "no B-roll",
    ].join(", ")
    return {
      value: record.id,
      label,
      subtitle: optionSubtitle({
        hooks: enabledHooks.length,
        sampleHook: sampleHook?.text,
        direction: ugc?.productBrief || direction,
        tone,
        result,
      }),
    }
  }

  if (schema.automationKind === "video") {
    const format = schema.video_format
    const segments = format?.segments ?? []
    const result = [
      format?.template ? titleCase(format.template) : "Configured video format",
      `${segments.length} component${segments.length === 1 ? "" : "s"}`,
      `${schema.aspect_ratio} output`,
    ].join(", ")
    return {
      value: record.id,
      label: `${record.name} - ${result}`,
      subtitle: optionSubtitle({
        hooks: enabledHooks.length,
        sampleHook: sampleHook?.text,
        direction,
        tone,
        result,
      }),
    }
  }

  const bodySlides = Math.max(1, schema.prompt_formatting.num_of_slides)
  const bodyFormat = schema.formatting.find((section) => section.id === "body")
  const hasCta = schema.image_collection_ids.cta_slide.check
  const result = [
    `${bodySlides} body slide${bodySlides === 1 ? "" : "s"}${hasCta ? " + CTA" : ""}`,
    bodyFormat?.imageGrid && bodyFormat.imageGrid !== "none"
      ? `${bodyFormat.imageGrid} image grid`
      : `${schema.image_fit} images`,
    `${schema.language} output`,
  ].join(", ")

  return {
    value: record.id,
    label: `${record.name} - ${schema.aspect_ratio} slideshow`,
    subtitle: optionSubtitle({
      hooks: enabledHooks.length,
      sampleHook: sampleHook?.text,
      direction,
      tone,
      result,
    }),
  }
}

function xAutomationOption(record: XAutomationRecord) {
  const output = record.output
  const postShape =
    output.contentType === "thread"
      ? `${output.threadPostCount.min}-${output.threadPostCount.max} post thread`
      : output.contentType === "article"
        ? `${output.articleWordCount.min}-${output.articleWordCount.max} word article`
        : `${output.singleLength} post`
  const direction = firstText([
    record.brief?.promise,
    record.brief?.audience,
    record.niche.label,
  ])
  const hooks = record.generation.hookStyles.filter(Boolean)
  const result = [
    titleCase(output.archetype),
    record.media.mode === "generate"
      ? `${record.media.aspectRatio} image`
      : "text only",
    `${record.generation.language} output`,
  ].join(", ")

  return {
    value: record.id,
    label: `${record.name} - ${record.platform.toUpperCase()} ${postShape}`,
    subtitle: optionSubtitle({
      hooks: hooks.length,
      sampleHook: hooks[0],
      direction,
      tone: firstText([
        record.generation.voiceOverride,
        record.generation.voicePreset,
      ]),
      result,
    }),
  }
}

function optionSubtitle(input: {
  hooks: number
  sampleHook?: string
  direction?: string
  tone?: string
  result: string
}) {
  return [
    `Hooks: ${input.hooks}${input.sampleHook ? `, e.g. “${short(input.sampleHook, 54)}”` : ""}`,
    input.direction ? `Direction: ${short(input.direction, 72)}` : "",
    input.tone ? `Tone: ${short(input.tone, 36)}` : "",
    `Result: ${input.result}`,
  ]
    .filter(Boolean)
    .join("; ")
}

function firstText(values: Array<string | null | undefined>) {
  return values.map(clean).find(Boolean) || undefined
}

function short(value: string, max: number) {
  const normalized = clean(value).replace(/\s+/g, " ")
  return normalized.length > max
    ? `${normalized.slice(0, Math.max(1, max - 1)).trimEnd()}…`
    : normalized
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
