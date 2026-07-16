import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import { unstable_cache } from "next/cache"

import sharp from "sharp"

import { readAssetBytes } from "@/lib/asset-storage"
import { clean, isRecord } from "@/lib/guards"
import {
  readJsonArrayStore,
  withJsonArrayStore,
  writeJsonArrayStore,
} from "@/lib/json-store"
import { openRouterChatCompletion } from "@/lib/openrouter"
import { openRouterModelForUseCase } from "@/lib/realfarm-generation-model-registry"
import { renderedSlideSvg, type SlideshowSlide } from "@/lib/slideshow-renderer"
import type { SlideshowRecord } from "@/lib/slideshows"

export type SlideshowBenchmarkScores = {
  hookVirality: number
  pictureTextFit: number
  usefulnessToIcp: number
  conversationPotential: number
  overall: number
}

export type SlideshowBenchmarkRationales = {
  hookVirality: string
  pictureTextFit: string
  usefulnessToIcp: string
  conversationPotential: string
}

export type BenchmarkSlideInfo = {
  id: string
  imageUrl: string
  originalImageUrl?: string
  text?: string
  role?: "hook" | "content" | "cta"
  width?: number
  height?: number
  bytes?: number
}

export type BenchmarkCreator = {
  id: string
  username: string
  nickname: string
  signature: string
  followerCount: string
  followingCount: string
  avatarUrl: string
  niche: string
  product: string
  productMedium: string
  linkInBio: string
  region: string
  audienceRegions: Array<{
    count?: number
    country?: string
    percentage?: string
    countryCode?: string
  }>
}

export type BenchmarkSourceStats = {
  viewsLabel: string
  likesLabel: string
  bookmarksLabel: string
  views: number
  likes: number
  bookmarks: number
}

export type BenchmarkCorpusRecord = {
  id: string
  source: "reelfarm" | "tiktok"
  sourceUrl: string
  creator: BenchmarkCreator
  stats: BenchmarkSourceStats
  slides: BenchmarkSlideInfo[]
  prompt: string
  icp: string
  scores: SlideshowBenchmarkScores
  rationales: SlideshowBenchmarkRationales
  model: string
  createdAt: string
  gradedAt: string
}

export type GeneratedSlideshowBenchmark = {
  ownerId?: string
  id: string
  slideshowId: string
  runId?: string
  automationId?: string
  title: string
  icp: string
  slides: BenchmarkSlideInfo[]
  scores: SlideshowBenchmarkScores
  rationales: SlideshowBenchmarkRationales
  model: string
  inputHash?: string
  createdAt: string
}

export type SlideshowBenchmarkComparison = {
  subject: GeneratedSlideshowBenchmark
  references: BenchmarkCorpusRecord[]
}

type ScoreInput = {
  title: string
  icp?: string
  slides: BenchmarkSlideInfo[]
  imageBytes?: Buffer[]
  apiKey?: string
  model?: string
  fetchImpl?: typeof fetch
}

type RawGrade = {
  scores?: Record<string, unknown>
  rationales?: Record<string, unknown>
}

function benchmarkRootDir() {
  return path.join(process.cwd(), "data", "benchmarks")
}
const benchmarkModel = openRouterModelForUseCase("imageCaptioning")

// Keep in sync with scripts/import-tiktok-corpus.mjs so corpus references and
// generated slideshows are graded on the same rubric.
export const benchmarkGraderSystemPrompt = [
  "You are a strict short-form slideshow creative benchmarker. Grade four independent dimensions from 0 to 10 using integers. Judge the rendered pixels: actual text placement, legibility, image relevance, specificity, and narrative progression. A 5 is average; 8+ requires unusually strong evidence. Do not reward production polish that does not improve the metric being scored.",
  "",
  "hookVirality — use ONLY slide 1. On a photo slideshow the slide-1 text is the headline and the image is the visual hook; grade both plus their alignment:",
  "- Rapid context: after one read the viewer knows exactly what the post is about and who it is for. The wording must have one unmistakable reading; any plausible confusion loses points.",
  "- Curiosity loop via contrast: the hook states or implies a gap between what people currently believe or expect and what the post will reveal. Bigger, more surprising contrast scores higher. A plain topic label or bland statement with no tension caps this dimension at 4.",
  "- Distillation and direct address: fewest possible words, no wasted openers ('in my opinion', throat-clearing), text big and legible near eye level. 'You/your' or a named identity call-out ('October Scorpios', 'homeschool moms') beats 'I/me' framing unless the me-story is universally relatable.",
  "- Text-visual alignment: the image must amplify the same idea as the text; a generic or mismatched image weakens the hook.",
  "Anchors: 3 = topic label with no tension over an unrelated photo; 5 = clear topic with mild curiosity; 8 = unmistakable topic plus strong stated or implied contrast plus an aligned scroll-stopping visual; 10 = all of that plus an identity call-out or stakes that make skipping feel costly.",
  "",
  "pictureTextFit — use ALL slides: legibility of every text block against its background (contrast, size, safe placement, nothing important covered), consistent styling across slides, and whether each image's subject and mood match — ideally amplify — that slide's text. Native platform-feel (looks typed in the app) beats ad-style polish.",
  "",
  "usefulnessToIcp — use ALL slides: each slide should deliver a specific, concrete, NEW point (a behavior, scene, example, or number) the target ICP would care about. Generic trait lists, repeated points, or filler cap this at 4. Density matters: a slide worth reading for five seconds beats a thin quip. Progression should build across slides, not shuffle.",
  "",
  "conversationPotential — use ALL slides: score the signals that actually drive comments, shares, and saves — identity signaling ('this is me' / 'send this to her'), a confident take that is just polarizing enough, open questions, a natural CTA (tag someone, comment your sign, which one next), and a final slide worth screenshotting. A post that ends flat with no invitation caps at 5.",
].join("\n")

const listCachedBenchmarkCorpus = unstable_cache(
  readBenchmarkCorpus,
  ["slideshow-benchmark-corpus"],
  { revalidate: 300 }
)

export async function listBenchmarkCorpus(input: { limit?: number } = {}) {
  const records =
    process.env.NODE_ENV === "test"
      ? await readBenchmarkCorpus()
      : await listCachedBenchmarkCorpus()
  return records.slice(0, Math.max(1, input.limit ?? 100))
}

function readBenchmarkCorpus() {
  return readJsonArrayStore<BenchmarkCorpusRecord>({
    rootDir: benchmarkRootDir(),
    fileName: "corpus.json",
    key: "benchmarks",
    normalize: normalizeCorpusRecord,
  })
}

export async function listGeneratedSlideshowBenchmarks(
  input: {
    slideshowId?: string
    automationId?: string
    limit?: number
  } = {}
) {
  const records = await readJsonArrayStore<GeneratedSlideshowBenchmark>({
    rootDir: benchmarkRootDir(),
    fileName: "scores.json",
    key: "benchmarks",
    normalize: normalizeGeneratedBenchmark,
  })
  const filtered = records.filter(
    (record) =>
      (!input.slideshowId || record.slideshowId === input.slideshowId) &&
      (!input.automationId || record.automationId === input.automationId)
  )
  return filtered.slice(0, Math.max(1, input.limit ?? 100))
}

export async function deleteGeneratedSlideshowBenchmarks(slideshowId: string) {
  return withJsonArrayStore<
    GeneratedSlideshowBenchmark,
    GeneratedSlideshowBenchmark[]
  >({
    rootDir: benchmarkRootDir(),
    fileName: "scores.json",
    key: "benchmarks",
    normalize: normalizeGeneratedBenchmark,
    update(records) {
      const deleted = records.filter(
        (record) => record.slideshowId === slideshowId
      )
      return {
        records: records.filter((record) => record.slideshowId !== slideshowId),
        result: deleted,
      }
    },
  })
}

export async function benchmarkComparisonForSlideshow(
  slideshowId: string,
  random = Math.random
): Promise<SlideshowBenchmarkComparison | null> {
  const [subject] = await listGeneratedSlideshowBenchmarks({
    slideshowId,
    limit: 1,
  })
  if (!subject) return null
  return {
    subject: {
      ...subject,
      slides: await enrichBenchmarkSlides(subject.slides),
    },
    references: nicheMatchedBenchmarkReferences(
      await listBenchmarkCorpus(),
      subject,
      3,
      random
    ),
  }
}

/**
 * Prefer corpus references from the subject's own niche (keyword overlap on
 * icp/title vs the reference's icp/niche/prompt) so an astrology slideshow is
 * compared against astrology winners, not random accounts. Falls back to
 * random picks to fill remaining slots.
 */
export function nicheMatchedBenchmarkReferences(
  records: BenchmarkCorpusRecord[],
  subject: Pick<GeneratedSlideshowBenchmark, "icp" | "title">,
  count = 3,
  random = Math.random
) {
  const subjectTokens = benchmarkNicheTokens(
    `${subject.icp ?? ""} ${subject.title ?? ""}`
  )
  const scored = records
    .map((record) => {
      const recordTokens = benchmarkNicheTokens(
        `${record.icp ?? ""} ${record.creator?.niche ?? ""} ${record.prompt ?? ""}`
      )
      let overlap = 0
      for (const token of recordTokens) {
        if (subjectTokens.has(token)) overlap += 1
      }
      return { record, overlap }
    })
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, count)
    .map((entry) => entry.record)
  const matchedIds = new Set(scored.map((record) => record.id))
  const fillers = randomBenchmarkReferences(
    records.filter((record) => !matchedIds.has(record.id)),
    count - scored.length,
    random
  )
  return [...scored, ...fillers]
}

const nicheStopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "your",
  "you",
  "this",
  "that",
  "from",
  "about",
  "website",
  "informational",
  "content",
  "slideshow",
  "tiktok",
  "instagram",
])

function benchmarkNicheTokens(value: string) {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((token) => token.length >= 4 && !nicheStopWords.has(token))
  )
}

export function randomBenchmarkReferences(
  records: BenchmarkCorpusRecord[],
  count = 3,
  random = Math.random
) {
  const pool = [...records]
  const picked: BenchmarkCorpusRecord[] = []
  while (pool.length > 0 && picked.length < count) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length))
    picked.push(pool.splice(index, 1)[0])
  }
  return picked
}

export async function benchmarkAndStoreGeneratedSlideshow(
  input: ScoreInput & {
    slideshowId: string
    runId?: string
    automationId?: string
  }
) {
  const imageBytes = await Promise.all(
    input.slides.map(
      async (slide, index) =>
        input.imageBytes?.[index] ?? (await benchmarkImageBytes(slide.imageUrl))
    )
  )
  const inputHash = benchmarkInputHash(input, imageBytes)
  const records = await listGeneratedSlideshowBenchmarks({
    limit: Number.MAX_SAFE_INTEGER,
  })
  const cached = records.find(
    (record) =>
      record.slideshowId === input.slideshowId && record.inputHash === inputHash
  )
  if (cached) {
    return { ...cached, cacheHit: true as const }
  }

  const slides = await enrichBenchmarkSlides(input.slides, imageBytes)
  const grade = await scoreSlideshowBenchmark({
    ...input,
    slides,
    imageBytes,
  })
  const now = new Date().toISOString()
  const record: GeneratedSlideshowBenchmark = {
    id: `benchmark-${randomUUID()}`,
    slideshowId: input.slideshowId,
    runId: clean(input.runId) || undefined,
    automationId: clean(input.automationId) || undefined,
    title: clean(input.title) || "Generated slideshow",
    icp:
      clean(input.icp) || "The intended audience inferred from the slideshow",
    slides,
    ...grade,
    inputHash,
    createdAt: now,
  }
  await writeJsonArrayStore({
    rootDir: benchmarkRootDir(),
    fileName: "scores.json",
    key: "benchmarks",
    records: [
      record,
      ...records.filter((item) => item.slideshowId !== record.slideshowId),
    ],
  })
  return { ...record, cacheHit: false as const }
}

export function benchmarkContextFromSlides(input: {
  title?: string
  slides: Pick<BenchmarkSlideInfo, "text">[]
}) {
  return (
    [
      clean(input.title),
      ...input.slides.map((slide, index) => {
        const text = clean(slide.text)
        return text ? `Slide ${index + 1}: ${text}` : ""
      }),
    ]
      .filter(Boolean)
      .join(" · ") || "Infer the intended audience from the slide content"
  )
}

export function benchmarkSlidesFromSlideshow(
  slideshow: Pick<SlideshowRecord, "id" | "images" | "output_images">
): BenchmarkSlideInfo[] {
  return slideshow.output_images.map((imageUrl, index) => {
    const sourceSlide = slideshow.images[index]
    const sourceId = clean(sourceSlide?.id).toLowerCase()
    const role: BenchmarkSlideInfo["role"] =
      index === 0 || sourceId.includes("hook")
        ? "hook"
        : sourceId.includes("cta")
          ? "cta"
          : "content"

    return {
      id: sourceSlide?.id || `${slideshow.id}-slide-${index + 1}`,
      imageUrl,
      originalImageUrl: sourceSlide?.source_image_url || sourceSlide?.image_url,
      text: sourceSlide?.textItems
        .map((item) => item.text)
        .filter(Boolean)
        .join("\n"),
      role,
    }
  })
}

async function enrichBenchmarkSlides(
  slides: BenchmarkSlideInfo[],
  suppliedBytes?: Buffer[]
) {
  return Promise.all(
    slides.map(async (slide, index) => {
      if (slide.width && slide.height && slide.bytes) return slide
      try {
        const bytes =
          suppliedBytes?.[index] ?? (await benchmarkImageBytes(slide.imageUrl))
        const metadata = await sharp(bytes).metadata()
        return {
          ...slide,
          width: slide.width ?? metadata.width,
          height: slide.height ?? metadata.height,
          bytes: slide.bytes ?? bytes.byteLength,
        }
      } catch {
        return slide
      }
    })
  )
}

export async function scoreSlideshowBenchmark(input: ScoreInput) {
  const apiKey = clean(input.apiKey) || clean(process.env.OPENROUTER_API_KEY)
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
  if (input.slides.length === 0) throw new Error("A slideshow is required")

  const prepared = await Promise.all(
    input.slides.map(async (slide, index) => ({
      slide,
      dataUrl: await compactBenchmarkImage(
        input.imageBytes?.[index] ?? (await benchmarkImageBytes(slide.imageUrl))
      ),
    }))
  )
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: [
        `Slideshow title: ${clean(input.title) || "Untitled"}`,
        `Slideshow context (title and actual slide copy): ${clean(input.icp) || "Infer the intended audience from the slide content"}`,
        `There are ${prepared.length} slides in order.`,
      ].join("\n"),
    },
  ]
  for (const [index, item] of prepared.entries()) {
    const marker =
      index === 0
        ? " (HOOK — use only this slide for hook virality)"
        : index === prepared.length - 1
          ? " (FINAL slide — judge the close/CTA here for conversation potential)"
          : ""
    content.push({
      type: "text",
      text: `Slide ${index + 1}${marker}${item.slide.text ? `\nStored text: ${item.slide.text}` : ""}`,
    })
    content.push({ type: "image_url", image_url: { url: item.dataUrl } })
  }

  const response = await openRouterChatCompletion({
    apiKey,
    model: clean(input.model) || benchmarkModel,
    fetchImpl: input.fetchImpl,
    timeoutMs: 90_000,
    messages: [
      {
        role: "system",
        content: benchmarkGraderSystemPrompt,
      },
      { role: "user", content },
    ],
    responseFormat: benchmarkResponseFormat(),
  })
  if (!response.ok) {
    throw new Error(
      response.payload.error?.message ||
        `Benchmark model failed (${response.status})`
    )
  }
  const rawContent = response.payload.choices?.[0]?.message?.content
  const parsed =
    typeof rawContent === "string"
      ? (JSON.parse(rawContent) as RawGrade)
      : rawContent
  return normalizeGrade(parsed, clean(input.model) || benchmarkModel)
}

export function benchmarkInputHash(input: ScoreInput, imageBytes: Buffer[]) {
  const stable = JSON.stringify({
    version: 2,
    rubric: createHash("sha256")
      .update(benchmarkGraderSystemPrompt)
      .digest("hex"),
    model: clean(input.model) || benchmarkModel,
    title: clean(input.title),
    context: clean(input.icp),
    slides: input.slides.map((slide, index) => ({
      role: slide.role || "",
      text: clean(slide.text),
      renderedImage: createHash("sha256")
        .update(imageBytes[index] ?? Buffer.alloc(0))
        .digest("hex"),
    })),
  })
  return `benchmark-input-${createHash("sha256").update(stable).digest("hex")}`
}

export async function renderSlidesForBenchmark(
  slides: SlideshowSlide[],
  opts?: { aspectRatio?: string; font?: string }
) {
  return Promise.all(
    slides.map(async (slide) => {
      const source = await imageDataUrl(slide.image_url)
      const overlay = slide.overlayImage?.image_url
        ? await imageDataUrl(slide.overlayImage.image_url)
        : undefined
      const svg = renderedSlideSvg(slide, source, overlay, opts)
      return sharp(Buffer.from(svg)).png().toBuffer()
    })
  )
}

export function generatedBenchmarkId(input: {
  slideshowId?: string
  runId?: string
  title: string
}) {
  const stable = `${input.slideshowId || input.runId || input.title}`
  return `benchmark-${createHash("sha256").update(stable).digest("hex").slice(0, 20)}`
}

function benchmarkResponseFormat() {
  const scoreProperties = Object.fromEntries(
    [
      "hookVirality",
      "pictureTextFit",
      "usefulnessToIcp",
      "conversationPotential",
    ].map((key) => [key, { type: "integer", minimum: 0, maximum: 10 }])
  )
  const rationaleProperties = Object.fromEntries(
    Object.keys(scoreProperties).map((key) => [key, { type: "string" }])
  )
  return {
    type: "json_schema",
    json_schema: {
      name: "slideshow_benchmark",
      strict: true,
      schema: {
        type: "object",
        properties: {
          scores: {
            type: "object",
            properties: scoreProperties,
            required: Object.keys(scoreProperties),
            additionalProperties: false,
          },
          rationales: {
            type: "object",
            properties: rationaleProperties,
            required: Object.keys(rationaleProperties),
            additionalProperties: false,
          },
        },
        required: ["scores", "rationales"],
        additionalProperties: false,
      },
    },
  }
}

function normalizeGrade(
  value: unknown,
  model: string = benchmarkModel
): {
  scores: SlideshowBenchmarkScores
  rationales: SlideshowBenchmarkRationales
  model: string
} {
  const root = isRecord(value) ? value : {}
  const scores = isRecord(root.scores) ? root.scores : {}
  const rationales = isRecord(root.rationales) ? root.rationales : {}
  const metric = (key: string) =>
    Math.max(0, Math.min(10, Math.round(Number(scores[key]) || 0)))
  const normalizedScores = {
    hookVirality: metric("hookVirality"),
    pictureTextFit: metric("pictureTextFit"),
    usefulnessToIcp: metric("usefulnessToIcp"),
    conversationPotential: metric("conversationPotential"),
  }
  return {
    scores: {
      ...normalizedScores,
      overall:
        Math.round(
          (Object.values(normalizedScores).reduce(
            (sum, score) => sum + score,
            0
          ) /
            4) *
            10
        ) / 10,
    },
    rationales: {
      hookVirality: clean(rationales.hookVirality),
      pictureTextFit: clean(rationales.pictureTextFit),
      usefulnessToIcp: clean(rationales.usefulnessToIcp),
      conversationPotential: clean(rationales.conversationPotential),
    },
    model,
  }
}

async function benchmarkImageBytes(imageUrl: string) {
  if (imageUrl.startsWith("data:")) return dataUrlBytes(imageUrl)
  const localPrefix = "/api/local-assets/"
  if (imageUrl.startsWith(localPrefix)) {
    const relative = imageUrl
      .slice(localPrefix.length)
      .split("/")
      .map(decodeURIComponent)
    return readAssetBytes(path.join(process.cwd(), "data", ...relative))
  }
  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok)
    throw new Error(`Could not load benchmark image (${response.status})`)
  return Buffer.from(await response.arrayBuffer())
}

async function compactBenchmarkImage(bytes: Buffer) {
  const output = await sharp(bytes)
    .rotate()
    .resize({
      width: 640,
      height: 960,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 68, mozjpeg: true })
    .toBuffer()
  return `data:image/jpeg;base64,${output.toString("base64")}`
}

async function imageDataUrl(imageUrl: string) {
  const bytes = await benchmarkImageBytes(imageUrl)
  const png = await sharp(bytes).png().toBuffer()
  return `data:image/png;base64,${png.toString("base64")}`
}

function dataUrlBytes(value: string) {
  const comma = value.indexOf(",")
  if (comma < 0) throw new Error("Invalid image data URL")
  const header = value.slice(0, comma)
  const data = value.slice(comma + 1)
  return header.includes(";base64")
    ? Buffer.from(data, "base64")
    : Buffer.from(decodeURIComponent(data))
}

function normalizeCorpusRecord(record: BenchmarkCorpusRecord) {
  return record?.id && record?.slides?.length && record?.scores ? record : null
}

function normalizeGeneratedBenchmark(record: GeneratedSlideshowBenchmark) {
  return record?.id &&
    record?.slideshowId &&
    record?.slides?.length &&
    record?.scores
    ? record
    : null
}
