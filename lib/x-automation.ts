import { clean, isRecord } from "@/lib/guards"
import type { AutomationSchedule } from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"
import type { PostFastSocialIntegration } from "@/lib/postfast-client"
import { generationModelRegistry } from "@/lib/realfarm-generation-model-registry"

export type XAutomationPlatform = "x" | "threads"
export type XContentType = "single" | "thread" | "article"
export type XPostLength = "short" | "standard" | "long"
export type XPostArchetype =
  | "educational_thread"
  | "data_drop"
  | "pattern_drop"
  | "contrarian_take"
  | "numbered_list"
  | "comparison"
  | "mistake_breakdown"
  | "opinion_framework"
  | "label_take"
  | "provocative_polemic"
  | "audience_callout"
  | "question_bait"
  | "analogy_reframe"
  | "micro_story"
  | "credibility_claim"
  | "win_celebration"
  | "controversial_humor"
export type XMediaMode = "none" | "generate"
export type XReactionMode = "none" | "repost" | "quote"
export type XDiscoverySource = "x" | "tiktok" | "instagram"
export type ProofEntry = {
  id: string
  text: string
  kind: "result" | "testimonial" | "stat"
  source?: string
}
export type XAutomationBrief = {
  audience: string
  promise: string
  pillars: { label: string; weight: number }[]
  keywords: string[]
  painPoints: string[]
  derivedAt: string
}

export type XAutomationBenchmark = {
  id: string
  url: string
  platform: XAutomationPlatform | "tiktok" | "instagram"
  archetype: "authority" | "reaction" | "story" | "relatable" | "custom"
  text: string
  media: "none" | "image" | "gallery" | "video"
  metrics?: {
    views?: number
    likes?: number
    replies?: number
    reposts?: number
    bookmarks?: number
  }
  notes: string[]
}

export type XAutomationRecord = {
  id: string
  ownerId?: string
  platform: XAutomationPlatform
  name: string
  status: "live" | "paused"
  createdAt: string
  updatedAt: string
  niche: {
    label: string
    audience: string
    promise: string
    painPoints: string[]
    pillars: string[]
    keywords: string[]
    excludedTopics: string[]
  }
  brief: XAutomationBrief | null
  excludedTopics: string[]
  proofBank: ProofEntry[]
  output: {
    contentType: XContentType
    archetype: XPostArchetype
    singleLength: XPostLength
    maxCharacters: number
    threadPostCount: { min: number; max: number }
    articleWordCount: { min: number; max: number }
  }
  generation: {
    model: string
    autoInferBrief: boolean
    language: string
    hookStyles: string[]
    voicePreset: string
    voiceOverride: string
  }
  media: {
    mode: XMediaMode
    aspectRatio: "1:1" | "4:5" | "16:9"
    prompt: string
  }
  discovery: {
    enabled: boolean
    sources: XDiscoverySource[]
    lookbackHours: number
    minimumViews: number
    minimumEngagementRate: number
    reactionMode: XReactionMode
  }
  benchmarks: XAutomationBenchmark[]
  publishing: {
    integrations: PostFastSocialIntegration[]
    autoPost: boolean
  }
  schedule: AutomationSchedule
  usage: {
    recentArchetypes: { id: string; at: string }[]
    recentHooks: string[]
    recentBodies: { body: string; hook: string; at: string }[]
  }
}

export type XInferredContentBrief = {
  niche: string
  audience: string
  promise: string
  angle: string
  pillars: string[]
  keywords: string[]
  painPoint: string
  voice: string
  archetype: XPostArchetype
  hookDirection: string
  contentDirection: string
  ctaDirection: string
  exclusions: string[]
}

export type XTrendCandidate = {
  id: string
  source: XDiscoverySource
  url: string
  author?: string
  text: string
  mediaUrls: string[]
  publishedAt?: string
  metrics: {
    views: number
    likes: number
    replies: number
    reposts: number
  }
  engagementRate: number
  relevanceScore: number
  reason: string
}

export type XGeneratedPost = {
  id: string
  text: string
  characterCount: number
  role: "hook" | "setup" | "content" | "proof" | "gap" | "cta"
  platform?: XAutomationPlatform
}

export type XAutomationBenchmarkScore = {
  total: number
  hook: number
  specificity: number
  readability: number
  cta: number
  formatFit: number
  stageCompleteness: number
  archetypeFit: number
  nativeVoice?: number
  factualAccuracy?: number
  benchmarkFit?: number
  evaluator?: "ai" | "heuristic"
  evaluatorModel?: string
  verdict?: "ready" | "revise" | "reject"
  confidence?: number
  summary?: string
  factualRisks?: string[]
  revision?: {
    applied: boolean
    previousTotal: number
    previousVerdict?: "ready" | "revise" | "reject"
    passes?: number
  }
  comparison: {
    archetype: XPostArchetype
    target: string
    matchedBenchmarkId?: string
    matchedBenchmarkLabel?: string
  }
  notes: string[]
}

export type XAutomationRun = {
  id: string
  ownerId?: string
  automationId: string
  automationName: string
  topic: string
  archetype?: XPostArchetype
  inferredBrief?: XInferredContentBrief
  contentType: XContentType
  platform: XAutomationPlatform
  reactionMode: XReactionMode
  sourceCandidate?: XTrendCandidate
  hook: string
  setup: string
  content: string[]
  proof: string
  curiosityGap: string
  cta: string
  posts: XGeneratedPost[]
  articleTitle?: string
  articleBody?: string
  imagePrompt?: string
  imageUrls: string[]
  benchmark: XAutomationBenchmarkScore
  status: "draft" | "approved" | "scheduled" | "published" | "failed"
  scheduledFor?: string
  createdAt: string
  updatedAt: string
  error?: string
  publishing?: {
    attemptedAt: string
    published: number
    failed: number
    skippedReason?: string
  }
  plans?: Array<{
    platform: XAutomationPlatform
    archetype: string
    pillar: string
    hookStyle: string
    needsReview?: boolean
  }>
  needsReview?: boolean
  reviewErrors?: string[]
}

export const phantomProfitBenchmarks: XAutomationBenchmark[] = [
  {
    id: "mho-video-skill",
    url: "https://x.com/Mho_23/status/2075354155309576224",
    platform: "x",
    archetype: "authority",
    media: "image",
    text: "i just built a skill that lets Claude Code actually watch and analyze any video you throw at it",
    metrics: {
      views: 27_556,
      likes: 383,
      replies: 427,
      reposts: 238,
      bookmarks: 542,
    },
    notes: [
      "Leads with a concrete new capability.",
      "Explains the pain, mechanism, use cases, and deliverable.",
      "Closes with an explicit reply-keyword giveaway CTA.",
    ],
  },
  {
    id: "choerrybats-ai-friends",
    url: "https://x.com/choerrybats/status/2076687190843625523",
    platform: "x",
    archetype: "reaction",
    media: "video",
    text: "am i crazy or this an account pretending to have a huge friend group filled with ai pics and pinterest pics??",
    metrics: { views: 1_700_000, likes: 67_000, replies: 244, reposts: 1_700 },
    notes: [
      "Reacts to a viral video with one sharp observation.",
      "The question format invites verification and debate.",
      "The source media carries most of the context.",
    ],
  },
  {
    id: "kylifec-pizza-shop",
    url: "https://x.com/kylifec/status/2076642717862363381",
    platform: "x",
    archetype: "story",
    media: "gallery",
    text: "highly recommend asking your local pizza shop if you can be a cashier for a day. worst they can say is no.",
    metrics: { views: 58_300, likes: 345, replies: 33, reposts: 6 },
    notes: [
      "Simple lived-experience recommendation.",
      "Four photos provide proof and make the unusual idea believable.",
      "Conversational language keeps the post native to the feed.",
    ],
  },
  {
    id: "mattwelter-marketing-day",
    url: "https://x.com/_mattwelter/status/2076685078336319523",
    platform: "x",
    archetype: "relatable",
    media: "video",
    text: "okay today's my marketing day — 3 minutes later — damn my product sucks i need to make it better before i tell people about it",
    metrics: { views: 8_858, likes: 338, replies: 43, reposts: 27 },
    notes: [
      "Uses a two-beat setup and reversal.",
      "Short copy lets the video deliver the payoff.",
      "Highly specific founder tension creates recognition.",
    ],
  },
]

export function defaultXAutomation(
  overrides: Partial<Pick<XAutomationRecord, "id" | "name" | "platform">> = {}
): XAutomationRecord {
  const now = new Date().toISOString()
  const platform = overrides.platform ?? "x"
  const everyDay: import("@/lib/realfarm-automation").AutomationDay[] = [
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ]
  return {
    id: overrides.id ?? `x-automation-${crypto.randomUUID()}`,
    name:
      overrides.name ??
      (platform === "threads" ? "New Threads automation" : "New X automation"),
    platform,
    status: "paused",
    createdAt: now,
    updatedAt: now,
    niche: {
      label: "",
      audience: "",
      promise: "",
      painPoints: [],
      pillars: [],
      keywords: [],
      excludedTopics: [
        "invented facts, studies, metrics, testimonials, or personal experience",
        "medical, legal, or financial advice presented without qualification",
      ],
    },
    brief: null,
    excludedTopics: [
      "invented facts, studies, metrics, testimonials, or personal experience",
      "medical, legal, or financial advice presented without qualification",
    ],
    proofBank: [],
    output: {
      contentType: platform === "x" ? "thread" : "single",
      archetype: platform === "x" ? "educational_thread" : "label_take",
      singleLength: "standard",
      maxCharacters: 280,
      threadPostCount: { min: 8, max: 15 },
      articleWordCount: { min: 800, max: 1_200 },
    },
    generation: {
      model: generationModelRegistry.openRouter.xPostGeneration.model,
      autoInferBrief: true,
      language: "English",
      hookStyles:
        platform === "x"
          ? [
              "big_number",
              "contrarian",
              "time_based",
              "curiosity_gap",
              "direct_address",
            ]
          : [
              "threads_unpopular_opinion",
              "threads_real_talk",
              "threads_hot_take",
              "threads_reality_check",
              "threads_truth",
              "threads_point_blank",
            ],
      voicePreset:
        platform === "x" ? "faceless_tactical" : "personal_connector",
      voiceOverride: "",
    },
    media: {
      mode: "generate",
      aspectRatio: "16:9",
      prompt:
        "Create a clean editorial visual that explains the core mechanism. No logos, fake UI, or decorative text.",
    },
    discovery: {
      enabled: true,
      sources: ["x", "tiktok", "instagram"],
      lookbackHours: 72,
      minimumViews: 10_000,
      minimumEngagementRate: 0.02,
      reactionMode: "quote",
    },
    benchmarks: phantomProfitBenchmarks,
    publishing: { integrations: [], autoPost: true },
    schedule: {
      timezone: "Asia/Singapore",
      posting_times: [
        ...(platform === "x"
          ? [
              { time: "8:00 AM", days: everyDay, enabled: true },
              { time: "6:00 PM", days: everyDay, enabled: true },
            ]
          : [
              "8:00 AM",
              "9:00 AM",
              "12:00 PM",
              "5:00 PM",
              "6:00 PM",
              "8:30 PM",
            ].map((time) => ({
              time,
              days: everyDay,
              enabled: true,
            }))),
      ],
      paused: false,
      jitter_minutes: 10,
      min_gap_minutes: 180,
    },
    usage: { recentArchetypes: [], recentHooks: [], recentBodies: [] },
  }
}

export function xAutomationToAutomation(engine: XAutomationRecord): Automation {
  const activeIntegrations = engine.publishing.integrations.filter(
    (integration) => !integration.disabled
  )
  const first = activeIntegrations[0]
  const extraCount = Math.max(0, activeIntegrations.length - 1)
  const provider =
    first?.provider === "x"
      ? "X"
      : first?.provider === "threads"
        ? "Threads"
        : engine.platform === "threads"
          ? "Threads"
          : "X"
  const profile = first?.profile
    ? `@${first.profile.replace(/^@/, "")}`
    : provider

  return {
    id: engine.id,
    name: engine.name,
    automationKind: "x_threads",
    platform: engine.platform,
    status: engine.status,
    account: first
      ? `${first.name}${extraCount > 0 ? ` +${extraCount}` : ""}`
      : "No social account",
    handle: first ? `${provider} · ${profile}` : "Click to add account",
    times: engine.schedule.posting_times
      .filter((postingTime) => postingTime.enabled !== false)
      .map((postingTime) => postingTime.time),
    timezone: engine.schedule.timezone,
    schedule: engine.schedule,
    favorite: false,
    theme: "x_threads",
    socialIntegrations: engine.publishing.integrations,
    created_at: engine.createdAt,
  }
}

export function normalizeXAutomation(value: unknown): XAutomationRecord | null {
  if (!isRecord(value)) return null
  const id = clean(value.id)
  if (!id) return null
  const defaults = defaultXAutomation({
    id,
    name: clean(value.name) || undefined,
    platform: value.platform === "threads" ? "threads" : "x",
  })
  const niche = isRecord(value.niche) ? value.niche : {}
  const output = isRecord(value.output) ? value.output : {}
  const generation = isRecord(value.generation) ? value.generation : {}
  const media = isRecord(value.media) ? value.media : {}
  const discovery = isRecord(value.discovery) ? value.discovery : {}
  const publishing = isRecord(value.publishing) ? value.publishing : {}
  const schedule = isRecord(value.schedule) ? value.schedule : {}
  const oldNicheHasBrief =
    clean(niche.audience) ||
    clean(niche.promise) ||
    stringArray(niche.pillars).length > 0
  const explicitBrief = normalizeBrief(value.brief)
  const migratedBrief =
    explicitBrief ??
    (oldNicheHasBrief
      ? {
          audience: clean(niche.audience),
          promise: clean(niche.promise),
          pillars: stringArray(niche.pillars)
            .slice(0, 5)
            .map((label, index) => ({
              label,
              weight: [30, 20, 15, 10, 5][index],
            })),
          keywords: stringArray(niche.keywords),
          painPoints: stringArray(niche.painPoints),
          derivedAt: clean(value.updatedAt) || new Date().toISOString(),
        }
      : null)
  const customLegacyPrompts = legacyPromptOverrides(generation)
  const legacyVoice =
    clean(generation.voice) &&
    clean(generation.voice) !==
      "lowercase, blunt, tactical, specific, zero fluff"
      ? clean(generation.voice)
      : ""
  const voiceOverride = [
    clean(generation.voiceOverride),
    legacyVoice,
    ...customLegacyPrompts,
  ]
    .filter(Boolean)
    .join("\n\n")
  const legacyPlatforms = stringArray(output.platforms).filter(
    (item): item is XAutomationPlatform => item === "x" || item === "threads"
  )
  const platformFlags = isRecord(output.platformFlags)
    ? {
        x: output.platformFlags.x !== false,
        threads: output.platformFlags.threads !== false,
      }
    : {
        x: legacyPlatforms.length === 0 || legacyPlatforms.includes("x"),
        threads:
          legacyPlatforms.length === 0 || legacyPlatforms.includes("threads"),
      }
  const platform: XAutomationPlatform =
    value.platform === "threads" || value.platform === "x"
      ? value.platform
      : platformFlags.x
        ? "x"
        : "threads"
  return {
    ...defaults,
    ...value,
    id,
    platform,
    name: clean(value.name) || defaults.name,
    status: value.status === "live" ? "live" : "paused",
    niche: { ...defaults.niche, ...niche } as XAutomationRecord["niche"],
    brief: migratedBrief,
    excludedTopics:
      stringArray(value.excludedTopics).length > 0
        ? stringArray(value.excludedTopics)
        : stringArray(niche.excludedTopics).length > 0
          ? stringArray(niche.excludedTopics)
          : defaults.excludedTopics,
    proofBank: normalizeProofBank(value.proofBank),
    output: {
      contentType:
        output.contentType === "single" || output.contentType === "article"
          ? output.contentType
          : "thread",
      archetype: clean(output.archetype)
        ? (output.archetype as XPostArchetype)
        : defaults.output.archetype,
      singleLength:
        output.singleLength === "short" || output.singleLength === "long"
          ? output.singleLength
          : "standard",
      maxCharacters:
        Number(output.maxCharacters) ||
        characterLimitFor(
          output.singleLength === "short" || output.singleLength === "long"
            ? output.singleLength
            : "standard"
        ),
      threadPostCount: isRecord(output.threadPostCount)
        ? {
            min: Number(output.threadPostCount.min) || 8,
            max: Number(output.threadPostCount.max) || 15,
          }
        : defaults.output.threadPostCount,
      articleWordCount: isRecord(output.articleWordCount)
        ? {
            min: Number(output.articleWordCount.min) || 800,
            max: Number(output.articleWordCount.max) || 1200,
          }
        : defaults.output.articleWordCount,
    },
    generation: {
      model: clean(generation.model) || defaults.generation.model,
      autoInferBrief: generation.autoInferBrief !== false,
      language: clean(generation.language) || defaults.generation.language,
      hookStyles:
        stringArray(generation.hookStyles).length > 0
          ? stringArray(generation.hookStyles)
          : defaults.generation.hookStyles,
      voicePreset:
        clean(generation.voicePreset) || defaults.generation.voicePreset,
      voiceOverride,
    },
    media: {
      mode: media.mode === "none" ? "none" : "generate",
      aspectRatio:
        media.aspectRatio === "1:1" || media.aspectRatio === "4:5"
          ? media.aspectRatio
          : "16:9",
      prompt: clean(media.prompt) || defaults.media.prompt,
    },
    discovery: {
      enabled: discovery.enabled !== false,
      sources: stringArray(discovery.sources).filter(
        (source): source is XDiscoverySource =>
          source === "x" || source === "tiktok" || source === "instagram"
      ),
      lookbackHours:
        Number(discovery.lookbackHours) || defaults.discovery.lookbackHours,
      minimumViews:
        Number(discovery.minimumViews) || defaults.discovery.minimumViews,
      minimumEngagementRate:
        Number(discovery.minimumEngagementRate) ||
        defaults.discovery.minimumEngagementRate,
      reactionMode:
        discovery.reactionMode === "repost" || discovery.reactionMode === "none"
          ? discovery.reactionMode
          : "quote",
    } as XAutomationRecord["discovery"],
    benchmarks: Array.isArray(value.benchmarks)
      ? (value.benchmarks as XAutomationBenchmark[])
      : defaults.benchmarks,
    publishing: {
      ...defaults.publishing,
      ...publishing,
      integrations: Array.isArray(publishing.integrations)
        ? (publishing.integrations as PostFastSocialIntegration[]).filter(
            (integration) =>
              platform === "threads"
                ? integration.provider === "threads"
                : integration.provider === "x" ||
                  integration.provider === "twitter"
          )
        : [],
    } as XAutomationRecord["publishing"],
    schedule: { ...defaults.schedule, ...schedule } as AutomationSchedule,
    usage: normalizeUsage(value.usage),
    createdAt: clean(value.createdAt) || defaults.createdAt,
    updatedAt: clean(value.updatedAt) || defaults.updatedAt,
  }
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : []
}

function normalizeBrief(value: unknown): XAutomationBrief | null {
  if (!isRecord(value)) return null
  const pillars = Array.isArray(value.pillars)
    ? value.pillars.flatMap((pillar, index) =>
        isRecord(pillar) && clean(pillar.label)
          ? [
              {
                label: clean(pillar.label),
                weight:
                  Number(pillar.weight) || [30, 20, 15, 10, 5][index] || 5,
              },
            ]
          : []
      )
    : []
  if (pillars.length === 0) return null
  return {
    audience: clean(value.audience),
    promise: clean(value.promise),
    pillars,
    keywords: stringArray(value.keywords),
    painPoints: stringArray(value.painPoints),
    derivedAt: clean(value.derivedAt) || new Date().toISOString(),
  }
}

function normalizeProofBank(value: unknown): ProofEntry[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        if (!isRecord(entry) || !clean(entry.text)) return []
        const kind =
          entry.kind === "testimonial" || entry.kind === "stat"
            ? entry.kind
            : "result"
        return [
          {
            id: clean(entry.id) || `proof-${crypto.randomUUID()}`,
            text: clean(entry.text),
            kind,
            source: clean(entry.source) || undefined,
          },
        ]
      })
    : []
}

function normalizeUsage(value: unknown): XAutomationRecord["usage"] {
  if (!isRecord(value))
    return { recentArchetypes: [], recentHooks: [], recentBodies: [] }
  return {
    recentArchetypes: Array.isArray(value.recentArchetypes)
      ? value.recentArchetypes
          .flatMap((item) =>
            isRecord(item) && clean(item.id)
              ? [
                  {
                    id: clean(item.id),
                    at: clean(item.at) || new Date().toISOString(),
                  },
                ]
              : []
          )
          .slice(-100)
      : [],
    recentHooks: stringArray(value.recentHooks).slice(-30),
    recentBodies: Array.isArray(value.recentBodies)
      ? value.recentBodies
          .flatMap((item) =>
            isRecord(item) && clean(item.body)
              ? [
                  {
                    body: clean(item.body),
                    hook: clean(item.hook),
                    at: clean(item.at) || new Date().toISOString(),
                  },
                ]
              : []
          )
          .slice(-100)
      : [],
  }
}

const legacyPromptDefaults = [
  "Write a surprising, specific claim plus a promise or question. It must pass a three-second test.",
  "Establish the pain, opportunity, or stakes in 1-2 compact sentences without repeating the hook.",
  "Teach a useful framework with single-idea paragraphs, concrete steps, examples, and 1-2 memorable numbers when supported.",
  "Add only verifiable proof from the provided source or supplied facts. If none exists, use a concrete example and clearly label it as an example.",
  "Leave one useful open loop with a question, contrast, or next-step tease that invites a real response.",
  "Choose one low-friction action: bookmark, reply with a keyword, follow for the next part, or try the first step.",
]

function legacyPromptOverrides(generation: Record<string, unknown>) {
  return [
    "hookPrompt",
    "setupPrompt",
    "contentPrompt",
    "proofPrompt",
    "curiosityGapPrompt",
    "ctaPrompt",
  ]
    .map((key, index) =>
      clean(generation[key]) &&
      clean(generation[key]) !== legacyPromptDefaults[index]
        ? `${key}: ${clean(generation[key])}`
        : ""
    )
    .filter(Boolean)
}

export function characterLimitFor(length: XPostLength) {
  if (length === "short") return 140
  if (length === "long") return 4_000
  return 280
}

export function benchmarkXRun(input: {
  platform?: XAutomationPlatform
  contentType: XContentType
  archetype?: XPostArchetype
  hook: string
  setup?: string
  content: string[]
  proof?: string
  curiosityGap?: string
  cta: string
  posts: XGeneratedPost[]
  maxCharacters: number
}): XAutomationBenchmarkScore {
  const notes: string[] = []
  const hookWords = input.hook.trim().split(/\s+/).filter(Boolean).length
  const hook = clampScore(
    100 - Math.abs(hookWords - 16) * 4 - (/[?!:]/.test(input.hook) ? 0 : 8)
  )
  const archetype = input.archetype ?? "educational_thread"
  const joined = [
    input.hook,
    input.setup,
    ...input.content,
    input.proof,
    input.curiosityGap,
    input.cta,
  ]
    .filter(Boolean)
    .join(" ")
  const concreteSignals = (joined.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []).length
  const specificity = clampScore(
    55 + concreteSignals * 12 - vaguePenalty(joined)
  )
  const averageSentenceWords = averageWordsPerSentence(joined)
  const readability = clampScore(
    100 - Math.max(0, averageSentenceWords - 18) * 4
  )
  const isThreads = input.platform === "threads"
  const cta = isThreads
    ? 100
    : clampScore(
        input.cta.length > 0 &&
          /\b(reply|bookmark|save|follow|try|dm|share|read)\b/i.test(input.cta)
          ? 92
          : input.cta.length > 0
            ? 65
            : 20
      )
  const overflowing = input.posts.filter(
    (post) => post.characterCount > input.maxCharacters
  )
  const countFit =
    input.contentType !== "thread" ||
    (input.posts.length >= 8 && input.posts.length <= 15)
  const formatFit = clampScore(
    100 - overflowing.length * 25 - (countFit ? 0 : 20)
  )
  const replyPrompt =
    /\?|\b(reply|tell me|which|what|who|would you|your take)\b/i.test(joined)
  const stages = isThreads
    ? [input.hook, input.content.join(" "), replyPrompt ? "reply prompt" : ""]
    : [
        input.hook,
        input.setup,
        input.content.join(" "),
        input.proof,
        input.curiosityGap,
        input.cta,
      ]
  const stageCompleteness = clampScore(
    (stages.filter((stage) => clean(stage).length > 0).length / stages.length) *
      100
  )
  const archetypeFit = scoreArchetypeFit(archetype, joined, input.content)
  const benchmark = benchmarkArchetypeMetadata(archetype)
  const matchedBenchmark = closestCorpusBenchmark(archetype)
  if (overflowing.length)
    notes.push(`${overflowing.length} post(s) exceed the character limit.`)
  if (!countFit) notes.push("Educational threads benchmark best at 8-15 posts.")
  if (concreteSignals === 0)
    notes.push(
      "Add a supported number, example, or named mechanism for specificity."
    )
  if (!isThreads && cta < 80)
    notes.push("End with one explicit, low-friction action.")
  if (stageCompleteness < 100)
    notes.push(
      isThreads
        ? "Add a clear hook, substantive body, and reply prompt before posting."
        : "Complete setup, proof, curiosity gap, and CTA before posting."
    )
  if (archetypeFit < 75)
    notes.push(
      `Strengthen the ${benchmark.label.toLowerCase()} structure: ${benchmark.structure}.`
    )
  return {
    total: Math.round(
      hook * 0.2 +
        specificity * 0.18 +
        readability * 0.12 +
        cta * 0.12 +
        formatFit * 0.14 +
        stageCompleteness * 0.12 +
        archetypeFit * 0.12
    ),
    hook,
    specificity,
    readability,
    cta,
    formatFit,
    stageCompleteness,
    archetypeFit,
    comparison: {
      archetype,
      target: benchmark.target,
      matchedBenchmarkId: matchedBenchmark?.id,
      matchedBenchmarkLabel: matchedBenchmark
        ? `${matchedBenchmark.archetype} · ${matchedBenchmark.media}`
        : undefined,
    },
    notes,
  }
}

function benchmarkArchetypeMetadata(archetype: XPostArchetype) {
  const labels: Partial<Record<XPostArchetype, [string, string]>> = {
    educational_thread: [
      "Educational thread",
      "outcome → failure → framework → proof → CTA",
    ],
    data_drop: ["Data drop", "sourced findings → implications → takeaway"],
    pattern_drop: [
      "Pattern drop",
      "observed pattern → sign-level implications → question",
    ],
    contrarian_take: [
      "Contrarian take",
      "belief → rebuttal → alternative → question",
    ],
    numbered_list: ["Numbered list", "5–10 specific items → reply question"],
    comparison: ["Comparison", "A versus B → conclusion → question"],
    mistake_breakdown: [
      "Mistake breakdown",
      "mistakes → correction → supported result",
    ],
    opinion_framework: [
      "Opinion framework",
      "take → supporting points → bottom line",
    ],
  }
  const [label, structure] = labels[archetype] ?? [
    "Native platform post",
    "concise native structure",
  ]
  return { label, structure, target: "platform-native engagement" }
}

function scoreArchetypeFit(
  archetype: XPostArchetype,
  joined: string,
  sections: string[]
) {
  const checks: Record<XPostArchetype, boolean[]> = {
    educational_thread: [
      sections.length >= 3,
      /\b(step|first|second|third|framework|process)\b/i.test(joined),
      /\b(result|outcome|takeaway)\b/i.test(joined),
    ],
    data_drop: [
      (joined.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []).length >= 3,
      /\b(source|according|study|data|research)\b/i.test(joined),
      /\b(takeaway|means|implication)\b/i.test(joined),
    ],
    pattern_drop: [
      sections.length >= 1,
      /\b(sign|pattern|always|usually|first|most)\b/i.test(joined),
      /[?:]/.test(joined),
    ],
    contrarian_take: [
      /\b(unpopular|wrong|outdated|myth|contrarian)\b/i.test(joined),
      /\b(instead|actually|works)\b/i.test(joined),
      sections.length >= 2,
    ],
    numbered_list: [
      sections.length >= 3 || /(?:^|\s)\d+[.)]/m.test(joined),
      /\b(list|ways|tools|tips|reasons|lessons)\b/i.test(joined),
      joined.length > 120,
    ],
    comparison: [
      /\b(vs\.?|versus|compared|old way|new way|before|after)\b/i.test(joined),
      /\b(better|choose|recommend|bottom line)\b/i.test(joined),
      sections.length >= 2,
    ],
    mistake_breakdown: [
      /\b(mistake|failed|wasted|lesson|error)\b/i.test(joined),
      /\b(instead|now|fix|correct)\b/i.test(joined),
      /\b(result|outcome|learned)\b/i.test(joined),
    ],
    opinion_framework: [
      /\b(my take|opinion|believe|view)\b/i.test(joined),
      sections.length >= 3,
      /\b(bottom line|therefore|means|implication)\b/i.test(joined),
    ],
    label_take: [
      /\b(real talk|hot take|truth|opinion|point blank)\b/i.test(joined),
      joined.length < 500,
    ],
    provocative_polemic: [/[.!?]/.test(joined), joined.length < 500],
    audience_callout: [
      /\b(you|if you're|leos?|scorpios?|signs?)\b/i.test(joined),
      joined.length < 500,
    ],
    question_bait: [/[?]/.test(joined), joined.length < 500],
    analogy_reframe: [
      /\b(like|as if|isn't|means)\b/i.test(joined),
      joined.length < 500,
    ],
    micro_story: [sections.length >= 1, joined.length < 500],
    credibility_claim: [
      /\b(result|proof|earned|grew|reached|helped)\b/i.test(joined),
      joined.length < 500,
    ],
    win_celebration: [
      /\b(win|won|celebrate|proud|progress|milestone)\b/i.test(joined),
      joined.length < 500,
    ],
    controversial_humor: [/[.!?]/.test(joined), joined.length < 500],
  }
  return clampScore(
    55 +
      (checks[archetype] ?? [sections.length > 0]).filter(Boolean).length * 15
  )
}

function closestCorpusBenchmark(archetype: XPostArchetype) {
  const preferred =
    archetype === "contrarian_take" || archetype === "opinion_framework"
      ? "reaction"
      : archetype === "mistake_breakdown"
        ? "relatable"
        : archetype === "educational_thread" || archetype === "data_drop"
          ? "authority"
          : "story"
  return phantomProfitBenchmarks.find((item) => item.archetype === preferred)
}

function averageWordsPerSentence(value: string) {
  const sentences = value
    .split(/[.!?]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (!sentences.length) return 0
  return (
    sentences.reduce((sum, sentence) => sum + sentence.split(/\s+/).length, 0) /
    sentences.length
  )
}

function vaguePenalty(value: string) {
  return (
    (
      value.match(
        /\b(thing|stuff|somehow|very|really|just|success|value)\b/gi
      ) ?? []
    ).length * 4
  )
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}
