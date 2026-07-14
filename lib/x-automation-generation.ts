import { clean, isRecord } from "@/lib/guards"
import { getOpenRouterApiKey, openRouterChatCompletion } from "@/lib/openrouter"
import {
  benchmarkXRun,
  phantomProfitBenchmarks,
  xPostArchetypes,
  type XAutomationRecord,
  type XAutomationRun,
  type XGeneratedPost,
  type XInferredContentBrief,
  type XPostArchetype,
  type XTrendCandidate,
} from "@/lib/x-automation"

const X_QUALITY_MODEL = "anthropic/claude-sonnet-4.5"

type GenerateInput = {
  automation: XAutomationRecord
  topic: string
  sourceCandidate?: XTrendCandidate
  apiKey?: string
  fetchImpl?: typeof fetch
  now?: Date
}

export async function generateXAutomationRun(
  input: GenerateInput
): Promise<XAutomationRun> {
  const topic =
    clean(input.topic) ||
    input.sourceCandidate?.text ||
    input.automation.niche.pillars[0]
  if (!topic) throw new Error("A topic is required")
  const apiKey = clean(input.apiKey) || getOpenRouterApiKey()
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
  const inferredBrief = input.automation.generation.autoInferBrief
    ? await inferContentBrief({
        automation: input.automation,
        topic,
        sourceCandidate: input.sourceCandidate,
        apiKey,
        fetchImpl: input.fetchImpl,
      })
    : configuredContentBrief(input.automation, topic)
  const shared = sharedPrompt(
    input.automation,
    topic,
    input.sourceCandidate,
    inferredBrief
  )

  // These calls stay intentionally separate so hooks, teaching quality, and
  // conversion intent can be tuned and benchmarked independently.
  const hookResult = await requestJson({
    apiKey,
    fetchImpl: input.fetchImpl,
    model: input.automation.generation.model,
    system: `${shared}\n\nYou are the hook writer only. ${input.automation.generation.hookPrompt}`,
    user: `Write 5 hook candidates, select the strongest, and return {"candidates":[...],"selected":"...","reason":"..."}.`,
  })
  const hook =
    clean(hookResult.selected) || clean(asStringArray(hookResult.candidates)[0])
  if (!hook) throw new Error("The hook model returned no usable hook")

  const setupResult = await requestJson({
    apiKey,
    fetchImpl: input.fetchImpl,
    model: input.automation.generation.model,
    system: `${shared}\n\nYou are the setup writer only. ${input.automation.generation.setupPrompt}`,
    user: `Write the setup that follows this hook. Return {"setup":"..."}.\n\nHook: ${hook}`,
  })
  const setup = clean(setupResult.setup)
  if (!setup) throw new Error("The setup model returned no usable setup")

  const contentResult = await requestJson({
    apiKey,
    fetchImpl: input.fetchImpl,
    model: input.automation.generation.model,
    system: `${shared}\n\nYou are the body writer only. ${input.automation.generation.contentPrompt}`,
    user: bodyRequest(input.automation, hook, setup),
  })
  const content = dedupeContentSections(
    bodyFrom(contentResult, input.automation.output.contentType),
    [hook, setup]
  ).slice(
    0,
    input.automation.output.contentType === "thread"
      ? Math.max(1, input.automation.output.threadPostCount.max - 5)
      : undefined
  )
  if (!content.length)
    throw new Error("The content model returned no usable body")

  const proofResult = await requestJson({
    apiKey,
    fetchImpl: input.fetchImpl,
    model: input.automation.generation.model,
    system: `${shared}\n\nYou are the proof editor only. ${input.automation.generation.proofPrompt}`,
    user: `Add one compact proof block for this draft in no more than ${input.automation.output.maxCharacters} characters. Do not invent results or imply hypothetical examples are real. Return {"proof":"..."}.\n\nHook: ${hook}\nSetup: ${setup}\nContent: ${content.join("\n\n")}`,
  })
  const proof = clean(proofResult.proof)
  if (!proof) throw new Error("The proof model returned no usable proof")

  const gapResult = await requestJson({
    apiKey,
    fetchImpl: input.fetchImpl,
    model: input.automation.generation.model,
    system: `${shared}\n\nYou are the curiosity-gap writer only. ${input.automation.generation.curiosityGapPrompt}`,
    user: `Write one compact open loop under ${input.automation.output.maxCharacters} characters that naturally follows this draft. Return {"curiosityGap":"..."}.\n\nHook: ${hook}\nSetup: ${setup}\nContent: ${content.join("\n\n")}\nProof: ${proof}`,
  })
  const curiosityGap = clean(
    gapResult.curiosityGap ?? gapResult.curiosity_gap ?? gapResult.gap
  )
  if (!curiosityGap)
    throw new Error("The curiosity-gap model returned no usable open loop")

  const ctaResult = await requestJson({
    apiKey,
    fetchImpl: input.fetchImpl,
    model: input.automation.generation.model,
    system: `${shared}\n\nYou are the CTA writer only. ${input.automation.generation.ctaPrompt}`,
    user: `Given this complete draft, write 4 CTA options and select one. The CTA must not repeat the curiosity gap. Return {"options":[...],"selected":"..."}.\n\nHook: ${hook}\nSetup: ${setup}\nContent: ${content.join("\n\n")}\nProof: ${proof}\nCuriosity gap: ${curiosityGap}`,
  })
  const cta =
    clean(ctaResult.selected) || clean(asStringArray(ctaResult.options)[0])

  const rawSingleText = [hook, setup, ...content, proof, curiosityGap, cta]
    .filter(Boolean)
    .join("\n\n")
  const fittedSingleText =
    input.automation.output.contentType === "single" &&
    rawSingleText.length > input.automation.output.maxCharacters
      ? await fitSinglePost({
          automation: input.automation,
          shared,
          apiKey,
          fetchImpl: input.fetchImpl,
          rawText: rawSingleText,
          hook,
          cta,
        })
      : undefined

  let posts = composePosts(input.automation, {
    hook,
    setup,
    content,
    proof,
    curiosityGap,
    cta,
    fittedSingleText,
  })
  const now = input.now ?? new Date()
  let hardBenchmark = benchmarkXRun({
    contentType: input.automation.output.contentType,
    archetype: inferredBrief.archetype,
    hook,
    setup,
    content,
    proof,
    curiosityGap,
    cta,
    posts,
    maxCharacters: input.automation.output.maxCharacters,
  })
  let benchmark = await benchmarkXRunWithAI({
    automation: input.automation,
    topic,
    posts,
    hardBenchmark,
    archetype: inferredBrief.archetype,
    apiKey,
    fetchImpl: input.fetchImpl,
  })
  const initialBenchmark = benchmark
  let revisionPasses = 0
  for (
    let pass = 0;
    pass < 2 &&
    input.automation.output.contentType !== "article" &&
    benchmark.evaluator === "ai" &&
    (benchmark.total < 85 || benchmark.verdict !== "ready");
    pass += 1
  ) {
    const revisedPosts = await revisePostsFromCritique({
      automation: input.automation,
      topic,
      brief: inferredBrief,
      posts,
      benchmark,
      apiKey,
      fetchImpl: input.fetchImpl,
    }).catch(() => null)
    if (!revisedPosts) break
    const revisedHardBenchmark = benchmarkXRun({
      contentType: input.automation.output.contentType,
      archetype: inferredBrief.archetype,
      hook,
      setup,
      content,
      proof,
      curiosityGap,
      cta,
      posts: revisedPosts,
      maxCharacters: input.automation.output.maxCharacters,
    })
    const revisedBenchmark = await benchmarkXRunWithAI({
      automation: input.automation,
      topic,
      posts: revisedPosts,
      hardBenchmark: revisedHardBenchmark,
      archetype: inferredBrief.archetype,
      apiKey,
      fetchImpl: input.fetchImpl,
    })
    if (
      revisedBenchmark.total <= benchmark.total ||
      revisedBenchmark.formatFit !== 100
    ) {
      break
    }
    posts = revisedPosts
    hardBenchmark = revisedHardBenchmark
    benchmark = revisedBenchmark
    revisionPasses += 1
  }
  if (revisionPasses > 0) {
    benchmark = {
      ...benchmark,
      revision: {
        applied: true,
        previousTotal: initialBenchmark.total,
        previousVerdict: initialBenchmark.verdict,
        passes: revisionPasses,
      },
    }
  }
  const articleTitle =
    clean(contentResult.title) ||
    (input.automation.output.contentType === "article" ? hook : undefined)
  const articleBody =
    input.automation.output.contentType === "article"
      ? [hook, setup, ...content, proof, curiosityGap, cta]
          .filter(Boolean)
          .join("\n\n")
      : undefined

  return {
    id: `x-run-${crypto.randomUUID()}`,
    automationId: input.automation.id,
    automationName: input.automation.name,
    topic,
    archetype: inferredBrief.archetype,
    inferredBrief,
    contentType: input.automation.output.contentType,
    platforms: input.automation.output.platforms,
    reactionMode: input.sourceCandidate
      ? input.automation.discovery.reactionMode
      : "none",
    sourceCandidate: input.sourceCandidate,
    hook,
    setup,
    content,
    proof,
    curiosityGap,
    cta,
    posts,
    articleTitle,
    articleBody,
    imagePrompt:
      input.automation.media.mode === "generate"
        ? `${input.automation.media.prompt}\n\nTopic: ${topic}\nCore idea: ${hook}`
        : undefined,
    imageUrls: [],
    benchmark,
    status: "draft",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

async function revisePostsFromCritique(input: {
  automation: XAutomationRecord
  topic: string
  brief: XInferredContentBrief
  posts: XGeneratedPost[]
  benchmark: XAutomationRun["benchmark"]
  apiKey: string
  fetchImpl?: typeof fetch
}) {
  let previousInvalid = ""
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await requestJson({
      apiKey: input.apiKey,
      fetchImpl: input.fetchImpl,
      model: X_QUALITY_MODEL,
      system: [
        "You are the final corrective editor for X/Threads.",
        "Resolve every factual risk and concrete editing note from an independent critic.",
        "Treat each factual-risk item as authoritative: if the topic or attributed source does not supply evidence for that claim, delete the claim instead of restating it with softer wording.",
        "Preserve the useful idea, but remove unsupported causality, invented precision, generic AI phrasing, repetition, and engagement bait.",
        "Every post must be a complete thought. Never use an ellipsis to hide clipped text.",
        "Keep the same number and order of posts and stay within the exact character limit.",
      ].join(" "),
      user: `Topic: ${input.topic}
Inferred brief: ${JSON.stringify(input.brief)}
Character limit per post: ${input.automation.output.maxCharacters}
Original final posts: ${JSON.stringify(input.posts.map((post) => post.text))}
Critic verdict: ${input.benchmark.verdict}
Critic summary: ${input.benchmark.summary}
Factual risks: ${JSON.stringify(input.benchmark.factualRisks ?? [])}
Editing actions: ${JSON.stringify(input.benchmark.notes)}
${previousInvalid ? `Previous revision was invalid: ${previousInvalid}` : ""}

Return {"posts":["complete revised post 1", ...]}. Return exactly ${input.posts.length} posts.`,
    })
    const revisions = asStringArray(result.posts)
    const invalidIndex = revisions.findIndex(
      (text) =>
        !text ||
        text.length > input.automation.output.maxCharacters ||
        text.includes("…")
    )
    if (revisions.length === input.posts.length && invalidIndex === -1) {
      return input.posts.map((post, index) => ({
        ...post,
        text: revisions[index],
        characterCount: revisions[index].length,
      }))
    }
    previousInvalid = `expected ${input.posts.length} posts under ${input.automation.output.maxCharacters} characters; received lengths ${revisions.map((text) => text.length).join(", ") || "none"}`
  }
  return null
}

async function benchmarkXRunWithAI(input: {
  automation: XAutomationRecord
  topic: string
  posts: XGeneratedPost[]
  hardBenchmark: XAutomationRun["benchmark"]
  archetype: XPostArchetype
  apiKey: string
  fetchImpl?: typeof fetch
}): Promise<XAutomationRun["benchmark"]> {
  const corpus = (
    input.automation.benchmarks.length
      ? input.automation.benchmarks
      : phantomProfitBenchmarks
  ).map((benchmark) => ({
    id: benchmark.id,
    archetype: benchmark.archetype,
    media: benchmark.media,
    text: benchmark.text,
    metrics: benchmark.metrics,
    notes: benchmark.notes,
  }))
  try {
    const result = await requestJson({
      apiKey: input.apiKey,
      fetchImpl: input.fetchImpl,
      model: X_QUALITY_MODEL,
      system: [
        "You are a skeptical senior social editor, benchmark analyst, and fact-checking critic.",
        "Judge the exact final posts, not the generation instructions or hidden draft stages.",
        "Do not reward unsupported numbers merely for being specific. Penalize invented facts, causal overclaims, contradictions, generic AI phrasing, clipped endings, weak native-feed voice, and CTAs absent from the final text.",
        "Treat the supplied benchmark posts as style and performance references, not factual evidence.",
        "A score above 85 means publishable with only cosmetic edits. Any material factual risk must cap total at 69 and produce revise or reject.",
      ].join(" "),
      user: `Evaluate this ${input.automation.output.contentType} for X/Threads against the benchmark corpus.

Topic: ${input.topic}
Niche: ${input.automation.niche.label}
Archetype: ${input.archetype}
Final posts: ${JSON.stringify(input.posts.map((post) => post.text))}
Objective checks: ${JSON.stringify({
        formatFit: input.hardBenchmark.formatFit,
        stageCompleteness: input.hardBenchmark.stageCompleteness,
        characterCounts: input.posts.map((post) => post.characterCount),
        configuredLimit: input.automation.output.maxCharacters,
      })}
Benchmark corpus: ${JSON.stringify(corpus)}

Return one JSON object with integer scores from 0-100 for total, hook, specificity, readability, cta, archetypeFit, nativeVoice, factualAccuracy, and benchmarkFit; verdict as ready, revise, or reject; confidence from 0-100; summary as one concise sentence; factualRisks as an array; notes as 2-5 concrete editing actions; and matchedBenchmarkId as one corpus id.`,
    })
    const matchedBenchmarkId = clean(result.matchedBenchmarkId)
    const matchedBenchmark = corpus.find(
      (benchmark) => benchmark.id === matchedBenchmarkId
    )
    const factualRisks = asStringArray(result.factualRisks)
    const verdict =
      result.verdict === "ready" ||
      result.verdict === "revise" ||
      result.verdict === "reject"
        ? result.verdict
        : factualRisks.length
          ? "revise"
          : "ready"
    return {
      total: scoreFrom(result.total, input.hardBenchmark.total),
      hook: scoreFrom(result.hook, input.hardBenchmark.hook),
      specificity: scoreFrom(
        result.specificity,
        input.hardBenchmark.specificity
      ),
      readability: scoreFrom(
        result.readability,
        input.hardBenchmark.readability
      ),
      cta: scoreFrom(result.cta, input.hardBenchmark.cta),
      formatFit: input.hardBenchmark.formatFit,
      stageCompleteness: input.hardBenchmark.stageCompleteness,
      archetypeFit: scoreFrom(
        result.archetypeFit,
        input.hardBenchmark.archetypeFit
      ),
      nativeVoice: scoreFrom(result.nativeVoice, 50),
      factualAccuracy: scoreFrom(result.factualAccuracy, 50),
      benchmarkFit: scoreFrom(result.benchmarkFit, 50),
      evaluator: "ai",
      evaluatorModel: X_QUALITY_MODEL,
      verdict,
      confidence: scoreFrom(result.confidence, 50),
      summary: clean(result.summary),
      factualRisks,
      comparison: {
        ...input.hardBenchmark.comparison,
        matchedBenchmarkId: matchedBenchmark?.id,
        matchedBenchmarkLabel: matchedBenchmark
          ? `${matchedBenchmark.archetype} · ${matchedBenchmark.media}`
          : input.hardBenchmark.comparison.matchedBenchmarkLabel,
      },
      notes: asStringArray(result.notes),
    }
  } catch (error) {
    return {
      ...input.hardBenchmark,
      evaluator: "heuristic",
      verdict: "revise",
      summary:
        "AI quality review was unavailable; this score covers objective checks only.",
      notes: [
        ...input.hardBenchmark.notes,
        error instanceof Error
          ? `AI critic unavailable: ${error.message}`
          : "AI critic unavailable.",
      ],
    }
  }
}

async function inferContentBrief(input: {
  automation: XAutomationRecord
  topic: string
  sourceCandidate?: XTrendCandidate
  apiKey: string
  fetchImpl?: typeof fetch
}): Promise<XInferredContentBrief> {
  const result = await requestJson({
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    model: input.automation.generation.model,
    system:
      "You are the strategy planner for a native X/Threads content engine. Infer a focused runtime brief from the niche, topic, output container, and optional source. Do not import assumptions from unrelated default profiles. Prefer a specific audience and angle over generic creator language. Do not introduce numeric, scientific, historical, psychological, or causal claims that were not supplied in the topic or source; frame anything needing verification as a question for the writer, not as a fact. Safety exclusions are mandatory.",
    user: `Niche: ${input.automation.niche.label}
Topic: ${input.topic}
Content type: ${input.automation.output.contentType}
Optional source: ${input.sourceCandidate ? JSON.stringify({ url: input.sourceCandidate.url, text: input.sourceCandidate.text }) : "none"}

Return {"niche":"...","audience":"...","promise":"...","angle":"...","pillars":["..."],"keywords":["..."],"painPoint":"...","voice":"...","archetype":"educational_thread|data_drop|contrarian_take|numbered_list|comparison|mistake_breakdown|opinion_framework","hookDirection":"...","contentDirection":"...","ctaDirection":"...","exclusions":["..."]}. Infer only what improves this specific post.`,
  })
  return {
    niche: clean(result.niche) || input.automation.niche.label,
    audience:
      clean(result.audience) || "people actively interested in this topic",
    promise: clean(result.promise) || "deliver one clear, useful takeaway",
    angle: clean(result.angle) || input.topic,
    pillars: asStringArray(result.pillars),
    keywords: asStringArray(result.keywords),
    painPoint: clean(result.painPoint),
    voice: clean(result.voice) || "native, concise, specific, zero fluff",
    archetype: allowedArchetype(
      result.archetype,
      input.automation.output.archetype
    ),
    hookDirection: clean(result.hookDirection),
    contentDirection: clean(result.contentDirection),
    ctaDirection: clean(result.ctaDirection),
    exclusions: [
      ...new Set([
        ...input.automation.niche.excludedTopics,
        ...asStringArray(result.exclusions),
        "invented facts, studies, metrics, testimonials, or personal experience",
        "medical, legal, or financial advice presented without qualification",
      ]),
    ],
  }
}

function configuredContentBrief(
  automation: XAutomationRecord,
  topic: string
): XInferredContentBrief {
  return {
    niche: automation.niche.label,
    audience: automation.niche.audience,
    promise: automation.niche.promise,
    angle: topic,
    pillars: automation.niche.pillars,
    keywords: automation.niche.keywords,
    painPoint: automation.niche.painPoints[0] ?? "",
    voice: automation.generation.voice,
    archetype: automation.output.archetype,
    hookDirection: automation.generation.hookPrompt,
    contentDirection: automation.generation.contentPrompt,
    ctaDirection: automation.generation.ctaPrompt,
    exclusions: automation.niche.excludedTopics,
  }
}

function allowedArchetype(value: unknown, fallback: XPostArchetype) {
  const candidate = clean(value) as XPostArchetype
  return xPostArchetypes.some((item) => item.value === candidate)
    ? candidate
    : fallback
}

function scoreFrom(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(100, Math.round(parsed)))
    : fallback
}

function sharedPrompt(
  automation: XAutomationRecord,
  topic: string,
  source: XTrendCandidate | undefined,
  brief: XInferredContentBrief
) {
  return [
    `Write native social content for ${automation.output.platforms.join(" and ")}.`,
    `Niche: ${brief.niche}.`,
    `Audience: ${brief.audience}.`,
    `Account promise: ${brief.promise}.`,
    `Specific angle: ${brief.angle}.`,
    `Topic: ${topic}.`,
    `Post archetype: ${brief.archetype}.`,
    `Voice: ${brief.voice}. Language: ${automation.generation.language}.`,
    `Relevant pillars: ${brief.pillars.join(", ")}.`,
    `Relevant keywords: ${brief.keywords.join(", ")}.`,
    brief.painPoint ? `Primary audience pain: ${brief.painPoint}.` : "",
    brief.hookDirection ? `Hook direction: ${brief.hookDirection}.` : "",
    brief.contentDirection
      ? `Content direction: ${brief.contentDirection}.`
      : "",
    brief.ctaDirection ? `CTA direction: ${brief.ctaDirection}.` : "",
    `Avoid: ${brief.exclusions.join(", ")}.`,
    source
      ? `React to this attributed source without copying its wording: ${source.url}\nSource text: ${source.text}`
      : "",
    "Never invent metrics, testimonials, personal experience, or study results. Preserve source attribution for reactions.",
  ]
    .filter(Boolean)
    .join("\n")
}

function bodyRequest(
  automation: XAutomationRecord,
  hook: string,
  setup: string
) {
  if (automation.output.contentType === "single") {
    return `Hook: ${hook}\nSetup: ${setup}\nWrite the substance for one post. Return {"sections":["..."]}. Leave room for proof, curiosity gap, and CTA. The final composed post must fit ${automation.output.maxCharacters} characters.`
  }
  if (automation.output.contentType === "article") {
    return `Hook/title direction: ${hook}\nSetup: ${setup}\nWrite an article with ${automation.output.articleWordCount.min}-${automation.output.articleWordCount.max} words. Return {"title":"...","sections":["paragraph or section", ...]}. Leave the ending open for proof, curiosity gap, and CTA.`
  }
  return `Hook: ${hook}\nSetup: ${setup}\nWrite ${Math.max(1, automation.output.threadPostCount.min - 5)}-${Math.max(1, automation.output.threadPostCount.max - 5)} framework posts. Each must stand alone, progress the argument, and stay under ${automation.output.maxCharacters} characters. Proof, curiosity gap, and CTA are written separately. Return {"sections":["framework post 1", "framework post 2", ...]}.`
}

function composePosts(
  automation: XAutomationRecord,
  input: {
    hook: string
    setup: string
    content: string[]
    proof: string
    curiosityGap: string
    cta: string
    fittedSingleText?: string
  }
): XGeneratedPost[] {
  if (automation.output.contentType === "single") {
    const text =
      clean(input.fittedSingleText) ||
      [
        input.hook,
        input.setup,
        ...input.content,
        input.proof,
        input.curiosityGap,
        input.cta,
      ]
        .filter(Boolean)
        .join("\n\n")
    return [
      { id: "post-1", text, characterCount: text.length, role: "content" },
    ]
  }
  if (automation.output.contentType === "article") {
    const teaser = [input.hook, input.cta].filter(Boolean).join("\n\n")
    return [
      {
        id: "post-1",
        text: teaser,
        characterCount: teaser.length,
        role: "hook",
      },
    ]
  }
  const staged = [
    { text: input.hook, role: "hook" as const },
    { text: input.setup, role: "setup" as const },
    ...input.content.map((text) => ({ text, role: "content" as const })),
    { text: input.proof, role: "proof" as const },
    { text: input.curiosityGap, role: "gap" as const },
    ...(input.cta ? [{ text: input.cta, role: "cta" as const }] : []),
  ].map((stage) => ({
    text: truncateAtWord(stage.text, automation.output.maxCharacters),
    role: stage.role,
  }))
  return staged.map((post, index) => ({
    id: `post-${index + 1}`,
    text: post.text,
    characterCount: post.text.length,
    role: post.role,
  }))
}

async function fitSinglePost(input: {
  automation: XAutomationRecord
  shared: string
  apiKey: string
  fetchImpl?: typeof fetch
  rawText: string
  hook: string
  cta: string
}) {
  let edited = ""
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await requestJson({
      apiKey: input.apiKey,
      fetchImpl: input.fetchImpl,
      model: input.automation.generation.model,
      system: `${input.shared}\n\nYou are the final single-post editor. Preserve the strongest hook, one concrete mechanism or example, and one low-friction CTA. Remove repetition. Use complete sentences only and never end a thought with an ellipsis.`,
      user: `Compress this draft into one native post of at most ${input.automation.output.maxCharacters} characters including spaces. End with this exact CTA: ${input.cta}. Return {"text":"..."}.${attempt > 0 ? ` Your previous attempt was ${edited.length} characters and invalid; make this version materially shorter.` : ""}\n\n${attempt > 0 ? edited : input.rawText}`,
    })
    edited = clean(result.text)
    if (
      edited.length <= input.automation.output.maxCharacters &&
      !edited.includes("…") &&
      normalizedText(edited).endsWith(normalizedText(input.cta))
    ) {
      return edited
    }
  }
  const bodyLimit = Math.max(
    1,
    input.automation.output.maxCharacters - input.cta.length - 2
  )
  const body = normalizedText(edited).endsWith(normalizedText(input.cta))
    ? edited.slice(0, Math.max(0, edited.length - input.cta.length)).trim()
    : edited
  const completeBody = completeSentencesWithin(body, bodyLimit)
  const fallbackBody =
    completeBody || completeSentencesWithin(input.hook, bodyLimit)
  return [fallbackBody, input.cta].filter(Boolean).join("\n\n")
}

function completeSentencesWithin(value: string, limit: number) {
  const sentences = clean(value).match(/[^.!?]+[.!?]+/g) ?? []
  let result = ""
  for (const sentence of sentences.map(clean)) {
    const candidate = result ? `${result} ${sentence}` : sentence
    if (candidate.length > limit) break
    result = candidate
  }
  return result
}

function dedupeContentSections(sections: string[], priorStages: string[]) {
  const seen = new Set(priorStages.map(normalizedText))
  return sections.filter((section) => {
    const normalized = normalizedText(section)
    if (!normalized || seen.has(normalized)) return false
    if (
      [...seen].some(
        (prior) =>
          prior.length >= 40 &&
          normalized.length >= 40 &&
          (prior.startsWith(normalized.slice(0, 40)) ||
            normalized.startsWith(prior.slice(0, 40)))
      )
    ) {
      return false
    }
    seen.add(normalized)
    return true
  })
}

function normalizedText(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function truncateAtWord(value: string, limit: number) {
  if (value.length <= limit) return value
  const sliced = value.slice(0, Math.max(0, limit - 1))
  const boundary = sliced.lastIndexOf(" ")
  return `${sliced.slice(0, boundary > limit * 0.7 ? boundary : sliced.length).trim()}…`
}

function archetypeInstruction(automation: XAutomationRecord) {
  const archetype = xPostArchetypes.find(
    (item) => item.value === automation.output.archetype
  )
  return archetype
    ? `${archetype.label}. Required structure: ${archetype.structure}`
    : automation.output.archetype
}

async function requestJson(input: {
  apiKey: string
  model: string
  system: string
  user: string
  fetchImpl?: typeof fetch
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await openRouterChatCompletion({
      apiKey: input.apiKey,
      model: input.model,
      fetchImpl: input.fetchImpl,
      messages: [
        { role: "system", content: input.system },
        {
          role: "user",
          content:
            attempt === 0
              ? input.user
              : `${input.user}\n\nReturn exactly one valid JSON object. Do not use Markdown fences or add commentary.`,
        },
      ],
      responseFormat: { type: "json_object" },
      timeoutMs: 90_000,
    })
    if (!result.ok)
      throw new Error(
        result.payload.error?.message || `OpenRouter failed (${result.status})`
      )
    const raw = result.payload.choices?.[0]?.message?.content
    const text = typeof raw === "string" ? raw : ""
    const unfenced = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim()
    const objectStart = unfenced.indexOf("{")
    const objectEnd = unfenced.lastIndexOf("}")
    const candidate =
      objectStart >= 0 && objectEnd > objectStart
        ? unfenced.slice(objectStart, objectEnd + 1)
        : unfenced
    try {
      const parsed = JSON.parse(candidate)
      if (isRecord(parsed)) return parsed
    } catch {
      // Retry once because some OpenRouter models occasionally wrap or truncate JSON.
    }
  }
  throw new Error("The model returned invalid JSON after one retry")
}

function bodyFrom(
  value: Record<string, unknown>,
  contentType: XAutomationRecord["output"]["contentType"]
) {
  const sections = asStringArray(
    value.sections ?? value.posts ?? value.paragraphs
  )
  if (sections.length) return sections
  const body = clean(value.body)
  return body ? (contentType === "article" ? body.split(/\n\n+/) : [body]) : []
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : []
}
