import {
  getTempSlidePromptPlaceholders,
  normalizeTempSlideStructuredOutput,
  placeholderWordRangeError,
  promptPreviewHook,
  toneRequestsLowercase,
  type TempSlideSpec,
  type TempSlideStructuredOutput,
  type TempSlideTestingAutomation,
} from "@/lib/temp-slide-testing-shared"
import { slideshowTextGenerationPayload } from "@/lib/slideshow-text-generation-payload"

export { slideshowTextGenerationPayload }
import {
  defaultSlideshowTextModel,
  openRouterModelForUseCase,
} from "@/lib/realfarm-generation-model-registry"
import { clean, isRecord } from "@/lib/guards"
import { fetchJson, providerErrorMessage } from "@/lib/http"
import { llmSlopMatches, normalizeLlmPunctuation } from "@/lib/llm-slop"
import { parseOpenRouterContent } from "@/lib/openrouter"
import {
  expandAllHookCombinations,
  type HookExpansionResult,
} from "@/lib/hook-expansion"
import type { HookCaseMode } from "@/lib/hook-casing"
import type { WordCollectionRecord } from "@/lib/word-collections"
import {
  deriveSlideVisualConcepts,
  selectSlideshowImageWithAi,
} from "@/lib/slideshow-image-matching"

export { defaultSlideshowTextModel }

type OpenRouterResponse = {
  choices?: {
    finish_reason?: string | null
    native_finish_reason?: string | null
    error?: {
      message?: string
    }
    message?: {
      content?: unknown
      annotations?: unknown[]
    }
  }[]
  error?: {
    message?: string
    metadata?: {
      provider_name?: string
      raw?: unknown
    }
  }
  usage?: {
    server_tool_use?: {
      web_search_requests?: number
    }
  }
}

export type SlideshowTextGenerationResult = {
  model: string
  selectedHook: string
  result: TempSlideStructuredOutput
  skippedOpenRouter: boolean
  promptPayload?: ReturnType<typeof slideshowTextGenerationPayload>
  webSearchSources?: SlideshowWebSearchSource[]
  /**
   * Quality findings that did not justify discarding the generation — today,
   * text outside its configured word range. Reported with the output so the
   * copy can be judged, rather than silently dropped or fatally enforced.
   */
  violations?: string[]
  transformations?: SlideshowTextTransformation[]
}

export type SlideshowTextTransformation = {
  pass: "word_cap_fallback" | "tone_lowercase" | "punctuation_fallback"
  field: string
  before: string
  after: string
}

export type SlideshowWebSearchSource = {
  url: string
  title?: string
  content?: string
}

export class SlideshowHookCombinationsExhaustedError extends Error {
  readonly reason = "hooks_exhausted" as const

  constructor() {
    super("No unused hook combinations remain for this automation.")
    this.name = "SlideshowHookCombinationsExhaustedError"
  }
}

export type SlideshowHookSelection = {
  expansion: HookExpansionResult
  index: number
  hookId: string
  bodySlideCount?: number
  tone?: string
}

/**
 * Pure hook expansion and reuse filtering shared by interactive and scheduled
 * runs. Loading word collections and usage history remains a caller adapter.
 */
export function selectSlideshowHook(input: {
  hookItems: Array<{
    id: string
    text: string
    bodySlideCount?: number
    tone?: string
  }>
  hookSlots?: Record<string, string>
  wordCollections: WordCollectionRecord[]
  usedHookKeys?: ReadonlySet<string>
  usedHookCombinationKeys?: ReadonlySet<string>
  noDuplicateSlots?: boolean
  caseMode?: HookCaseMode
  now: Date
  timeZone?: string
  slideCount?: number
  random?: () => number
  selectIndex?: (candidateCount: number) => number
}): SlideshowHookSelection {
  if (input.hookItems.length === 0) {
    throw new Error("The automation database record has no usable hooks")
  }

  const expanded: SlideshowHookSelection[] = []
  const invalidHookErrors: Error[] = []
  for (const [index, hookItem] of input.hookItems.entries()) {
    try {
      expanded.push(
        ...expandAllHookCombinations(
          hookItem.text,
          input.hookSlots,
          input.wordCollections,
          {
            noDuplicates: input.noDuplicateSlots,
            caseMode: input.caseMode,
            now: input.now,
            timeZone: input.timeZone,
            slideCount: hookItem.bodySlideCount ?? input.slideCount,
          }
        ).map((expansion) => ({
          expansion,
          index,
          hookId: hookItem.id,
          bodySlideCount: hookItem.bodySlideCount,
          tone: hookItem.tone,
        }))
      )
    } catch (error) {
      invalidHookErrors.push(
        error instanceof Error
          ? error
          : new Error("A hook variable cannot be expanded.")
      )
    }
  }
  if (expanded.length === 0 && invalidHookErrors.length > 0) {
    throw invalidHookErrors[0]
  }

  const usedHooks = input.usedHookKeys ?? new Set<string>()
  const usedCombinations = input.usedHookCombinationKeys ?? new Set<string>()
  const available = expanded.filter(({ expansion }) => {
    const hookKey = slideshowHookUsageKey(expansion.text)
    const combinationKey = slideshowHookCombinationUsageKey(
      expansion.template,
      expansion.substitutions
    )
    return (
      !usedHooks.has(hookKey) &&
      (!Object.keys(expansion.substitutions).length ||
        !usedCombinations.has(combinationKey))
    )
  })
  if (available.length === 0) {
    throw new SlideshowHookCombinationsExhaustedError()
  }

  const selectedIndex = input.selectIndex
    ? input.selectIndex(available.length)
    : Math.floor(
        Math.min(
          1 - Number.EPSILON,
          Math.max(0, (input.random ?? Math.random)())
        ) * available.length
      )
  return available[Math.min(available.length - 1, Math.max(0, selectedIndex))]
}

export function slideshowHookUsageKey(hook: string) {
  return clean(hook).toLowerCase().replace(/\s+/g, " ")
}

export function slideshowHookCombinationUsageKey(
  template: string,
  substitutions: Record<string, string>
) {
  const parts = Object.entries(substitutions)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("|")
  return `${template}::${parts}`
}

export type SlideshowGenerationImage = {
  id: string
  key: string
  imageUrl: string
  imageCaption: string
}

export type SelectedSlideshowGenerationImage<T> = T & {
  reusedRecently?: boolean
  lastUsedAt?: string
}

export function imagesForSlideshowSection<T extends { imageCaption: string }>(
  images: T[],
  section: TempSlideSpec["section"]
) {
  const taggedForSection = images.filter(
    (image) => slideshowImageCaptionSection(image.imageCaption) === section
  )
  if (taggedForSection.length > 0 && section !== "content") {
    return taggedForSection
  }
  if (section === "content") {
    const contentImages = images.filter((image) => {
      const taggedSection = slideshowImageCaptionSection(image.imageCaption)
      return !taggedSection || taggedSection === "content"
    })
    if (contentImages.length > 0) return contentImages
  }
  return images
}

/**
 * Shared visual-concept derivation and image choice. Callers inject already
 * loaded candidates for each slide, keeping storage and Appwrite out of this
 * module while preserving one selection algorithm.
 */
export async function selectSlideshowImages<
  T extends SlideshowGenerationImage,
>(input: {
  hook: string
  fallbackTitle: string
  specs: TempSlideSpec[]
  generatedText: TempSlideStructuredOutput
  firstSlidePinnedImageId?: string | null
  ctaPinnedImageId?: string | null
  candidatesForSpec: (spec: TempSlideSpec, index: number) => T[]
  recentImageUsage?: ReadonlyMap<string, string>
  random?: () => number
  apiKey?: string
  model?: string
  fetchImpl?: typeof fetch
}): Promise<Array<SelectedSlideshowGenerationImage<T>>> {
  const apiKey = clean(input.apiKey)
  const firstAiSelectedSpec = input.specs.find((spec) => spec.aiImageSelection)
  if (firstAiSelectedSpec && !apiKey) {
    throw new Error(
      `OPENROUTER_API_KEY is required for AI image selection on ${firstAiSelectedSpec.title}`
    )
  }
  const slideTexts = input.specs.map((spec) =>
    slideshowImageSelectionText({
      hook: input.hook,
      fallbackTitle: input.fallbackTitle,
      spec,
      generatedText: input.generatedText,
    })
  )
  const visualConcepts =
    apiKey && input.specs.some((spec) => spec.aiImageSelection)
      ? await deriveSlideVisualConcepts({
          slideTexts,
          apiKey,
          model: input.model,
          fetchImpl: input.fetchImpl,
        })
      : []
  const usedKeys = new Set<string>()
  const usedUrls = new Set<string>()
  const usedSlideImagePairs = new Set<string>()
  const selected: Array<SelectedSlideshowGenerationImage<T>> = []

  for (const [index, spec] of input.specs.entries()) {
    const configuredCandidates = input.candidatesForSpec(spec, index)
    if (configuredCandidates.length === 0) {
      throw new Error(
        `No images exist in the configured collection for ${spec.title}`
      )
    }
    const pinnedImageId = clean(
      spec.section === "hook"
        ? input.firstSlidePinnedImageId
        : spec.section === "cta"
          ? input.ctaPinnedImageId
          : ""
    )
    const pinnedImage = pinnedImageId
      ? configuredCandidates.find(
          (image) =>
            image.id === pinnedImageId || image.imageUrl === pinnedImageId
        )
      : undefined
    const candidatesForSlide = pinnedImage
      ? [pinnedImage]
      : pinnedImageId
        ? configuredCandidates
        : imagesForSlideshowSection(configuredCandidates, spec.section)
    const slideText = slideTexts[index] ?? input.fallbackTitle
    const unusedCandidates = candidatesForSlide.filter(
      (image) => !usedKeys.has(image.key) && !usedUrls.has(image.imageUrl)
    )
    const reusableCandidates = candidatesForSlide.filter(
      (image) =>
        !usedSlideImagePairs.has(
          slideshowImagePairKey(input.hook, slideText, image)
        )
    )
    const candidates = unusedCandidates.length
      ? unusedCandidates
      : reusableCandidates
    const preselected = chooseSlideshowImages(candidates, 1, input.random, {
      recentUsage: input.recentImageUsage,
    })[0]
    if (!preselected) continue

    let image = preselected
    if (spec.aiImageSelection && candidates.length > 1) {
      const selectedId = await selectSlideshowImageWithAi({
        slideText,
        concepts: visualConcepts[index] ?? [],
        candidates: candidates.map((candidate) => ({
          id: candidate.id,
          imageUrl: candidate.imageUrl,
          caption: candidate.imageCaption,
        })),
        apiKey,
        model: input.model,
        fetchImpl: input.fetchImpl,
      })
      const matched = candidates.find(
        (candidate) => candidate.id === selectedId
      )
      if (!matched) {
        throw new Error("AI image selection returned an unknown image id")
      }
      image = {
        ...matched,
        reusedRecently: input.recentImageUsage?.has(matched.key),
        lastUsedAt: input.recentImageUsage?.get(matched.key),
      }
    }

    usedKeys.add(image.key)
    usedUrls.add(image.imageUrl)
    usedSlideImagePairs.add(slideshowImagePairKey(input.hook, slideText, image))
    selected.push(image)
  }

  return selected
}

export function chooseSlideshowImages<
  T extends { key?: string; imageUrl?: string },
>(
  items: T[],
  count: number,
  random = Math.random,
  options: { recentUsage?: ReadonlyMap<string, string> } = {}
) {
  if (items.length === 0 || count <= 0) return []

  const recentUsage = options.recentUsage ?? new Map<string, string>()
  const keys = new Set<string>()
  const urls = new Set<string>()
  const uniqueItems = items.filter((item) => {
    if (
      (item.key && keys.has(item.key)) ||
      (item.imageUrl && urls.has(item.imageUrl))
    ) {
      return false
    }
    if (item.key) keys.add(item.key)
    if (item.imageUrl) urls.add(item.imageUrl)
    return true
  })
  const fresh = recentUsage.size
    ? uniqueItems.filter((item) => !item.key || !recentUsage.has(item.key))
    : uniqueItems
  const fallback = uniqueItems
    .filter((item) => item.key && recentUsage.has(item.key))
    .sort(
      (left, right) =>
        Date.parse(recentUsage.get(left.key!) ?? "") -
        Date.parse(recentUsage.get(right.key!) ?? "")
    )
  const freshPool = [...fresh]
  const fallbackPool = [...fallback]
  const selected: Array<SelectedSlideshowGenerationImage<T>> = []
  while (selected.length < count) {
    if (freshPool.length > 0) {
      const index = Math.min(
        freshPool.length - 1,
        Math.floor(random() * freshPool.length)
      )
      selected.push(freshPool.splice(index, 1)[0])
      continue
    }
    const item = fallbackPool.shift()
    if (!item) break
    selected.push({
      ...item,
      reusedRecently: true,
      lastUsedAt: item.key ? recentUsage.get(item.key) : undefined,
    })
  }
  return selected
}

function slideshowImageSelectionText(input: {
  hook: string
  fallbackTitle: string
  spec: TempSlideSpec
  generatedText: TempSlideStructuredOutput
}) {
  if (input.spec.section === "hook") return input.hook
  const text = input.spec.textItems
    .map((item) =>
      item.textMode === "static"
        ? clean(item.staticText)
        : clean(input.generatedText.text[item.id])
    )
    .filter(Boolean)
    .join("\n")
  return text || input.fallbackTitle
}

function slideshowImagePairKey(
  hook: string,
  slideText: string,
  image: SlideshowGenerationImage
) {
  return [hook, slideText, image.key || image.imageUrl]
    .map((value) => clean(value).toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n")
}

function slideshowImageCaptionSection(caption: string) {
  const value = clean(caption).toLowerCase()
  if (value.startsWith("hook asset:")) return "hook" as const
  if (value.startsWith("content asset:")) return "content" as const
  if (value.startsWith("cta asset:")) return "cta" as const
  return undefined
}

export async function generateSlideshowText(input: {
  automation: TempSlideTestingAutomation
  model?: string
  systemPrompt?: string
  promptInstructions?: string
  selectedHook?: string
  avoidSimilarOutputs?: string[]
  avoidSimilarHeadings?: string[]
  performanceMemory?: {
    provenPatterns: string[]
    avoidPatterns: string[]
  }
  webSearchEnabled?: boolean
  requireHookSubjectCoverage?: boolean
  apiKey?: string
  fetchImpl?: typeof fetch
}): Promise<SlideshowTextGenerationResult> {
  const model = clean(input.model) || defaultSlideshowTextModel
  const selectedHook =
    clean(input.selectedHook) || promptPreviewHook(input.automation)
  const placeholders = getTempSlidePromptPlaceholders(input.automation)

  const apiKey = clean(input.apiKey)
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured")
  }

  const research = input.webSearchEnabled
    ? await researchSelectedHook({
        apiKey,
        fetchImpl: input.fetchImpl,
        model: openRouterModelForUseCase("webResearch"),
        hook: selectedHook,
        automationName: input.automation.name,
      })
    : null
  const promptPayload = slideshowTextGenerationPayload({
    automation: input.automation,
    model,
    selectedHook,
    systemPrompt: input.systemPrompt,
    promptInstructions: [
      input.promptInstructions,
      research
        ? `Exact-hook web research:\n${research.content}\n\nUse these sources only for claims that directly answer the selected hook. Do not replace the hook with generic facts from the broader niche.`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    avoidSimilarOutputs: input.avoidSimilarOutputs,
    avoidSimilarHeadings: input.avoidSimilarHeadings,
    performanceMemory: input.performanceMemory,
  })
  const completion = await requestStructuredOutput({
    apiKey,
    fetchImpl: input.fetchImpl,
    model,
    promptPayload,
    placeholders,
    selectedHook,
    requireHookSubjectCoverage:
      input.requireHookSubjectCoverage ??
      selectedHook !== "Create a high-performing TikTok slideshow.",
  })
  const lowercase = toneRequestsLowercase(input.automation.tone)
  const normalizedResult = normalizeTempSlideStructuredOutput(
    completion.output,
    placeholders,
    { lowercase }
  )
  return {
    model: completion.model,
    selectedHook,
    result: normalizedResult,
    skippedOpenRouter: false,
    promptPayload,
    webSearchSources: research?.sources ?? [],
    violations: completion.violations ?? [],
    transformations: [
      ...(completion.transformations ?? []),
      ...(lowercase
        ? lowercaseTextTransformations(completion.output, normalizedResult)
        : []),
    ],
  }
}

function lowercaseTextTransformations(
  output: unknown,
  normalized: TempSlideStructuredOutput
): SlideshowTextTransformation[] {
  if (!isRecord(output)) return []
  const rawText = isRecord(output.text) ? output.text : {}
  const values = [
    ["title", clean(output.title), normalized.title],
    ["caption", clean(output.caption), normalized.caption],
    ...Object.entries(normalized.text).map(([field, after]) => [
      field,
      clean(rawText[field]),
      after,
    ]),
  ] as Array<[string, string, string]>
  return values.flatMap(([field, before, after]) =>
    before && before !== after
      ? [{ pass: "tone_lowercase" as const, field, before, after }]
      : []
  )
}

async function requestStructuredOutput(input: {
  apiKey: string
  fetchImpl?: typeof fetch
  model: string
  promptPayload: ReturnType<typeof slideshowTextGenerationPayload>
  placeholders: ReturnType<typeof getTempSlidePromptPlaceholders>
  selectedHook: string
  requireHookSubjectCoverage?: boolean
}) {
  let lastError: unknown
  let repairError: unknown

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const attemptModel = input.model
    const attemptPayload = repairError
      ? promptPayloadWithRepairFeedback(input.promptPayload, repairError)
      : input.promptPayload
    const routedPayload = { ...attemptPayload, model: attemptModel }
    let payload: OpenRouterResponse
    try {
      payload = await fetchJson<OpenRouterResponse>(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(routedPayload),
        },
        {
          fetchImpl: input.fetchImpl,
          // Reasoning-heavy models routinely take 30-90s to emit the full
          // structured slideshow JSON; generation runs in the background, so a
          // generous timeout beats failing the run.
          timeoutMs: 120_000,
          errorMessage: (response, payload) => {
            const providerError =
              typeof payload === "object" &&
              payload !== null &&
              "error" in payload &&
              typeof payload.error === "object" &&
              payload.error !== null
                ? payload.error
                : null
            const providerMessage =
              providerError &&
              "message" in providerError &&
              typeof providerError.message === "string"
                ? providerError.message
                : "Provider returned no error details"
            const providerMetadata = openRouterProviderMetadata(providerError)
            return `OpenRouter generation failed (${response.status}): ${providerMessage}${
              providerMetadata ? ` [${providerMetadata}]` : ""
            }`
          },
        }
      )
    } catch (error) {
      lastError = error
      if (attempt < 2) {
        console.warn("OpenRouter slideshow request failed; retrying", {
          attempt,
          model: attemptModel,
          error: error instanceof Error ? error.message : String(error),
        })
      }
      continue
    }

    const choice = payload.choices?.[0]
    try {
      assertCompleteStructuredChoice(choice)
      let output = JSON.parse(parseOpenRouterContent(choice?.message?.content))
      const punctuation = normalizeStructuredOutputPunctuation(output)
      output = punctuation.output
      let { errors: validationErrors, violations } = structuredOutputFindings(
        output,
        input.placeholders,
        input.selectedHook
      )
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join("; "))
      }
      if (violations.length > 0 && attempt < 2) {
        throw new Error(violations.join("; "))
      }
      const truncated = truncateStructuredOutputOverruns(
        output,
        input.placeholders
      )
      output = truncated.output
      if (truncated.transformations.length > 0) {
        ;({ errors: validationErrors, violations } = structuredOutputFindings(
          output,
          input.placeholders,
          input.selectedHook
        ))
        if (validationErrors.length > 0) {
          throw new Error(validationErrors.join("; "))
        }
      }
      const webSearchSources = parseWebSearchSources(
        choice?.message?.annotations
      )
      if (
        input.requireHookSubjectCoverage &&
        !outputDevelopsHookSubject(output, input.selectedHook)
      ) {
        const coverageViolation = `Generated body text does not develop the selected hook subject: ${input.selectedHook}`
        // Retry once for copy that echoes the subject, but never throw the
        // generation away for this. The check is lexical: it demands a hook
        // word appear in the body, while good slideshow copy develops a hook
        // instead of repeating its nouns. "clear counters after every use"
        // plainly develops "keep a small kitchen tidy" and still fails it.
        // Word-count violations above already degrade to a warning on the
        // final attempt; this now behaves the same way.
        if (attempt < 2) throw new Error(coverageViolation)
        violations = [...violations, coverageViolation]
      }
      return {
        output,
        webSearchSources,
        model: attemptModel,
        violations,
        transformations: [
          ...punctuation.transformations,
          ...truncated.transformations,
        ],
      }
    } catch (error) {
      lastError = error
      repairError = error
      if (attempt < 2) {
        console.warn(
          "OpenRouter returned invalid structured slideshow text; retrying",
          {
            attempt,
            model: attemptModel,
            finishReason: choice?.finish_reason ?? null,
            nativeFinishReason: choice?.native_finish_reason ?? null,
            error: error instanceof Error ? error.message : String(error),
          }
        )
      }
    }
  }

  throw new Error(
    `OpenRouter did not return complete structured slideshow text after 2 attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}

function normalizeStructuredOutputPunctuation(output: unknown) {
  if (!isRecord(output)) {
    return { output, transformations: [] as SlideshowTextTransformation[] }
  }
  const record = { ...output }
  const sourceText = isRecord(record.text) ? record.text : {}
  const text = { ...sourceText }
  const transformations: SlideshowTextTransformation[] = []

  const normalizeField = (
    container: Record<string, unknown>,
    field: string,
    transformationField = field
  ) => {
    const before =
      typeof container[field] === "string" ? clean(container[field]) : ""
    if (!before || !/[\u2013\u2014]/u.test(before)) return
    const after = normalizeLlmPunctuation(before)
    container[field] = after
    transformations.push({
      pass: "punctuation_fallback",
      field: transformationField,
      before,
      after,
    })
  }

  normalizeField(record, "title")
  normalizeField(record, "caption")
  for (const field of Object.keys(text)) {
    normalizeField(text, field, field)
  }
  record.text = text
  return { output: record, transformations }
}

function truncateStructuredOutputOverruns(
  output: unknown,
  placeholders: ReturnType<typeof getTempSlidePromptPlaceholders>
) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { output, transformations: [] as SlideshowTextTransformation[] }
  }
  const record = output as Record<string, unknown>
  const sourceText = isRecord(record.text)
    ? (record.text as Record<string, unknown>)
    : {}
  const text = { ...sourceText }
  const transformations: SlideshowTextTransformation[] = []
  for (const placeholder of placeholders) {
    const maximum = placeholder.wordLengthMax
    const before =
      typeof text[placeholder.id] === "string"
        ? clean(text[placeholder.id] as string)
        : ""
    if (!maximum || !before) continue
    const words = before.split(/\s+/).filter(Boolean)
    if (words.length <= maximum) continue
    const after = words.slice(0, maximum).join(" ")
    text[placeholder.id] = after
    transformations.push({
      pass: "word_cap_fallback",
      field: placeholder.id,
      before,
      after,
    })
  }
  return {
    output: { ...record, text },
    transformations,
  }
}

function promptPayloadWithRepairFeedback(
  payload: ReturnType<typeof slideshowTextGenerationPayload>,
  error: unknown
): ReturnType<typeof slideshowTextGenerationPayload> {
  const feedback = error instanceof Error ? error.message : String(error)
  return {
    ...payload,
    messages: [
      ...payload.messages,
      {
        role: "user",
        content: `The previous JSON was invalid. Correct only the reported problems and return the complete JSON object again.\nValidation errors:\n- ${feedback.replaceAll(
          "; ",
          "\n- "
        )}`,
      },
    ],
  }
}

function openRouterProviderMetadata(error: unknown) {
  if (!error || typeof error !== "object" || !("metadata" in error)) return ""
  const metadata = error.metadata
  if (!metadata || typeof metadata !== "object") return ""
  const provider =
    "provider_name" in metadata && typeof metadata.provider_name === "string"
      ? clean(metadata.provider_name)
      : ""
  const raw =
    "raw" in metadata
      ? clean(
          typeof metadata.raw === "string"
            ? metadata.raw
            : JSON.stringify(metadata.raw)
        ).slice(0, 500)
      : ""
  return [provider, raw].filter(Boolean).join(": ")
}

function structuredOutputFindings(
  output: unknown,
  placeholders: ReturnType<typeof getTempSlidePromptPlaceholders>,
  selectedHook?: string
) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return { errors: ["output must be a JSON object"], violations: [] }
  }
  const record = output as Record<string, unknown>
  const errors: string[] = []
  const violations: string[] = []
  const title = typeof record.title === "string" ? record.title.trim() : ""
  const caption =
    typeof record.caption === "string" ? record.caption.trim() : ""
  if (!title) errors.push("title must not be empty")
  if (!caption) errors.push("caption must not be empty")

  const text =
    record.text &&
    typeof record.text === "object" &&
    !Array.isArray(record.text)
      ? (record.text as Record<string, unknown>)
      : {}
  const generatedValues: string[] = [title, caption]
  for (const placeholder of placeholders) {
    const rawValue = text[placeholder.id]
    const value = typeof rawValue === "string" ? rawValue.trim() : ""
    if (!value) {
      errors.push(`${placeholder.id} must not be empty`)
      continue
    }
    generatedValues.push(value)
    const wordRangeError = placeholderWordRangeError(placeholder, value)
    if (wordRangeError) violations.push(wordRangeError)
  }
  // Slop terms echoed from the user-authored hook are exempt — the model must
  // develop the hook subject and cannot avoid its wording.
  const hookLower = (selectedHook ?? "").toLowerCase()
  for (const match of llmSlopMatches(generatedValues.join("\n"))) {
    if (hookLower && hookLower.includes(match.toLowerCase())) continue
    errors.push(
      `banned AI-tell wording: "${match}"; rewrite that line in plain human language`
    )
  }
  return { errors, violations }
}

async function researchSelectedHook(input: {
  apiKey: string
  fetchImpl?: typeof fetch
  model: string
  hook: string
  automationName: string
}) {
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const payload = await fetchJson<OpenRouterResponse>(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: input.model,
            stream: false,
            max_tokens: 2_000,
            plugins: [{ id: "web", engine: "exa", max_results: 5 }],
            messages: [
              {
                role: "system",
                content:
                  "Research the exact slideshow hook using current authoritative sources. Return concise facts that directly answer the hook. Cite every fact with a full source URL. Do not substitute generic facts about the broader niche.",
              },
              {
                role: "user",
                content: `Automation: ${input.automationName}\nExact hook: ${input.hook}`,
              },
            ],
          }),
        },
        {
          fetchImpl: input.fetchImpl,
          timeoutMs: 90_000,
          errorMessage: providerErrorMessage("OpenRouter hook research failed"),
        }
      )
      const choice = payload.choices?.[0]
      assertCompleteStructuredChoice(choice)
      const content =
        typeof choice?.message?.content === "string"
          ? choice.message.content.trim()
          : ""
      const sources = [
        ...parseLinkedSources(content),
        ...parseWebSearchSources(choice?.message?.annotations),
      ]
      const uniqueSources = [
        ...new Map(sources.map((source) => [source.url, source])).values(),
      ]
      if (!content || uniqueSources.length === 0) {
        throw new Error(
          "Web research returned without content and cited sources."
        )
      }
      return { content, sources: uniqueSources }
    } catch (error) {
      lastError = error
      if (attempt < 2) {
        console.warn("Exact-hook web research failed; retrying", {
          attempt,
          model: input.model,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  throw new Error(
    `Could not research the selected hook after 2 attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}

const broadHookWords = new Set([
  "about",
  "actually",
  "after",
  "before",
  "best",
  "buying",
  "does",
  "everyone",
  "first",
  "future",
  "happen",
  "happens",
  "housing",
  "most",
  "owner",
  "owners",
  "really",
  "should",
  "shocked",
  "their",
  "these",
  "thing",
  "things",
  "this",
  "truth",
  "what",
  "when",
  "which",
  "will",
  "with",
  "your",
])

export function outputDevelopsHookSubject(output: unknown, hook: string) {
  if (!output || typeof output !== "object" || !("text" in output)) {
    return false
  }
  const text = (output as { text?: unknown }).text
  if (!text || typeof text !== "object" || Array.isArray(text)) {
    return false
  }
  const body = Object.values(text)
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase()
  const subjects = hook
    .toLowerCase()
    .match(/[a-z0-9]+(?:-[a-z0-9]+)*/g)
    ?.filter(
      (word) => word.length >= 3 && word !== "hdb" && !broadHookWords.has(word)
    )

  if (!subjects?.length) {
    return true
  }
  // Whole-word matching alone rejects copy that develops the hook in a
  // different inflection ("kitchens" for "kitchen", "tidying" for "tidy"),
  // which fails an otherwise good generation. Accept a shared stem for
  // subjects long enough that a prefix match still means the same thing.
  const bodyWords = body.match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []
  return subjects.some((subject) => {
    if (new RegExp(`\\b${escapeRegExp(subject)}\\b`, "i").test(body))
      return true
    if (subject.length < 5) return false
    const stem = subject.slice(0, Math.max(4, subject.length - 2))
    return bodyWords.some(
      (word) =>
        word.startsWith(stem) || subject.startsWith(word.slice(0, stem.length))
    )
  })
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function parseWebSearchSources(value: unknown): SlideshowWebSearchSource[] {
  if (!Array.isArray(value)) return []
  const sources = value.flatMap((annotation) => {
    if (!annotation || typeof annotation !== "object") return []
    const nested =
      "url_citation" in annotation &&
      annotation.url_citation &&
      typeof annotation.url_citation === "object"
        ? annotation.url_citation
        : annotation
    const url =
      "url" in nested && typeof nested.url === "string" ? nested.url.trim() : ""
    if (!url) return []
    return [
      {
        url,
        title:
          "title" in nested && typeof nested.title === "string"
            ? clean(nested.title) || undefined
            : undefined,
        content:
          "content" in nested && typeof nested.content === "string"
            ? clean(nested.content) || undefined
            : undefined,
      },
    ]
  })
  return [...new Map(sources.map((source) => [source.url, source])).values()]
}

function parseLinkedSources(content: string): SlideshowWebSearchSource[] {
  const markdownLinks = [
    ...content.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g),
  ].map((match) => ({ url: match[2], title: clean(match[1]) || undefined }))
  const linkedUrls = new Set(markdownLinks.map((source) => source.url))
  const plainUrls = [...content.matchAll(/https?:\/\/[^\s)\]]+/g)]
    .map((match) => match[0].replace(/[.,;:]+$/, ""))
    .filter((url) => !linkedUrls.has(url))
    .map((url) => ({ url }))
  return [...markdownLinks, ...plainUrls]
}

function assertCompleteStructuredChoice(
  choice: OpenRouterResponse["choices"] extends (infer T)[] | undefined
    ? T | undefined
    : never
) {
  if (!choice) {
    throw new Error("OpenRouter returned no completion choice")
  }
  if (choice.error?.message) {
    throw new Error(`OpenRouter provider error: ${choice.error.message}`)
  }
  if (choice.finish_reason && choice.finish_reason !== "stop") {
    throw new Error(
      `OpenRouter completion ended with finish_reason=${choice.finish_reason}`
    )
  }
}
