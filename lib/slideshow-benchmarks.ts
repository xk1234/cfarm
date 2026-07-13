import { createHash, randomUUID } from "node:crypto"
import path from "node:path"

import sharp from "sharp"

import { readAssetBytes } from "@/lib/asset-storage"
import { clean, isRecord } from "@/lib/guards"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import { openRouterChatCompletion } from "@/lib/openrouter"
import { openRouterModelForUseCase } from "@/lib/realfarm-generation-model-registry"
import {
  renderedSlideSvg,
  type SlideshowSlide,
} from "@/lib/slideshow-renderer"

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
  source: "reelfarm"
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

const benchmarkRootDir = path.join(process.cwd(), "data", "benchmarks")
const benchmarkModel = openRouterModelForUseCase("imageCaptioning")

export async function listBenchmarkCorpus(input: { limit?: number } = {}) {
  const records = await readJsonArrayStore<BenchmarkCorpusRecord>({
    rootDir: benchmarkRootDir,
    fileName: "corpus.json",
    key: "benchmarks",
    normalize: normalizeCorpusRecord,
  })
  return records.slice(0, Math.max(1, input.limit ?? 100))
}

export async function listGeneratedSlideshowBenchmarks(input: {
  slideshowId?: string
  limit?: number
} = {}) {
  const records = await readJsonArrayStore<GeneratedSlideshowBenchmark>({
    rootDir: benchmarkRootDir,
    fileName: "scores.json",
    key: "benchmarks",
    normalize: normalizeGeneratedBenchmark,
  })
  const filtered = input.slideshowId
    ? records.filter((record) => record.slideshowId === input.slideshowId)
    : records
  return filtered.slice(0, Math.max(1, input.limit ?? 100))
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
    references: randomBenchmarkReferences(await listBenchmarkCorpus(), 3, random),
  }
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

export async function benchmarkAndStoreGeneratedSlideshow(input: ScoreInput & {
  slideshowId: string
  runId?: string
  automationId?: string
}) {
  const imageBytes = await Promise.all(
    input.slides.map(
      async (slide, index) =>
        input.imageBytes?.[index] ?? (await benchmarkImageBytes(slide.imageUrl))
    )
  )
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
    icp: clean(input.icp) || "The intended audience inferred from the slideshow",
    slides,
    ...grade,
    createdAt: now,
  }
  const records = await listGeneratedSlideshowBenchmarks({
    limit: Number.MAX_SAFE_INTEGER,
  })
  await writeJsonArrayStore({
    rootDir: benchmarkRootDir,
    fileName: "scores.json",
    key: "benchmarks",
    records: [
      record,
      ...records.filter((item) => item.slideshowId !== record.slideshowId),
    ],
  })
  return record
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
        `Target ICP: ${clean(input.icp) || "Infer the intended ICP from the content"}`,
        `There are ${prepared.length} slides in order.`,
      ].join("\n"),
    },
  ]
  for (const [index, item] of prepared.entries()) {
    content.push({
      type: "text",
      text: `Slide ${index + 1}${index === 0 ? " (HOOK — use only this slide for hook virality)" : ""}${item.slide.text ? `\nStored text: ${item.slide.text}` : ""}`,
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
        content:
          "You are a strict short-form slideshow creative benchmarker. Grade four independent dimensions from 0 to 10 using integers. Hook virality must use ONLY slide 1. Picture/text fit, usefulness to ICP, and conversation potential must use ALL slides. Judge the rendered pixels, including actual text placement, legibility, image relevance, specificity, narrative progression, and whether the content invites comments or sharing. A 5 is average; 8+ requires unusually strong evidence. Do not reward production polish that does not improve the metric.",
      },
      { role: "user", content },
    ],
    responseFormat: benchmarkResponseFormat(),
  })
  if (!response.ok) {
    throw new Error(
      response.payload.error?.message || `Benchmark model failed (${response.status})`
    )
  }
  const rawContent = response.payload.choices?.[0]?.message?.content
  const parsed =
    typeof rawContent === "string" ? (JSON.parse(rawContent) as RawGrade) : rawContent
  return normalizeGrade(parsed)
}

export async function renderSlidesForBenchmark(slides: SlideshowSlide[]) {
  return Promise.all(
    slides.map(async (slide) => {
      const source = await imageDataUrl(slide.image_url)
      const overlay = slide.overlayImage?.image_url
        ? await imageDataUrl(slide.overlayImage.image_url)
        : undefined
      const svg = renderedSlideSvg(slide, source, overlay)
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

function normalizeGrade(value: unknown): {
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
          (Object.values(normalizedScores).reduce((sum, score) => sum + score, 0) /
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
    model: benchmarkModel,
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
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Could not load benchmark image (${response.status})`)
  return Buffer.from(await response.arrayBuffer())
}

async function compactBenchmarkImage(bytes: Buffer) {
  const output = await sharp(bytes)
    .rotate()
    .resize({ width: 640, height: 960, fit: "inside", withoutEnlargement: true })
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
  return record?.id && record?.slides?.length && record?.scores
    ? record
    : null
}

function normalizeGeneratedBenchmark(record: GeneratedSlideshowBenchmark) {
  return record?.id && record?.slideshowId && record?.slides?.length && record?.scores
    ? record
    : null
}
