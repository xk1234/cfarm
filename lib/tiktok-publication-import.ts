import { clean, isRecord } from "@/lib/guards"
import {
  listAutomationRuns,
  markAutomationRunPublished,
  upsertRecoveredAutomationRun,
  type AutomationRunRecord,
} from "@/lib/automation-runner"
import { getAutomationRecord, patchAutomationRecord } from "@/lib/automations"
import {
  automationHookId,
  automationHookItems,
  schemaWithAutomationHookItems,
} from "@/lib/realfarm-automation"
import {
  linkPublishedOutput,
  samePublicationProvider,
} from "@/lib/manual-publication-linking"
import { parseManualPublicationUrl } from "@/lib/manual-publication"
import {
  normalizePostFastIntegration,
  postfastRequest,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import { listPostFastPostRecords } from "@/lib/postfast-posts"
import { getOpenRouterApiKey, openRouterJson } from "@/lib/openrouter"
import { openRouterModelForUseCase } from "@/lib/realfarm-generation-model-registry"
import {
  createSlideshowResultRecord,
  defaultSlideshowSettings,
} from "@/lib/slideshows"

const DEFAULT_ACTOR = "maximedupre/tiktok-slideshow-downloader"
const APIFY_API = "https://api.apify.com/v2"
const MAX_URLS = 20
const MAX_PHOTOS_PER_URL = 20

export type TikTokImportStatus =
  "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTED" | "TIMED-OUT"

export type TikTokImportPhoto = {
  index: number
  sourceImageUrl: string
  downloadUrl: string
}

export type TikTokImportedPost = {
  id: string
  url: string
  authorUsername: string
  caption: string
  publishedAt: string
  photoCount: number
  photos: TikTokImportPhoto[]
  hookText?: string
}

export type TikTokMatchCandidate = {
  runId: string
  slideshowId: string
  title: string
  hook: string
  caption: string
  createdAt: string
  slideCount: number
  score: number
  confidence: "high" | "medium" | "low"
  evidence: string[]
}

export type TikTokPostMatch = {
  post: TikTokImportedPost
  candidates: TikTokMatchCandidate[]
  recommendedRunId?: string
  alreadyLinked?: {
    sourceId: string
    releaseUrl?: string
    publishedAt?: string
  }
}

export type TikTokImportPreview = {
  operationId: string
  status: TikTokImportStatus
  statusMessage?: string
  posts?: TikTokPostMatch[]
}

type ApifyRun = {
  id?: unknown
  actId?: unknown
  status?: unknown
  statusMessage?: unknown
  defaultDatasetId?: unknown
}

type DatasetItem = {
  videoId?: unknown
  requestedUrl?: unknown
  authorUsername?: unknown
  caption?: unknown
  photoIndex?: unknown
  photoCount?: unknown
  sourceImageUrl?: unknown
  downloadUrl?: unknown
}

export async function startTikTokPublicationImport(urls: string[]) {
  const normalizedUrls = normalizeTikTokUrls(urls)
  const actor = apifyActor()
  const payload = await apifyJson<{ data?: ApifyRun }>(
    `/acts/${encodeURIComponent(actor.replace("/", "~"))}/runs`,
    {
      method: "POST",
      body: {
        slideshowUrls: normalizedUrls.map((url) => ({ url })),
        maxItems: Math.min(
          normalizedUrls.length * MAX_PHOTOS_PER_URL,
          MAX_URLS * MAX_PHOTOS_PER_URL
        ),
      },
    }
  )
  const operationId = clean(payload.data?.id)
  if (!operationId) throw new Error("Apify did not return an import operation")
  return {
    operationId,
    status: normalizeImportStatus(payload.data?.status),
  }
}

export async function inspectTikTokPublicationImport(input: {
  operationId: string
  automationId: string
}): Promise<TikTokImportPreview> {
  const automation = await requireAutomation(input.automationId)
  const runPayload = await apifyJson<{ data?: ApifyRun }>(
    `/actor-runs/${encodeURIComponent(clean(input.operationId))}`
  )
  const run = runPayload.data ?? {}
  await assertExpectedActor(run)
  const status = normalizeImportStatus(run.status)
  const base = {
    operationId: clean(input.operationId),
    status,
    ...(clean(run.statusMessage)
      ? { statusMessage: clean(run.statusMessage) }
      : {}),
  }
  if (status !== "SUCCEEDED") return base

  const datasetId = clean(run.defaultDatasetId)
  if (!datasetId) throw new Error("The TikTok import has no result dataset")
  const posts = await readTikTokPosts(datasetId)
  const [runs, publications] = await Promise.all([
    listAutomationRuns({
      automationId: automation.id,
      limit: 100,
      postRecords: [],
    }),
    listPostFastPostRecords().catch(() => []),
  ])
  const hydratedPosts = await Promise.all(
    posts.map(async (post) => ({
      ...post,
      hookText: await extractTikTokHook(post).catch(() => undefined),
    }))
  )

  return {
    ...base,
    posts: hydratedPosts.map((post) => {
      const linked = publications.find(
        (publication) =>
          samePublicationProvider(publication.provider, "tiktok") &&
          publication.externalPostId === post.id
      )
      const candidates = runs
        .flatMap((run) => {
          const candidate = candidateForPost(post, run)
          return candidate ? [candidate] : []
        })
        .sort((left, right) => right.score - left.score)
        .slice(0, 5)
      const recommended = recommendedCandidate(candidates)
      return {
        post,
        candidates,
        ...(recommended ? { recommendedRunId: recommended.runId } : {}),
        ...(linked
          ? {
              alreadyLinked: {
                sourceId: linked.sourceId,
                releaseUrl: linked.releaseUrl,
                publishedAt: linked.publishedAt,
              },
            }
          : {}),
      }
    }),
  }
}

export async function linkTikTokPublicationImport(input: {
  operationId: string
  automationId: string
  integrationId: string
  selections: Array<{
    postId: string
    runId?: string
    recover?: boolean
  }>
}) {
  const automation = await requireAutomation(input.automationId)
  const integration = await requireTikTokIntegration(input.integrationId)
  const preview = await inspectTikTokPublicationImport({
    operationId: input.operationId,
    automationId: automation.id,
  })
  if (preview.status !== "SUCCEEDED" || !preview.posts) {
    throw new Error("The TikTok import has not finished")
  }

  const results = []
  for (const selection of input.selections) {
    const match = preview.posts.find(
      (item) => item.post.id === clean(selection.postId)
    )
    if (!match)
      throw new Error(`TikTok post ${selection.postId} was not imported`)
    if (match.alreadyLinked) {
      results.push({
        postId: match.post.id,
        sourceId: match.alreadyLinked.sourceId,
        releaseUrl: match.alreadyLinked.releaseUrl ?? match.post.url,
        publishedAt: match.alreadyLinked.publishedAt ?? match.post.publishedAt,
        alreadyLinked: true,
      })
      continue
    }

    const run = selection.recover
      ? await recoverTikTokPost({ automation, post: match.post })
      : await selectedRun({
          automationId: automation.id,
          runId: clean(selection.runId),
        })
    const historicalRun = await ensureHistoricalHook(run)
    if (!historicalRun.slideshowId) {
      throw new Error(`Run ${historicalRun.id} has no slideshow output`)
    }
    const publication = await linkPublishedOutput({
      sourceType: "slideshow",
      sourceId: historicalRun.slideshowId,
      integrationId: integration.integration_id,
      provider: integration.provider,
      releaseUrl: match.post.url,
      publishedAt: match.post.publishedAt,
      content:
        match.post.caption ||
        [historicalRun.plan.caption, historicalRun.plan.hashtags]
          .filter(Boolean)
          .join("\n\n"),
    })
    await markAutomationRunPublished({
      slideshowId: historicalRun.slideshowId,
      runId: historicalRun.id,
      publishedAt: new Date(match.post.publishedAt),
    })
    results.push({
      postId: match.post.id,
      runId: historicalRun.id,
      slideshowId: historicalRun.slideshowId,
      sourceId: publication.sourceId,
      releaseUrl: publication.releaseUrl ?? match.post.url,
      publishedAt: publication.publishedAt ?? match.post.publishedAt,
      recovered: Boolean(selection.recover),
    })
  }
  return results
}

export function normalizeTikTokUrls(urls: string[]) {
  const supplied = [...new Set(urls.map(clean).filter(Boolean))]
  if (supplied.length === 0)
    throw new Error("Add at least one TikTok photo URL")
  if (supplied.length > MAX_URLS) {
    throw new Error(`Import at most ${MAX_URLS} TikTok posts at once`)
  }
  const canonical = supplied.map((url) => {
    const parsed = parseManualPublicationUrl({ url, provider: "tiktok" })
    if (!/\/photo\/\d+$/i.test(new URL(parsed.releaseUrl).pathname)) {
      throw new Error("Only TikTok photo slideshow URLs can be imported")
    }
    return parsed.releaseUrl
  })
  return [...new Set(canonical)]
}

export function candidateForPost(
  post: Pick<
    TikTokImportedPost,
    "caption" | "hookText" | "photoCount" | "publishedAt"
  >,
  run: AutomationRunRecord
): TikTokMatchCandidate | null {
  if (run.status !== "succeeded" || !run.slideshowId) return null
  const captionScore = tokenSimilarity(post.caption, run.plan.caption)
  const hookScore = tokenSimilarity(
    post.hookText ?? post.caption,
    [run.plan.hook, run.plan.title].filter(Boolean).join(" ")
  )
  const slideCount = run.renderedSlides?.length || run.plan.slides.length
  const countScore =
    post.photoCount === slideCount
      ? 1
      : Math.max(0, 1 - Math.abs(post.photoCount - slideCount) / 4)
  const timeDifference = Math.abs(
    Date.parse(post.publishedAt) - Date.parse(run.createdAt)
  )
  const timeScore = Number.isFinite(timeDifference)
    ? Math.max(0, 1 - timeDifference / (72 * 60 * 60 * 1000))
    : 0
  const score = roundScore(
    captionScore * 0.45 + hookScore * 0.35 + countScore * 0.1 + timeScore * 0.1
  )
  const evidence = [
    captionScore >= 0.7 ? "Caption closely matches" : "Caption differs",
    hookScore >= 0.7 ? "Hook text closely matches" : "Hook match is weak",
    post.photoCount === slideCount
      ? `${slideCount} slides on both posts`
      : `${post.photoCount} TikTok photos and ${slideCount} generated slides`,
    timeScore >= 0.75
      ? "Generated close to publication time"
      : "Generation time is farther from publication",
  ]
  return {
    runId: run.id,
    slideshowId: run.slideshowId,
    title: run.plan.title,
    hook: run.plan.hook,
    caption: run.plan.caption,
    createdAt: run.createdAt,
    slideCount,
    score,
    confidence: score >= 0.72 ? "high" : score >= 0.45 ? "medium" : "low",
    evidence,
  }
}

function recommendedCandidate(candidates: TikTokMatchCandidate[]) {
  const first = candidates[0]
  const second = candidates[1]
  if (!first || first.score < 0.45) return undefined
  if (second && first.score - second.score < 0.08 && first.score < 0.72) {
    return undefined
  }
  return first
}

async function recoverTikTokPost(input: {
  automation: NonNullable<Awaited<ReturnType<typeof getAutomationRecord>>>
  post: TikTokImportedPost
}) {
  const runId = `automation-run-tiktok-${input.post.id}`
  const existing = (
    await listAutomationRuns({
      automationId: input.automation.id,
      limit: 100,
      postRecords: [],
    })
  ).find((run) => run.id === runId)
  if (existing) return existing

  const slideTexts = await extractTikTokSlideTexts(input.post)
  const hook =
    clean(slideTexts[0]) ||
    clean(input.post.hookText) ||
    captionBody(input.post.caption)
  const hashtags =
    input.post.caption.match(/#[\p{L}\p{N}_-]+/gu)?.join(" ") ?? ""
  const title = titleFromHook(hook)
  const createdAt = input.post.publishedAt
  const { slideshow } = await createSlideshowResultRecord({
    automationId: input.automation.id,
    runId,
    title,
    caption: captionBody(input.post.caption),
    hashtags,
    prompt: "Recovered from a verified published TikTok slideshow.",
    slideshow_type: "recovered_tiktok",
    image_collection: "",
    createdAt,
    settings: {
      ...defaultSlideshowSettings(),
      export_as_video: false,
      aspect_ratio: "9:16",
    },
    images: input.post.photos.map((photo, index) => ({
      id: `slide-${index + 1}`,
      image_url: photo.sourceImageUrl,
      source_image_url: photo.sourceImageUrl,
      overlay: false,
      textItems: [],
    })),
  })
  const slides = slideshow.output_images.map((imageUrl, index) => ({
    id: `slide-${index + 1}`,
    role:
      index === 0
        ? ("hook" as const)
        : index === slideshow.output_images.length - 1
          ? ("cta" as const)
          : ("content" as const),
    imageUrl,
    imageKey: `tiktok:${input.post.id}:${index + 1}`,
    imageCaption: `Published TikTok slide ${index + 1}`,
    text: clean(slideTexts[index]),
    textPlacement: "center" as const,
    aspectRatio: "9:16",
    overlay: false,
    displayText: false,
    textItems: [],
  }))
  const run: AutomationRunRecord = {
    id: runId,
    automationId: input.automation.id,
    automationTitle: input.automation.name,
    scheduledFor: createdAt,
    generationSource: "manual",
    status: "succeeded",
    slideshowId: slideshow.id,
    outputImages: slideshow.output_images,
    outputDir: slideshow.output_dir,
    thumbnailUrl: slideshow.output_images[0],
    renderedSlides: slides.map((slide) => ({
      id: slide.id,
      role: slide.role,
      imageUrl: slide.imageUrl,
      sourceImageUrl: slide.imageUrl,
      imageCaption: slide.imageCaption,
      text: slide.text,
      durationMs: 4000,
      aspectRatio: "9:16",
    })),
    plan: {
      title,
      caption: captionBody(input.post.caption),
      hashtags,
      hook,
      hookId: automationHookId(hook),
      imageCollectionIds: [],
      slides,
      slideCount: { mode: "static", count: slides.length },
      publishType: "slideshow",
      autoMusic: false,
      autoPost: false,
      language: "English",
    },
    createdAt,
    updatedAt: new Date().toISOString(),
  }
  return upsertRecoveredAutomationRun(run)
}

async function ensureHistoricalHook(run: AutomationRunRecord) {
  const automation = await requireAutomation(run.automationId)
  const items = automationHookItems(automation.schema)
  const sourceText = clean(run.plan.hookTemplate) || clean(run.plan.hook)
  if (!sourceText) return run
  const normalized = normalizeText(sourceText)
  const existing = items.find((item) => normalizeText(item.text) === normalized)
  const hookId = existing?.id ?? automationHookId(sourceText)
  if (!existing) {
    await patchAutomationRecord({
      id: automation.id,
      schema: schemaWithAutomationHookItems(automation.schema, [
        ...items,
        {
          id: hookId,
          text: sourceText,
          enabled: false,
          createdAt: run.createdAt,
        },
      ]),
    })
  }
  if (run.plan.hookId === hookId) return run
  const updated = { ...run, plan: { ...run.plan, hookId } }
  await upsertRecoveredAutomationRun(updated)
  return updated
}

async function selectedRun(input: { automationId: string; runId: string }) {
  if (!input.runId) {
    throw new Error("Choose a generated slideshow or restore the TikTok post")
  }
  const run = (
    await listAutomationRuns({
      automationId: input.automationId,
      limit: 100,
      postRecords: [],
    })
  ).find((item) => item.id === input.runId)
  if (!run) throw new Error("The selected generated slideshow was not found")
  return run
}

async function extractTikTokHook(post: TikTokImportedPost) {
  const text = await extractTikTokSlideTexts({
    ...post,
    photos: post.photos.slice(0, 1),
  })
  return clean(text[0]) || undefined
}

async function extractTikTokSlideTexts(post: TikTokImportedPost) {
  const apiKey = getOpenRouterApiKey()
  if (!apiKey) return fallbackSlideTexts(post)
  const count = post.photos.length
  const result = await openRouterJson({
    apiKey,
    model: openRouterModelForUseCase("imageCaptioning"),
    timeoutMs: 90_000,
    maxTokens: Math.max(600, count * 350),
    temperature: 0,
    schema: {
      name: "tiktok_slide_text",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          slides: {
            type: "array",
            minItems: count,
            maxItems: count,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                index: { type: "integer" },
                text: { type: "string" },
              },
              required: ["index", "text"],
            },
          },
        },
        required: ["slides"],
      },
    },
    messages: [
      {
        role: "system",
        content:
          "Transcribe the visible editorial text from each TikTok slideshow image in order. Preserve words and sentence order. Ignore decorative symbols, watermarks, and background art. Return an empty string only when an image genuinely contains no text.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `These are ${count} ordered slides from TikTok post ${post.id}. Return exactly ${count} entries with one-based indices.`,
          },
          ...post.photos.map((photo) => ({
            type: "image_url" as const,
            image_url: { url: photo.sourceImageUrl },
          })),
        ],
      },
    ],
  })
  const slides = Array.isArray(result.slides) ? result.slides : []
  const byIndex = new Map(
    slides.flatMap((value) => {
      if (!isRecord(value)) return []
      const index = Number(value.index)
      return Number.isInteger(index)
        ? [[index, clean(value.text)] as const]
        : []
    })
  )
  return post.photos.map((_, index) => byIndex.get(index + 1) ?? "")
}

function fallbackSlideTexts(post: TikTokImportedPost) {
  return post.photos.map((_, index) =>
    index === 0 ? captionBody(post.caption) : ""
  )
}

async function readTikTokPosts(datasetId: string) {
  const items = await apifyJson<DatasetItem[]>(
    `/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json&limit=${MAX_URLS * MAX_PHOTOS_PER_URL}`
  )
  const grouped = new Map<string, TikTokImportedPost>()
  for (const item of Array.isArray(items) ? items : []) {
    const id = clean(item.videoId)
    const sourceImageUrl = clean(item.sourceImageUrl)
    const downloadUrl = clean(item.downloadUrl)
    const index = Number(item.photoIndex)
    if (!id || !sourceImageUrl || !downloadUrl || !Number.isInteger(index)) {
      continue
    }
    const parsed = parseManualPublicationUrl({
      url: clean(item.requestedUrl),
      provider: "tiktok",
    })
    const current = grouped.get(id) ?? {
      id,
      url: parsed.releaseUrl,
      authorUsername: clean(item.authorUsername),
      caption: clean(item.caption),
      publishedAt: tiktokPublishedAt(id),
      photoCount: Math.max(1, Number(item.photoCount) || 1),
      photos: [],
    }
    current.photos.push({ index, sourceImageUrl, downloadUrl })
    grouped.set(id, current)
  }
  return [...grouped.values()]
    .map((post) => ({
      ...post,
      photos: post.photos.sort((left, right) => left.index - right.index),
    }))
    .sort(
      (left, right) =>
        Date.parse(left.publishedAt) - Date.parse(right.publishedAt)
    )
}

export function tiktokPublishedAt(id: string) {
  try {
    const seconds = Number(BigInt(id) >> BigInt(32))
    const date = new Date(seconds * 1000)
    if (Number.isFinite(date.getTime())) return date.toISOString()
  } catch {
    // Replaced by the validation error below.
  }
  throw new Error("TikTok returned an invalid post id")
}

async function requireAutomation(id: string) {
  const automation = await getAutomationRecord(clean(id))
  if (!automation) throw new Error("Automation not found")
  return automation
}

async function requireTikTokIntegration(id: string) {
  const raw = await postfastRequest<unknown[]>(
    "/social-media/my-social-accounts"
  )
  const integration = raw
    .map(normalizePostFastIntegration)
    .find((item): item is PostFastSocialIntegration =>
      Boolean(
        item &&
        item.integration_id === clean(id) &&
        item.provider.startsWith("tiktok") &&
        !item.disabled
      )
    )
  if (!integration) throw new Error("Choose a connected TikTok account")
  return integration
}

async function assertExpectedActor(run: ApifyRun) {
  const expected = apifyActor().replace("/", "~")
  const actorPayload = await apifyJson<{ data?: { id?: unknown } }>(
    `/acts/${encodeURIComponent(expected)}`
  )
  const expectedId = clean(actorPayload.data?.id)
  if (!expectedId || clean(run.actId) !== expectedId) {
    throw new Error("That operation is not a LumenClip TikTok import")
  }
}

function apifyActor() {
  return clean(process.env.APIFY_TIKTOK_SLIDESHOW_ACTOR) || DEFAULT_ACTOR
}

function apifyToken() {
  const token = clean(process.env.APIFY_KEY)
  if (!token) throw new Error("TikTok import is not configured")
  return token
}

async function apifyJson<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const response = await fetch(`${APIFY_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apifyToken()}`,
      ...(init.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(30_000),
  })
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string }
  }
  if (!response.ok) {
    throw new Error(
      payload.error?.message || `TikTok import failed (${response.status})`
    )
  }
  return payload
}

function normalizeImportStatus(value: unknown): TikTokImportStatus {
  const status = clean(value).toUpperCase()
  if (
    status === "READY" ||
    status === "RUNNING" ||
    status === "SUCCEEDED" ||
    status === "FAILED" ||
    status === "ABORTED" ||
    status === "TIMED-OUT"
  ) {
    return status
  }
  return "RUNNING"
}

function captionBody(value: string) {
  return clean(value)
    .replace(/(?:\s+#[\p{L}\p{N}_-]+)+\s*$/gu, "")
    .trim()
}

function titleFromHook(value: string) {
  const text = clean(value)
  if (!text) return "Recovered TikTok slideshow"
  return text
    .split(/\s+/)
    .map((word) =>
      word.length <= 3
        ? word
        : `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`
    )
    .join(" ")
    .slice(0, 160)
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = tokens(left)
  const rightTokens = tokens(right)
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token)
  ).length
  return intersection / Math.max(leftTokens.size, rightTokens.size)
}

function tokens(value: string) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
  )
}

function normalizeText(value: string) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function roundScore(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "that",
  "this",
  "with",
  "from",
  "your",
  "they",
  "when",
  "what",
  "into",
  "for",
  "you",
])
