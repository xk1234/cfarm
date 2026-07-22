import { clean } from "@/lib/guards"
import type { BrandProfile } from "@/lib/brand-profile"
import { runGenerationChain } from "@/lib/generation-chain"
import { llmSlopMatches } from "@/lib/llm-slop"
import { getOpenRouterApiKey, openRouterJson } from "@/lib/openrouter"
import { generationModelRegistry } from "@/lib/realfarm-generation-model-registry"
import {
  archetypeById,
  buildLinkedInSystemPrompt,
  buildLinkedInUserPrompt,
  hookStyleById,
  linkedInArchetypes,
  linkedInFormatRules,
  linkedInHookStyles,
  voicePresetById,
  type LinkedInArchetype,
  type LinkedInPostPlan,
} from "@/lib/linkedin-post-presets"

export type LinkedInBrief = {
  audience: string
  promise: string
  pillars: { label: string; weight: number }[]
  keywords: string[]
  painPoints: string[]
  derivedAt: string
}

export type LinkedInGeneratedPost = {
  post: string
  archetypeId: string
  archetypeLabel: string
  hookStyleId: string
  pillar: string
  violations: string[]
  needsReview: boolean
  attempts: number
  characterCount: number
}

const BANNED_CLOSER_SHAPES = [
  "where does it stall",
  "which one is missing",
  "what's your process",
  "what is your process",
]

const EMOJI_RE = /\p{Extended_Pictographic}/gu

export async function deriveLinkedInBrief(input: {
  niche: string
  model: string
  apiKey?: string
  fetchImpl?: typeof fetch
}): Promise<LinkedInBrief> {
  const niche = clean(input.niche)
  if (!niche) throw new Error("A niche is required")
  const apiKey = clean(input.apiKey) || getOpenRouterApiKey()
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
  const result = await openRouterJson({
    apiKey,
    fetchImpl: input.fetchImpl,
    model: input.model,
    timeoutMs: 120_000,
    maxTokens: 4096,
    temperature: 0.8,
    plugins: [{ id: "response-healing" }],
    system:
      "You derive a focused LinkedIn content strategy from one niche. Return concrete audience language and distinct content pillars. Never invent performance claims.",
    user: `Niche: ${niche}\nReturn exactly 3-5 pillars.`,
    schema: {
      name: "linkedin_brief",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["audience", "promise", "pillars", "keywords", "painPoints"],
        properties: {
          audience: { type: "string" },
          promise: { type: "string" },
          pillars: {
            type: "array",
            minItems: 3,
            maxItems: 5,
            items: { type: "string" },
          },
          keywords: { type: "array", items: { type: "string" } },
          painPoints: {
            type: "array",
            minItems: 3,
            maxItems: 6,
            items: { type: "string" },
          },
        },
      },
    },
  })
  const pillarLabels = Array.isArray(result.pillars)
    ? result.pillars
        .map((item) => clean(item))
        .filter(Boolean)
        .slice(0, 5)
    : []
  if (pillarLabels.length < 3)
    throw new Error("Strategy derivation returned fewer than three pillars")
  const weights = [30, 20, 15, 10, 5]
  return {
    audience: clean(result.audience),
    promise: clean(result.promise),
    pillars: pillarLabels.map((label, index) => ({
      label,
      weight: weights[index],
    })),
    keywords: asStringArray(result.keywords),
    painPoints: asStringArray(result.painPoints),
    derivedAt: new Date().toISOString(),
  }
}

export type SelectPlanOptions = {
  brief: LinkedInBrief
  persona: "educator" | "practitioner"
  hasProof: boolean
  enabledArchetypes?: string[]
  enabledHookStyles?: string[]
  archetypeId?: string
  hookStyleId?: string
  pillar?: string
  topic?: string
  recentArchetypeIds?: string[]
  recentHookIds?: string[]
  random?: () => number
}

export function selectLinkedInPlan(
  options: SelectPlanOptions
): LinkedInPostPlan {
  const random = options.random ?? Math.random
  const proofOk = (needsProof?: boolean) => !needsProof || options.hasProof
  const personaOk = (archetype: LinkedInArchetype) =>
    options.persona === "practitioner" || archetype.personaSafe

  if (options.archetypeId) {
    const archetype = archetypeById(options.archetypeId)
    if (!archetype) throw new Error(`Unknown archetype: ${options.archetypeId}`)
    if (!proofOk(archetype.needsProof))
      throw new Error(`Archetype ${archetype.id} needs a non-empty proof bank`)
    const hookStyle = options.hookStyleId
      ? hookStyleById(options.hookStyleId)
      : pickHookStyle(options, random)
    if (!hookStyle)
      throw new Error(`Unknown hook style: ${options.hookStyleId}`)
    return {
      archetype,
      hookStyle,
      pillar: choosePillar(options, random),
      topic: clean(options.topic) || undefined,
    }
  }

  const enabled = options.enabledArchetypes?.length
    ? new Set(options.enabledArchetypes)
    : null
  const previous = options.recentArchetypeIds?.at(-1)
  let candidates = linkedInArchetypes.filter(
    (a) =>
      personaOk(a) &&
      proofOk(a.needsProof) &&
      (!enabled || enabled.has(a.id)) &&
      a.id !== previous
  )
  if (candidates.length === 0)
    candidates = linkedInArchetypes.filter(
      (a) =>
        personaOk(a) && proofOk(a.needsProof) && (!enabled || enabled.has(a.id))
    )
  if (candidates.length === 0)
    throw new Error("No eligible LinkedIn archetype for this configuration")
  const archetype = weightedPick(candidates, (a) => a.weight, random)
  const hookStyle = pickHookStyle(options, random)
  return {
    archetype,
    hookStyle,
    pillar: choosePillar(options, random),
    topic: clean(options.topic) || undefined,
  }
}

function pickHookStyle(options: SelectPlanOptions, random: () => number) {
  const enabled = options.enabledHookStyles?.length
    ? new Set(options.enabledHookStyles)
    : null
  const proofOk = (needsProof?: boolean) => !needsProof || options.hasProof
  let styles = linkedInHookStyles.filter(
    (h) => proofOk(h.needsProof) && (!enabled || enabled.has(h.id))
  )
  if (styles.length === 0)
    styles = linkedInHookStyles.filter((h) => proofOk(h.needsProof))
  const last = options.recentHookIds?.at(-1)
  const nonRepeating = styles.filter((h) => h.id !== last)
  const pool = nonRepeating.length ? nonRepeating : styles
  return pool[Math.floor(random() * pool.length)]
}

function choosePillar(options: SelectPlanOptions, random: () => number) {
  if (clean(options.pillar)) return clean(options.pillar)
  if (clean(options.topic) && random() < 0.2) return clean(options.topic)
  return weightedPick(options.brief.pillars, (p) => p.weight, random).label
}

export function buildPostSchema(archetype: LinkedInArchetype) {
  const properties = Object.fromEntries(
    archetype.slots.map((s) => [
      s.key,
      {
        type: "string",
        description: `${s.description}. ${s.minWords}-${s.maxWords} words.`,
      },
    ])
  )
  const required = archetype.slots.filter((s) => !s.optional).map((s) => s.key)
  return {
    name: `linkedin_post_${archetype.id}`,
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties,
      required,
    },
  }
}

export function composePost(
  archetype: LinkedInArchetype,
  output: Record<string, unknown>
) {
  return archetype.slots
    .map((s) => clean(output[s.key]))
    .filter(Boolean)
    .join("\n\n")
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}

/** Deterministic format gate — the production twin of the lab's frozen checks. */
export function deterministicChecks(
  post: string,
  options: {
    proof?: string[]
    archetypeMinCharacters?: number
    hookStyleNeedsProof?: boolean
  } = {}
) {
  const errors: string[] = []
  const text = post.trim()
  if (!text) return ["post is empty"]

  if (/https?:\/\/|www\./i.test(text))
    errors.push("no links allowed in the post body (kills reach)")
  const minChars = Math.max(
    60,
    options.archetypeMinCharacters ?? linkedInFormatRules.minCharacters
  )
  if (text.length < minChars)
    errors.push(`post is ${text.length} chars; minimum ${minChars}`)
  if (text.length > linkedInFormatRules.maxCharacters)
    errors.push(
      `post is ${text.length} chars; maximum ${linkedInFormatRules.maxCharacters}`
    )

  const firstLine = text.split("\n", 1)[0]
  if (firstLine.length > linkedInFormatRules.firstLineMaxCharacters)
    errors.push(
      `hook line is ${firstLine.length} chars; must be <= ${linkedInFormatRules.firstLineMaxCharacters}`
    )

  const blocks = text.split(/\n\s*\n/).filter(Boolean)
  if (text.length > 400 && blocks.length < 4)
    errors.push(
      `only ${blocks.length} whitespace-separated blocks; posts need breathing room (>= 4)`
    )

  if (/\*\*|\[[^\]]+\]\([^)]+\)|^#+\s/m.test(text))
    errors.push("markdown syntax detected; LinkedIn renders plain text only")
  if (/#[a-z0-9_]+/i.test(text))
    errors.push("hashtags detected; policy is zero hashtags")

  const emoji = text.match(EMOJI_RE) ?? []
  if (emoji.length > linkedInFormatRules.maxEmoji)
    errors.push(
      `${emoji.length} emoji; maximum ${linkedInFormatRules.maxEmoji}`
    )
  const emDashes = (text.match(/—/g) ?? []).length
  if (emDashes > linkedInFormatRules.maxEmDash)
    errors.push(
      `${emDashes} em dashes; maximum ${linkedInFormatRules.maxEmDash} (AI tell)`
    )

  const lower = text.toLowerCase()
  for (const shape of BANNED_CLOSER_SHAPES)
    if (lower.includes(shape)) errors.push(`banned closer shape: "${shape}"`)

  for (const match of llmSlopMatches(text)) {
    errors.push(
      `banned AI-tell wording: "${match}" — rewrite that line in plain human language`
    )
  }

  const claims =
    text.match(
      /[$£€][\d,.]+k?m?|\d+(?:\.\d+)?%|\b[\d,]+\+?\s+(?:clients|sales|followers|leads|views|customers|students)\b/gi
    ) ?? []
  const evidence = (options.proof ?? []).join(" ").toLowerCase()
  for (const claim of claims) {
    if (!evidence.includes(claim.toLowerCase()))
      errors.push(`unsupported numeric claim: "${claim}"`)
  }

  return [...new Set(errors)]
}

export function validateSlots(
  archetype: LinkedInArchetype,
  output: Record<string, unknown>
) {
  const errors: string[] = []
  for (const s of archetype.slots) {
    const value = clean(output[s.key])
    const words = wordCount(value)
    if (!s.optional && !value) errors.push(`${s.key} is required`)
    if (value && (words < s.minWords || words > s.maxWords))
      errors.push(
        `${s.key} must be ${s.minWords}-${s.maxWords} words; received ${words}`
      )
  }
  return errors
}

export async function generateLinkedInPost(input: {
  niche: string
  brief: LinkedInBrief
  plan: LinkedInPostPlan
  personaVoiceId: "educator" | "practitioner"
  model: string
  excludedTopics?: string[]
  proof?: string[]
  apiKey?: string
  fetchImpl?: typeof fetch
  brandProfile?: BrandProfile | null
  enableGenerationChain?: boolean
}): Promise<LinkedInGeneratedPost> {
  const apiKey = clean(input.apiKey) || getOpenRouterApiKey()
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
  const { plan } = input
  const voice = voicePresetById(input.personaVoiceId)
  const schema = buildPostSchema(plan.archetype)
  const system = buildLinkedInSystemPrompt({
    voice,
    niche: input.niche,
    brief: input.brief,
    excludedTopics: input.excludedTopics,
    proof: input.proof,
  })
  const basePrompt = buildLinkedInUserPrompt({ plan })

  const chainEnabled =
    (input.enableGenerationChain ??
      process.env.ENABLE_GENERATION_CHAIN === "true") &&
    Boolean(input.brandProfile)
  if (chainEnabled && input.brandProfile) {
    const chained = await runGenerationChain({
      generate: { model: input.model, system },
      humanize: {
        model: generationModelRegistry.openRouter.contentHumanize.model,
      },
      review: { model: generationModelRegistry.openRouter.contentReview.model },
      input: {
        apiKey,
        fetchImpl: input.fetchImpl,
        brandProfile: input.brandProfile,
        prompt: `${basePrompt}\n\nReturn only the complete publishable LinkedIn post text in content.`,
      },
    })
    const violations = [
      ...deterministicChecks(chained.content, {
        proof: input.proof,
        archetypeMinCharacters: plan.archetype.minCharacters,
      }),
      ...chained.issues,
    ]
    return {
      post: chained.content,
      archetypeId: plan.archetype.id,
      archetypeLabel: plan.archetype.label,
      hookStyleId: plan.hookStyle.id,
      pillar: plan.pillar,
      violations: [...new Set(violations)],
      needsReview: violations.length > 0,
      attempts: chained.trace.length,
      characterCount: chained.content.length,
    }
  }

  let output: Record<string, unknown> = {}
  let post = ""
  let errors: string[] = []
  let attempts = 0
  // 3 attempts: a transient invalid-JSON response should not fail the whole
  // generation, and a valid-but-non-conforming draft gets one repair pass.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    attempts += 1
    try {
      output = await openRouterJson({
        apiKey,
        fetchImpl: input.fetchImpl,
        model: input.model,
        timeoutMs: 120_000,
        maxTokens: 4096,
        temperature: 0.8,
        plugins: [{ id: "response-healing" }],
        system,
        user: `${basePrompt}${errors.length ? `\n\nYour previous attempt failed validation. Repair these exact errors:\n- ${errors.join("\n- ")}` : ""}`,
        schema,
      })
    } catch (error) {
      errors = [
        error instanceof Error
          ? error.message
          : "Return compact, complete JSON matching the schema exactly",
      ]
      if (attempt < 2) continue
      throw error
    }
    post = composePost(plan.archetype, output)
    errors = [
      ...validateSlots(plan.archetype, output),
      ...deterministicChecks(post, {
        proof: input.proof,
        archetypeMinCharacters: plan.archetype.minCharacters,
      }),
    ]
    if (errors.length === 0) break
  }

  return {
    post,
    archetypeId: plan.archetype.id,
    archetypeLabel: plan.archetype.label,
    hookStyleId: plan.hookStyle.id,
    pillar: plan.pillar,
    violations: errors,
    needsReview: errors.length > 0,
    attempts,
    characterCount: post.length,
  }
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
  return items[items.length - 1]
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => clean(item)).filter(Boolean)
    : []
}
