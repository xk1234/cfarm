export type ShapeClassification = "canonical" | "legacy" | "mixed" | "invalid"

export type ClassificationResult = {
  classification: ShapeClassification
  markers: string[]
  notes?: string
}

type RecordValue = Record<string, unknown>

const templateSnakeFields = [
  "aspect_ratio",
  "image_grid",
  "display_text",
  "ai_image_selection",
  "slide_count",
  "slide_count_mode",
  "slide_count_min",
  "slide_count_max",
  "overlay_image",
  "image_mode",
  "text_items",
  "font_size",
  "text_style",
  "text_position",
  "text_item_width",
  "word_length_min",
  "word_length_max",
  "content_direction",
  "text_mode",
  "static_text",
  "text_align",
  "text_anchor",
  "text_vertical_anchor",
  "collection_id",
]

export function classifyAutomationTemplate(raw: unknown): ClassificationResult {
  const invalid = requireRecord(raw)
  if (invalid) return invalid
  const value = raw as RecordValue
  const markers: string[] = []
  const template = record(value.template)
  const schema = record(value.schema)

  if (template) markers.push("template_object")
  if (template && typeof template.image_collection_ids === "string") {
    markers.push("template.image_collection_ids:string")
    try {
      const parsed = JSON.parse(template.image_collection_ids)
      if (!record(parsed))
        return result(
          "invalid",
          markers,
          "template.image_collection_ids is not a JSON object"
        )
    } catch {
      return result(
        "invalid",
        markers,
        "template.image_collection_ids is not valid JSON"
      )
    }
  }
  if (template && hasDeepKey(template.format, new Set(templateSnakeFields))) {
    markers.push("template.format:snake_case")
  }
  if (template && typeof template.created_at === "string") {
    markers.push("template.created_at:string")
    if (!validDate(template.created_at))
      return result(
        "invalid",
        markers,
        "template.created_at is an invalid date"
      )
  }
  if (schema && "created_at" in schema) {
    if (
      typeof schema.created_at !== "string" ||
      !validDate(schema.created_at)
    ) {
      return result(
        "invalid",
        markers,
        "schema.created_at must be an ISO date string"
      )
    }
  }
  if (typeof value.createdAt === "string" && !validDate(value.createdAt)) {
    return result("invalid", markers, "createdAt is an invalid date")
  }
  if (template && schema)
    return result("mixed", markers, "Both template and schema are present")
  return result(
    markers.length ? "legacy" : schema ? "canonical" : "invalid",
    markers,
    !template && !schema ? "Neither template nor schema is present" : undefined
  )
}

export function classifyAutomation(raw: unknown): ClassificationResult {
  const invalid = requireRecord(raw)
  if (invalid) return invalid
  const value = raw as RecordValue
  const schema = record(value.schema)
  if (!schema)
    return result("invalid", [], "schema is missing or not an object")
  const markers: string[] = []
  for (const key of ["title", "status"] as const)
    if (key in schema) markers.push(`schema.${key}`)
  for (const key of ["account", "handle", "times"] as const)
    if (key in value) markers.push(`top_level.${key}`)
  for (const key of [
    "knowledge_context_enabled",
    "knowledge_base_ids",
  ] as const) {
    if (key in schema) markers.push(`schema.${key}`)
  }
  const schedule = record(schema.schedule)
  if (schedule && "interval" in schedule)
    markers.push("schema.schedule.interval")
  if (
    Array.isArray(schema.formatting) &&
    schema.formatting.some((item) => record(item)?.id === "_tone")
  ) {
    markers.push("schema.formatting._tone")
  }
  const promptFormatting = record(schema.prompt_formatting)
  if (
    !("hooks" in schema) &&
    typeof promptFormatting?.narrative === "string" &&
    promptFormatting.narrative.trim()
  ) {
    markers.push("schema.hooks:missing_with_prompt_narrative")
  }
  if (!("hooks" in schema) && formattingCarriesHookText(schema.formatting)) {
    markers.push("schema.hooks:missing_with_formatting_hook")
  }
  if (formattingHasLegacyOverrideAlias(schema.formatting))
    markers.push("schema.formatting.legacy_override_alias")

  for (const key of ["updatedAt", "importedAt"] as const) {
    if (
      key in value &&
      (typeof value[key] !== "string" || !validDate(value[key]))
    ) {
      return result("invalid", markers, `${key} is an invalid date`)
    }
  }
  if (
    "created_at" in schema &&
    (typeof schema.created_at !== "string" || !validDate(schema.created_at))
  ) {
    return result("invalid", markers, "schema.created_at is an invalid date")
  }
  const canonical =
    ["name", "status", "favorite", "theme"].some((key) => key in value) ||
    ["posting_times", "social_integrations", "hooks", "tone"].some(
      (key) => key in schema || key in (schedule ?? {})
    )
  return result(
    markers.length ? (canonical ? "mixed" : "legacy") : "canonical",
    markers
  )
}

export function classifyXAutomation(raw: unknown): ClassificationResult {
  return markerClassifier(raw, (value, markers) => {
    const niche = record(value.niche)
    const generation = record(value.generation)
    const output = record(value.output)
    for (const key of [
      "audience",
      "promise",
      "pillars",
      "keywords",
      "painPoints",
      "excludedTopics",
    ]) {
      if (niche && key in niche) markers.push(`niche.${key}`)
    }
    for (const key of [
      "hookPrompt",
      "setupPrompt",
      "contentPrompt",
      "proofPrompt",
      "curiosityGapPrompt",
      "ctaPrompt",
      "voice",
    ]) {
      if (generation && key in generation) markers.push(`generation.${key}`)
    }
    if (output && "platforms" in output) markers.push("output.platforms")
    return (
      "brief" in value ||
      "excludedTopics" in value ||
      Boolean(generation && "voiceOverride" in generation) ||
      Boolean(output && "platformFlags" in output)
    )
  })
}

export function classifyXAutomationRun(raw: unknown): ClassificationResult {
  return markerClassifier(raw, (value, markers) => {
    if ("platforms" in value) markers.push("platforms[]")
    return "platform" in value
  })
}

export function classifySlideshowResult(raw: unknown): ClassificationResult {
  return markerClassifier(raw, (value, markers) => {
    const artifacts = record(value.artifacts)
    const hasSlideshowId = Boolean(
      artifacts &&
      typeof artifacts.slideshowId === "string" &&
      artifacts.slideshowId
    )
    if (!hasSlideshowId) markers.push("artifacts.slideshowId:missing")
    if (
      typeof value.id === "string" &&
      value.id.startsWith("compat-automation-")
    )
      markers.push("id:compat-automation")
    if (typeof value.id === "string" && value.id.startsWith("compat-run-"))
      markers.push("id:compat-run")
    return hasSlideshowId
  })
}

export function classifyImageCollection(raw: unknown): ClassificationResult {
  return markerClassifier(raw, (value, markers) => {
    const id = typeof value.id === "string" ? value.id : ""
    const name = typeof value.name === "string" ? value.name : ""
    if (!id) markers.push("id:missing")
    if (/^collection-/.test(id)) markers.push("id:collection-name-date")
    if (/^(community|user)_collection_/.test(id)) markers.push("id:path_alias")
    if (id && name && id !== slugify(name)) markers.push("id:not_name_slug")
    return Boolean(id && name && id === slugify(name))
  })
}

function markerClassifier(
  raw: unknown,
  detect: (value: RecordValue, markers: string[]) => boolean
): ClassificationResult {
  const invalid = requireRecord(raw)
  if (invalid) return invalid
  const markers: string[] = []
  const canonical = detect(raw as RecordValue, markers)
  return result(
    markers.length ? (canonical ? "mixed" : "legacy") : "canonical",
    markers
  )
}

function requireRecord(value: unknown): ClassificationResult | null {
  return record(value)
    ? null
    : result("invalid", [], "Payload must be a JSON object")
}

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : null
}

function validDate(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Date.parse(value))
}

function hasDeepKey(value: unknown, keys: Set<string>): boolean {
  if (Array.isArray(value)) return value.some((item) => hasDeepKey(item, keys))
  const object = record(value)
  return Boolean(
    object &&
    Object.entries(object).some(
      ([key, child]) => keys.has(key) || hasDeepKey(child, keys)
    )
  )
}

function formattingCarriesHookText(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  const hook = value.map(record).find((item) => item?.id === "hook")
  return Boolean(
    hook &&
    Array.isArray(hook.textItems) &&
    hook.textItems.some((item) => {
      const textItem = record(item)
      return Boolean(
        textItem &&
        typeof textItem.contentDirection === "string" &&
        textItem.contentDirection.trim()
      )
    })
  )
}

function formattingHasLegacyOverrideAlias(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  const aliases = new Set([
    "content_direction",
    "prompt",
    "text",
    "collection_id",
    "collection",
  ])
  return value.some((item) => {
    const section = record(item)
    return Boolean(
      section &&
      (hasDeepKey(section.slideOverrides, aliases) ||
        hasDeepKey(section.imageOverrides, aliases))
    )
  })
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function result(
  classification: ShapeClassification,
  markers: string[],
  notes?: string
): ClassificationResult {
  return {
    classification,
    markers: [...new Set(markers)].sort(),
    ...(notes ? { notes } : {}),
  }
}
