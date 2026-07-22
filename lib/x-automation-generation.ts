import { clean, isRecord } from "@/lib/guards"
import type { BrandProfile } from "@/lib/brand-profile"
import { runGenerationChain } from "@/lib/generation-chain"
import { llmSlopPromptLine, llmSlopViolations } from "@/lib/llm-slop"
import {
  getOpenRouterApiKey,
  OpenRouterRequestError,
  openRouterJson,
} from "@/lib/openrouter"
import { generationModelRegistry } from "@/lib/realfarm-generation-model-registry"
import {
  benchmarkXRun,
  type ProofEntry,
  type XAutomationBrief,
  type XAutomationPlatform,
  type XAutomationRecord,
  type XAutomationOperationAttempt,
  type XAutomationRun,
  type XGeneratedPost,
  type XTrendCandidate,
} from "@/lib/x-automation"
import {
  archetypesForPlatform,
  hookStylesForPlatform,
  platformRules,
  voicePreset,
  type HookStyle,
  type PostArchetype,
  type XPlatform,
} from "@/lib/x-post-presets"

type GenerateInput = {
  automation: XAutomationRecord
  topic: string
  sourceCandidate?: XTrendCandidate
  apiKey?: string
  fetchImpl?: typeof fetch
  now?: Date
  random?: () => number
  brandProfile?: BrandProfile | null
  enableGenerationChain?: boolean
}

const TOPIC_USE_RATE = 0.7

export type PostPlan = {
  platform: XPlatform
  archetype: PostArchetype
  pillar: { label: string; weight: number }
  hookStyle: HookStyle
  topic?: string
  proof: ProofEntry[]
  recycleBody?: string
}

export async function derivePillarsFromNiche(input: {
  niche: string
  model: string
  apiKey?: string
  fetchImpl?: typeof fetch
}): Promise<XAutomationBrief> {
  return (await derivePillarsFromNicheWithDiagnostics(input)).brief
}

export class XStrategyDerivationError extends Error {
  readonly attempts: XAutomationOperationAttempt[]
  readonly retryable: boolean

  constructor(attempts: XAutomationOperationAttempt[]) {
    const retryable = attempts.some((attempt) => attempt.retryable)
    super(
      retryable
        ? "The AI provider is temporarily unavailable. Your changes are saved; retry strategy generation."
        : attempts.at(-1)?.message || "Strategy generation failed"
    )
    this.name = "XStrategyDerivationError"
    this.attempts = attempts
    this.retryable = retryable
  }
}

export async function derivePillarsFromNicheWithDiagnostics(input: {
  niche: string
  model: string
  apiKey?: string
  fetchImpl?: typeof fetch
}): Promise<{
  brief: XAutomationBrief
  attempts: XAutomationOperationAttempt[]
  selectedModel: string
}> {
  const niche = clean(input.niche)
  if (!niche) throw new Error("A niche is required")
  const apiKey = clean(input.apiKey) || getOpenRouterApiKey()
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
  const fallbackModels =
    generationModelRegistry.openRouter.xPostGeneration.fallbackModels
  const models = [input.model, ...fallbackModels].filter(
    (model, index, values) => Boolean(model) && values.indexOf(model) === index
  )
  const attempts: XAutomationOperationAttempt[] = []
  let brief: XAutomationBrief | null = null
  let selectedModel = ""

  for (const [modelIndex, model] of models.entries()) {
    const maxAttempts = modelIndex === 0 ? 2 : 1
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await openRouterJson({
          apiKey,
          fetchImpl: input.fetchImpl,
          model,
          timeoutMs: 90_000,
          maxTokens: 2_800,
          system:
            "You derive a focused social-content strategy from one niche. Return concrete audience language and distinct content pillars. Never invent performance claims.",
          user: `Niche: ${niche}\nReturn {"audience":"...","promise":"...","pillars":[{"label":"..."}],"keywords":["..."],"painPoints":["..."]}. Return exactly 3–5 pillars.`,
          schema: {
            name: "x_automation_brief",
            schema: {
              type: "object",
              additionalProperties: false,
              required: [
                "audience",
                "promise",
                "pillars",
                "keywords",
                "painPoints",
              ],
              properties: {
                audience: { type: "string" },
                promise: { type: "string" },
                pillars: {
                  type: "array",
                  minItems: 3,
                  maxItems: 5,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["label"],
                    properties: { label: { type: "string" } },
                  },
                },
                keywords: { type: "array", items: { type: "string" } },
                painPoints: { type: "array", items: { type: "string" } },
              },
            },
          },
        })
        brief = briefFromStrategyResult(result)
        selectedModel = model
        break
      } catch (error) {
        const providerError =
          error instanceof OpenRouterRequestError ? error : null
        const retryable = providerError?.retryable ?? true
        attempts.push({
          model,
          attempt,
          ...(providerError?.status ? { status: providerError.status } : {}),
          code: providerError?.code || "validation_error",
          message:
            error instanceof Error ? error.message : "Unknown provider error",
          retryable,
        })
        if (!retryable) throw new XStrategyDerivationError(attempts)
      }
    }
    if (brief) break
  }
  if (!brief) throw new XStrategyDerivationError(attempts)
  return { brief, attempts, selectedModel }
}

function briefFromStrategyResult(
  result: Record<string, unknown>
): XAutomationBrief {
  const labels = Array.isArray(result.pillars)
    ? result.pillars
        .flatMap((item) =>
          isRecord(item) && clean(item.label) ? [clean(item.label)] : []
        )
        .slice(0, 5)
    : []
  if (labels.length < 3)
    throw new Error("Strategy derivation returned fewer than three pillars")
  const weights = [30, 20, 15, 10, 5]
  return {
    audience: clean(result.audience),
    promise: clean(result.promise),
    pillars: labels.map((label, index) => ({ label, weight: weights[index] })),
    keywords: asStringArray(result.keywords),
    painPoints: asStringArray(result.painPoints),
    derivedAt: new Date().toISOString(),
  }
}

export function selectPostPlan(
  record: XAutomationRecord,
  options: {
    platform: XPlatform
    topic?: string
    now?: Date
    random?: () => number
  }
): PostPlan {
  if (!record.brief?.pillars.length)
    throw new Error("Generate the niche strategy before creating a draft")
  const random = options.random ?? Math.random
  const now = options.now ?? new Date()
  const cutoff = now.getTime() - 7 * 86_400_000
  const recent = record.usage.recentArchetypes.filter(
    (item) => Date.parse(item.at) >= cutoff
  )
  const previous = record.usage.recentArchetypes.at(-1)?.id
  const astrology = /astrolog|zodiac|horoscope/i.test(record.niche.label)
  const platformEligible = (item: PostArchetype) => {
    if (item.id === "data_drop" && astrology) return false
    if (item.id === "pattern_drop" && !astrology) return false
    if (
      record.publishing.autoPost &&
      options.platform === "x" &&
      item.kind === "thread"
    )
      return false
    return !item.needsProof || record.proofBank.length > 0
  }
  let archetypes = archetypesForPlatform(options.platform).filter((item) => {
    if (!platformEligible(item)) return false
    if (item.id === previous) return false
    return (
      !item.maxPerWeek ||
      recent.filter((used) => used.id === item.id).length < item.maxPerWeek
    )
  })
  if (archetypes.length === 0)
    archetypes = archetypesForPlatform(options.platform).filter(
      platformEligible
    )
  const archetype = weightedPick(archetypes, (item) => item.weight, random)
  const useTopic = Boolean(clean(options.topic)) && random() < TOPIC_USE_RATE
  const pillar = useTopic
    ? { label: clean(options.topic), weight: 100 }
    : weightedPick(record.brief.pillars, (item) => item.weight, random)
  const enabled = new Set(record.generation.hookStyles)
  let styles = hookStylesForPlatform(options.platform).filter(
    (item) =>
      enabled.has(item.id) && (!item.needsProof || record.proofBank.length > 0)
  )
  if (styles.length === 0)
    styles = hookStylesForPlatform(options.platform).filter(
      (item) => !item.needsProof || record.proofBank.length > 0
    )
  const lastHookStyle = record.usage.recentHooks.at(-1)
  const nonRepeating = styles.filter((item) => item.id !== lastHookStyle)
  const hookStyle = weightedPick(
    nonRepeating.length ? nonRepeating : styles,
    (item) => item.weight ?? 1,
    random
  )
  const recycleBody =
    options.platform === "threads" && random() < 0.15
      ? threadsRecycleCandidate(record, now)?.body
      : undefined
  return {
    platform: options.platform,
    archetype,
    pillar,
    hookStyle,
    topic: clean(options.topic) || undefined,
    proof: record.proofBank,
    recycleBody,
  }
}

export function threadsRecycleCandidate(
  record: XAutomationRecord,
  now = new Date(),
  cooldownDays = 2
) {
  const cutoff = now.getTime() - cooldownDays * 86_400_000
  return [...record.usage.recentBodies]
    .reverse()
    .find((item) => Date.parse(item.at) <= cutoff)
}

export function buildPostStructuredOutputSchema(archetype: PostArchetype) {
  if (archetype.kind === "thread") {
    return {
      name: `x_post_${archetype.id}`,
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          posts: {
            type: "string",
            description:
              "Exactly 8–15 X posts, each at most 280 characters, separated only by a line containing ---. The final post must be a genuine self-identification or curiosity question ending with ?.",
          },
        },
        required: ["posts"],
      },
    }
  }
  const properties = Object.fromEntries(
    archetype.slots.map((slot) => [
      slot.key,
      {
        type: "string",
        maxLength: slot.maxWords * 6,
        description: `${slot.description}. ${slot.minWords}-${slot.maxWords} words. Hard maximum ${slot.maxWords * 6} characters.`,
      },
    ])
  )
  const required = archetype.slots
    .filter((slot) => !slot.optional)
    .map((slot) => slot.key)
  return {
    name: `x_post_${archetype.id}`,
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties,
      required,
    },
  }
}

export function validateGeneratedPost(input: {
  plan: PostPlan
  record: XAutomationRecord
  output: Record<string, unknown>
  posts: string[]
}) {
  const errors: string[] = []
  for (const slot of input.plan.archetype.kind === "thread"
    ? []
    : input.plan.archetype.slots) {
    const value = clean(input.output[slot.key])
    const words = wordCount(value)
    if (!slot.optional && !value) errors.push(`${slot.key} is required`)
    // A one-word shortfall is harmless and avoids padding otherwise sharp copy
    // just to satisfy an approximate prose target. Upper bounds remain exact.
    if (
      value &&
      (words < Math.max(1, slot.minWords - 1) || words > slot.maxWords)
    )
      errors.push(
        `${slot.key} must be ${slot.minWords}-${slot.maxWords} words; received ${words}`
      )
  }
  if (input.posts.some((post) => /https?:\/\//i.test(post)))
    errors.push("links are not allowed in the post body")
  const joined = input.posts.join("\n\n")
  if (
    /\b(just had (?:coffee|lunch)|believe in yourself|post consistently|never give up)\b/i.test(
      joined
    )
  )
    errors.push("generic or personal-update copy is not allowed")
  const nicheTokens = [
    input.record.niche.label,
    ...(input.record.brief?.keywords ?? []),
    input.plan.pillar.label,
  ]
    .flatMap((value) => value.toLowerCase().match(/[\p{L}\d]+/gu) ?? [])
    .filter((token) => token.length >= 4)
  if (
    nicheTokens.length > 0 &&
    !nicheTokens.some((token) => joined.toLowerCase().includes(token))
  )
    errors.push(
      `Off-niche: post never references the niche (${input.record.niche.label}) or any brief keyword.`
    )
  if (
    input.plan.platform === "x" &&
    input.plan.archetype.kind === "single" &&
    input.posts.some((post) => post.length > 280)
  )
    errors.push("single X posts must be at most 280 characters")
  if (input.plan.platform === "x" && input.plan.archetype.engagementCloser) {
    const last = input.posts.at(-1) ?? ""
    if (
      !/[?]$/.test(last.trim()) &&
      !/\b(which|what|who|would you|your take)\b/i.test(last)
    )
      errors.push(
        "X posts must end with a genuine curiosity gap or reply trigger"
      )
  }
  if (input.plan.platform === "x" && input.plan.archetype.kind === "thread") {
    if (input.posts.length < 8 || input.posts.length > 15)
      errors.push("X threads must contain 8–15 posts")
    if (input.posts.some((post) => post.length > 280))
      errors.push("every X thread post must be at most 280 characters")
  }
  if (input.plan.platform === "threads") {
    const text = joined
    const lines = text.split(/\n+/).filter(Boolean)
    if (text.length > 500)
      errors.push("Threads posts must be at most 500 characters")
    if (lines.length > 4)
      errors.push("Threads posts should use at most 4 short lines")
    if (lines.some((line) => (line.match(/[.!?]+/g) ?? []).length > 2))
      errors.push("Threads lines may contain at most 2 sentences")
    if (lines.length > 1 && !/\n\s*\n/.test(text))
      errors.push("Threads lines must be separated by blank lines")
    if ((text.match(/[😌🥹💜✨🫶😀-🙏]/gu) ?? []).length > 2)
      errors.push("Threads posts may use at most 2 emoji")
    if (/(?:^|\s)#[\p{L}\d_]+/u.test(text))
      errors.push("Threads posts may not use hashtags")
  }
  const numericClaims =
    input.posts
      .join(" ")
      .match(/\$[\d,]+k?|\d+%|\d+\s+(?:clients|sales|followers)/gi) ?? []
  const evidence = input.plan.proof
    .map((item) => item.text.toLowerCase())
    .join(" ")
  for (const claim of numericClaims)
    if (!evidence.includes(claim.toLowerCase()))
      errors.push(`unsupported proof claim: ${claim}`)
  errors.push(...llmSlopViolations(input.posts.join("\n")))
  return [...new Set(errors)]
}

export async function generateXAutomationRun(
  input: GenerateInput
): Promise<XAutomationRun> {
  const apiKey = clean(input.apiKey) || getOpenRouterApiKey()
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
  if (!input.automation.brief)
    throw new Error("Generate the niche strategy before creating a draft")
  const topic =
    clean(input.topic) ||
    input.sourceCandidate?.text ||
    input.automation.brief.pillars[0]?.label
  const plan = selectPostPlan(input.automation, {
    platform: input.automation.platform,
    topic,
    now: input.now,
    random: input.random,
  })
  const first = await generatePost({
    plan,
    record: input.automation,
    apiKey,
    fetchImpl: input.fetchImpl,
    brandProfile: input.brandProfile,
    enableGenerationChain:
      input.enableGenerationChain ??
      process.env.ENABLE_GENERATION_CHAIN === "true",
  })
  const posts: XGeneratedPost[] = first.posts.map((text, index) => ({
    id: `${plan.platform}-post-${index + 1}`,
    text,
    characterCount: text.length,
    role: index === 0 ? "hook" : "content",
    platform: plan.platform,
  }))
  const values = first.output
  const hook = clean(values.hook) || posts[0]?.text || ""
  const content = Object.entries(values)
    .filter(
      ([key]) => !["hook", "proof", "closer", "cta", "posts"].includes(key)
    )
    .map(([, value]) => clean(value))
    .filter(Boolean)
  const cta = clean(values.closer ?? values.cta)
  const benchmark = benchmarkXRun({
    platform: input.automation.platform,
    contentType: first.plan.archetype.kind,
    archetype: first.plan.archetype.id as never,
    hook,
    content,
    proof: clean(values.proof),
    cta,
    posts,
    maxCharacters: input.automation.output.maxCharacters,
  })
  const now = input.now ?? new Date()
  return {
    id: `x-run-${crypto.randomUUID()}`,
    automationId: input.automation.id,
    automationName: input.automation.name,
    topic,
    archetype: first.plan.archetype.id as never,
    contentType: first.plan.archetype.kind,
    platform: input.automation.platform as XAutomationPlatform,
    reactionMode: input.sourceCandidate
      ? input.automation.discovery.reactionMode
      : "none",
    sourceCandidate: input.sourceCandidate,
    hook,
    setup: "",
    content,
    proof: clean(values.proof),
    curiosityGap: "",
    cta,
    posts,
    imagePrompt:
      input.automation.media.mode === "generate"
        ? `${input.automation.media.prompt}\n\nTopic: ${topic}\nCore idea: ${hook}`
        : undefined,
    imageUrls: [],
    benchmark,
    status: "draft",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    plans: [
      {
        platform: plan.platform,
        archetype: plan.archetype.id,
        pillar: plan.pillar.label,
        hookStyle: plan.hookStyle.id,
        needsReview: first.needsReview,
      },
    ],
    needsReview: first.needsReview,
    reviewErrors: first.errors,
  }
}

async function generatePost(input: {
  plan: PostPlan
  record: XAutomationRecord
  apiKey: string
  fetchImpl?: typeof fetch
  brandProfile?: BrandProfile | null
  enableGenerationChain: boolean
}) {
  const schema = buildPostStructuredOutputSchema(input.plan.archetype)
  const voice = voicePreset(input.record.generation.voicePreset)
  const proof = input.plan.proof.length
    ? input.plan.proof
        .map(
          (item) => `- ${item.text}${item.source ? ` (${item.source})` : ""}`
        )
        .join("\n")
    : "none"
  const brief = input.record.brief
  const keywords = brief?.keywords.slice(0, 5) ?? []
  const painPoints = brief?.painPoints.slice(0, 3) ?? []
  const nicheContext = [
    `Niche: ${input.record.niche.label}.`,
    brief?.audience ? `Audience: ${brief.audience}.` : "",
    brief?.promise ? `Promise: ${brief.promise}.` : "",
    keywords.length ? `Core themes: ${keywords.join(", ")}.` : "",
    painPoints.length ? `Reader pains: ${painPoints.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
  const astrology = /astrolog|zodiac|horoscope/i.test(input.record.niche.label)
  const nicheAdaptation = astrology
    ? "For astrology, value means identity insight plus emotional and behavioral specificity. Use concrete relationship, texting, conflict, and private-feeling details—not generic trait lists. If you make an every-sign claim, cover all 12 signs or explicitly name and justify the subset. Never present astrology observations as scientific studies."
    : `Stay strictly on this niche${brief ? ` and its defined pillars/keywords (${[...brief.pillars.map((pillar) => pillar.label), ...keywords].join(", ")})` : ""}. Deliver concrete, niche-specific value. Never drift into generic productivity, creator-economy, or self-help advice.`
  const system = [
    nicheContext,
    voice.systemPrompt,
    nicheAdaptation,
    input.record.generation.voiceOverride,
    `Language: ${input.record.generation.language}.`,
    `Platform rules: ${JSON.stringify(platformRules[input.plan.platform])}.`,
    `Avoid: ${input.record.excludedTopics.join(", ")}.`,
    "Never invent statistics, revenue figures, client results, testimonials, or first-person experience. Only use proof provided in the PROOF section. If no proof is provided, omit proof claims.",
    llmSlopPromptLine(),
  ]
    .filter(Boolean)
    .join("\n")
  const basePrompt = `Platform: ${input.plan.platform}\nArchetype: ${input.plan.archetype.label}\nStructure: ${input.plan.archetype.structure}\nTemplate: ${input.plan.archetype.template}\n${input.plan.platform === "x" && input.plan.archetype.kind === "single" ? "HARD LENGTH BUDGET: the final post, including blank lines, must be 280 characters or fewer. Keep every slot under its schema word and character caps.\n" : ""}${input.plan.platform === "x" && input.plan.archetype.engagementCloser ? "HARD CLOSER RULE: the final slot or final thread post must end with a genuine curiosity or self-identification question and a ? character.\n" : ""}Pillar: ${input.plan.pillar.label}\nHook formula: ${input.plan.hookStyle.formula}\nHook examples: ${input.plan.hookStyle.examples.join(" | ")}\nTopic: ${input.plan.topic ?? "none"}${input.plan.recycleBody ? `\nRECYCLE BODY (keep its core meaning, write a clearly different hook): ${input.plan.recycleBody}` : ""}\nPROOF:\n${proof}`
  if (input.enableGenerationChain && input.brandProfile) {
    const chained = await runGenerationChain({
      generate: { model: input.record.generation.model, system },
      humanize: {
        model: generationModelRegistry.openRouter.contentHumanize.model,
      },
      review: { model: generationModelRegistry.openRouter.contentReview.model },
      input: {
        apiKey: input.apiKey,
        fetchImpl: input.fetchImpl,
        brandProfile: input.brandProfile,
        prompt: `${basePrompt}\n\nReturn only the complete publishable post text in content. For a thread, separate posts with a line containing ---.`,
      },
    })
    const posts =
      input.plan.archetype.kind === "thread"
        ? chained.content
            .split(/\n\s*---\s*\n/)
            .map(clean)
            .filter(Boolean)
        : [chained.content]
    return {
      plan: input.plan,
      output: { hook: posts[0] ?? "", posts: chained.content },
      posts,
      needsReview: chained.issues.length > 0,
      errors: chained.issues,
    }
  }
  let output: Record<string, unknown> = {}
  let posts: string[] = []
  let errors: string[] = []
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      output = await openRouterJson({
        apiKey: input.apiKey,
        fetchImpl: input.fetchImpl,
        model: input.record.generation.model,
        timeoutMs: 90_000,
        maxTokens: 2_800,
        system,
        user: `${basePrompt}${errors.length ? `\n\nRepair these exact errors:\n- ${errors.join("\n- ")}` : ""}`,
        schema,
      })
      if (attempt === 1)
        output = normalizeStructuredOutput(input.plan.archetype, output)
    } catch (error) {
      if (
        attempt === 0 &&
        error instanceof Error &&
        /invalid json/i.test(error.message)
      ) {
        errors = ["Return compact, complete JSON matching the schema exactly"]
        continue
      }
      throw error
    }
    posts = composeStructuredPost(input.plan.archetype, output)
    errors = validateGeneratedPost({
      plan: input.plan,
      record: input.record,
      output,
      posts,
    })
    if (errors.length === 0) break
  }
  return {
    plan: input.plan,
    output,
    posts,
    needsReview: errors.length > 0,
    errors,
  }
}

function composeStructuredPost(
  archetype: PostArchetype,
  output: Record<string, unknown>
) {
  if (archetype.kind === "thread") {
    if (Array.isArray(output.posts)) return asStringArray(output.posts)
    return clean(output.posts)
      .split(/\n\s*---\s*\n/)
      .map(clean)
      .filter(Boolean)
  }
  const text = archetype.slots
    .map((slot) => clean(output[slot.key]))
    .filter(Boolean)
    .join("\n\n")
  return text ? [text] : []
}

export function normalizeStructuredOutput(
  archetype: PostArchetype,
  output: Record<string, unknown>
) {
  if (archetype.kind === "thread") return output
  const normalized = { ...output }
  for (const slot of archetype.slots) {
    const value = clean(normalized[slot.key])
    if (!value || wordCount(value) <= slot.maxWords) continue
    normalized[slot.key] = value.split(/\s+/).slice(0, slot.maxWords).join(" ")
  }
  return normalized
}

function weightedPick<T>(
  items: T[],
  weight: (item: T) => number,
  random: () => number
): T {
  if (items.length === 0) throw new Error("No eligible preset is available")
  const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0)
  let cursor = random() * total
  for (const item of items) {
    cursor -= Math.max(0, weight(item))
    if (cursor <= 0) return item
  }
  return items.at(-1)!
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : []
}
function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}
