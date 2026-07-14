import { clean, isRecord } from "@/lib/guards"
import type { AutomationSchedule } from "@/lib/realfarm-automation"
import type { PostFastSocialIntegration } from "@/lib/postfast-client"

export type XAutomationPlatform = "x" | "threads"
export type XContentType = "single" | "thread" | "article"
export type XPostLength = "short" | "standard" | "long"
export type XPostArchetype =
  | "educational_thread"
  | "data_drop"
  | "contrarian_take"
  | "numbered_list"
  | "comparison"
  | "mistake_breakdown"
  | "opinion_framework"
export type XMediaMode = "none" | "generate"
export type XReactionMode = "none" | "repost" | "quote"
export type XDiscoverySource = "x" | "tiktok" | "instagram"

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
  output: {
    platforms: XAutomationPlatform[]
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
    voice: string
    hookPrompt: string
    setupPrompt: string
    contentPrompt: string
    proofPrompt: string
    curiosityGapPrompt: string
    ctaPrompt: string
    requireSourceAttribution: boolean
  }
  media: {
    mode: XMediaMode
    count: 1 | 2 | 3 | 4
    aspectRatio: "1:1" | "4:5" | "16:9"
    prompt: string
  }
  discovery: {
    enabled: boolean
    sources: XDiscoverySource[]
    queryTemplates: string[]
    lookbackHours: number
    minimumViews: number
    minimumEngagementRate: number
    reactionMode: XReactionMode
    requireApproval: boolean
  }
  benchmarks: XAutomationBenchmark[]
  publishing: {
    integrations: PostFastSocialIntegration[]
    autoPost: boolean
  }
  schedule: AutomationSchedule
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
  platforms: XAutomationPlatform[]
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
}

export const xPostArchetypes: Array<{
  value: XPostArchetype
  label: string
  target: string
  structure: string
}> = [
  {
    value: "educational_thread",
    label: "Educational thread",
    target: "4-8% engagement · 10-20% bookmarks",
    structure: "Problem → step-by-step solution → result",
  },
  {
    value: "data_drop",
    label: "Data drop",
    target: "5-9% engagement · 8-15% shares",
    structure: "3-5 sourced data points → implication → takeaway",
  },
  {
    value: "contrarian_take",
    label: "Contrarian take",
    target: "6-12% engagement · 10-20% replies",
    structure: "Common belief → rebuttal → alternative → proof",
  },
  {
    value: "numbered_list",
    label: "Numbered list",
    target: "4-7% engagement · 12-20% saves",
    structure: "5-10 useful items → why each matters",
  },
  {
    value: "comparison",
    label: "Comparison post",
    target: "5-10% engagement",
    structure: "Approach A vs B → clear recommendation",
  },
  {
    value: "mistake_breakdown",
    label: "Mistake breakdown",
    target: "6-11% engagement · 10-18% saves",
    structure: "Mistakes → lessons → corrected approach → result",
  },
  {
    value: "opinion_framework",
    label: "Opinion framework",
    target: "4-8% engagement",
    structure: "Opinion → 3-5 supporting points → implication",
  },
]

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
  overrides: Partial<Pick<XAutomationRecord, "id" | "name">> = {}
): XAutomationRecord {
  const now = new Date().toISOString()
  return {
    id: overrides.id ?? `x-automation-${crypto.randomUUID()}`,
    name: overrides.name ?? "New X content engine",
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
    output: {
      platforms: ["x", "threads"],
      contentType: "thread",
      archetype: "educational_thread",
      singleLength: "standard",
      maxCharacters: 280,
      threadPostCount: { min: 8, max: 15 },
      articleWordCount: { min: 800, max: 1_200 },
    },
    generation: {
      model: "google/gemini-3.1-flash-lite",
      autoInferBrief: true,
      language: "English",
      voice: "lowercase, blunt, tactical, specific, zero fluff",
      hookPrompt:
        "Write a surprising, specific claim plus a promise or question. It must pass a three-second test.",
      setupPrompt:
        "Establish the pain, opportunity, or stakes in 1-2 compact sentences without repeating the hook.",
      contentPrompt:
        "Teach a useful framework with single-idea paragraphs, concrete steps, examples, and 1-2 memorable numbers when supported.",
      proofPrompt:
        "Add only verifiable proof from the provided source or supplied facts. If none exists, use a concrete example and clearly label it as an example.",
      curiosityGapPrompt:
        "Leave one useful open loop with a question, contrast, or next-step tease that invites a real response.",
      ctaPrompt:
        "Choose one low-friction action: bookmark, reply with a keyword, follow for the next part, or try the first step.",
      requireSourceAttribution: true,
    },
    media: {
      mode: "generate",
      count: 1,
      aspectRatio: "16:9",
      prompt:
        "Create a clean editorial visual that explains the core mechanism. No logos, fake UI, or decorative text.",
    },
    discovery: {
      enabled: true,
      sources: ["x", "tiktok", "instagram"],
      queryTemplates: ["{niche}", "{keyword} min_faves:100", "{pain_point}"],
      lookbackHours: 72,
      minimumViews: 10_000,
      minimumEngagementRate: 0.02,
      reactionMode: "quote",
      requireApproval: true,
    },
    benchmarks: phantomProfitBenchmarks,
    publishing: { integrations: [], autoPost: false },
    schedule: {
      timezone: "Asia/Singapore",
      posting_times: [
        { time: "9:00 AM", days: ["Mon", "Wed", "Fri"], enabled: true },
      ],
      paused: false,
      jitter_minutes: 10,
      min_gap_minutes: 180,
    },
  }
}

export function normalizeXAutomation(value: unknown): XAutomationRecord | null {
  if (!isRecord(value)) return null
  const id = clean(value.id)
  if (!id) return null
  const defaults = defaultXAutomation({
    id,
    name: clean(value.name) || undefined,
  })
  const niche = isRecord(value.niche) ? value.niche : {}
  const output = isRecord(value.output) ? value.output : {}
  const generation = isRecord(value.generation) ? value.generation : {}
  const media = isRecord(value.media) ? value.media : {}
  const discovery = isRecord(value.discovery) ? value.discovery : {}
  const publishing = isRecord(value.publishing) ? value.publishing : {}
  const schedule = isRecord(value.schedule) ? value.schedule : {}
  return {
    ...defaults,
    ...value,
    id,
    name: clean(value.name) || defaults.name,
    status: value.status === "live" ? "live" : "paused",
    niche: { ...defaults.niche, ...niche } as XAutomationRecord["niche"],
    output: { ...defaults.output, ...output } as XAutomationRecord["output"],
    generation: {
      ...defaults.generation,
      ...generation,
    } as XAutomationRecord["generation"],
    media: { ...defaults.media, ...media } as XAutomationRecord["media"],
    discovery: {
      ...defaults.discovery,
      ...discovery,
    } as XAutomationRecord["discovery"],
    benchmarks: Array.isArray(value.benchmarks)
      ? (value.benchmarks as XAutomationBenchmark[])
      : defaults.benchmarks,
    publishing: {
      ...defaults.publishing,
      ...publishing,
    } as XAutomationRecord["publishing"],
    schedule: { ...defaults.schedule, ...schedule } as AutomationSchedule,
    createdAt: clean(value.createdAt) || defaults.createdAt,
    updatedAt: clean(value.updatedAt) || defaults.updatedAt,
  }
}

export function characterLimitFor(length: XPostLength) {
  if (length === "short") return 140
  if (length === "long") return 4_000
  return 280
}

export function benchmarkXRun(input: {
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
  const cta = clampScore(
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
  const stages = [
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
  const benchmark = xPostArchetypes.find((item) => item.value === archetype)!
  const matchedBenchmark = closestCorpusBenchmark(archetype)
  if (overflowing.length)
    notes.push(`${overflowing.length} post(s) exceed the character limit.`)
  if (!countFit) notes.push("Educational threads benchmark best at 8-15 posts.")
  if (concreteSignals === 0)
    notes.push(
      "Add a supported number, example, or named mechanism for specificity."
    )
  if (cta < 80) notes.push("End with one explicit, low-friction action.")
  if (stageCompleteness < 100)
    notes.push("Complete setup, proof, curiosity gap, and CTA before posting.")
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
  }
  return clampScore(55 + checks[archetype].filter(Boolean).length * 15)
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
