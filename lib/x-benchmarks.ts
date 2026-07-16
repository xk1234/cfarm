import { createHash, randomUUID } from "node:crypto"
import path from "node:path"
import { unstable_cache } from "next/cache"

import { clean, isRecord } from "@/lib/guards"
import { readJsonArrayStore, withJsonArrayStore } from "@/lib/json-store"
import { getOpenRouterApiKey, openRouterChatCompletion } from "@/lib/openrouter"
import { openRouterModelForUseCase } from "@/lib/realfarm-generation-model-registry"
import type { XAutomationPlatform, XAutomationRun } from "@/lib/x-automation"

export type XBenchmarkDimensions =
  | "hookStopPower"
  | "valueDensity"
  | "voiceFormatFit"
  | "replyBait"
  | "hookLabelPower"
  | "scannability"
  | "identityPolarity"

export type XBenchmarkScores = Record<XBenchmarkDimensions, number> & {
  overall: number
}

export type XBenchmarkGrade = {
  scores: XBenchmarkScores
  rationales: Partial<Record<XBenchmarkDimensions, string>>
  model: string
  inputHash: string
  gradedAt: string
}

export type XBenchmarkCorpusRecord = {
  id: string
  platform: XAutomationPlatform
  niche: string
  author: string
  sourceUrl?: string
  text?: string
  texts?: string[]
  archetype?: string
  metrics: {
    likes?: number
    replies?: number
    reposts?: number
    views?: number
  }
  lift?: number
  grade?: XBenchmarkGrade
  notes: string[]
  createdAt: string
}

export type XGeneratedBenchmark = {
  id: string
  runId: string
  automationId: string
  platform: XAutomationPlatform
  niche: string
  text: string
  grade: XBenchmarkGrade
  createdAt: string
}

export type XBenchmarkComparison = {
  subject: XGeneratedBenchmark
  references: XBenchmarkCorpusRecord[]
}

const rootDir = path.join(process.cwd(), "data", "x-benchmarks")
const judgeModel = openRouterModelForUseCase("xBenchmarkJudge")
export const xBenchmarkRubricVersion = 1

const listCachedXBenchmarkCorpus = unstable_cache(
  readXBenchmarkCorpus,
  ["x-benchmark-corpus"],
  { revalidate: 300 }
)

export async function listXBenchmarkCorpus() {
  return process.env.NODE_ENV === "test"
    ? readXBenchmarkCorpus()
    : listCachedXBenchmarkCorpus()
}

function readXBenchmarkCorpus() {
  return readJsonArrayStore<XBenchmarkCorpusRecord>({
    rootDir,
    fileName: "corpus.json",
    key: "xBenchmarks",
    normalize: normalizeCorpus,
  })
}

export async function listGeneratedXBenchmarks() {
  return readJsonArrayStore<XGeneratedBenchmark>({
    rootDir,
    fileName: "scores.json",
    key: "xBenchmarkScores",
    normalize: normalizeGenerated,
  })
}

export async function deleteGeneratedXBenchmarksForRuns(runIds: string[]) {
  const ids = new Set(runIds)
  if (ids.size === 0) return []
  return withJsonArrayStore<XGeneratedBenchmark, XGeneratedBenchmark[]>({
    rootDir,
    fileName: "scores.json",
    key: "xBenchmarkScores",
    normalize: normalizeGenerated,
    update: (items) => {
      const deleted = items.filter((item) => ids.has(item.runId))
      return {
        records: items.filter((item) => !ids.has(item.runId)),
        result: deleted,
      }
    },
  })
}

export function xBenchmarkInputHash(input: {
  platform: XAutomationPlatform
  text: string
  model?: string
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        rubricVersion: xBenchmarkRubricVersion,
        model: clean(input.model) || judgeModel,
        platform: input.platform,
        text: clean(input.text),
      })
    )
    .digest("hex")
}

export async function gradeXPost(input: {
  platform: XAutomationPlatform
  text: string
  niche?: string
  model?: string
  apiKey?: string
  fetchImpl?: typeof fetch
}): Promise<XBenchmarkGrade> {
  const text = clean(input.text)
  if (!text) throw new Error("Post text is required")
  const model = clean(input.model) || judgeModel
  const apiKey = clean(input.apiKey) || getOpenRouterApiKey()
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured")
  const inputHash = xBenchmarkInputHash({
    platform: input.platform,
    text,
    model,
  })
  const rubric = benchmarkRubric(input.platform)
  let parsed: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await openRouterChatCompletion({
      apiKey,
      model,
      fetchImpl: input.fetchImpl,
      timeoutMs: 90_000,
      maxTokens: 1_200,
      messages: [
        { role: "system", content: rubric },
        {
          role: "user",
          content: `Niche: ${clean(input.niche) || "infer from post"}\n\nPost:\n${text}${attempt ? "\n\nReturn compact, complete JSON only. The previous response was malformed or truncated." : ""}`,
        },
      ],
      responseFormat: benchmarkResponseFormat(input.platform),
    })
    if (!response.ok)
      throw new Error(
        response.payload.error?.message ||
          `Benchmark judge failed (${response.status})`
      )
    parsed = parseJudgePayload(response.payload.choices?.[0]?.message?.content)
    if (parsed) break
  }
  if (!parsed)
    throw new Error("The benchmark judge returned invalid JSON twice")
  return normalizeGrade(parsed, input.platform, model, inputHash)
}

function parseJudgePayload(raw: unknown) {
  if (isRecord(raw)) return raw
  if (typeof raw !== "string") return null
  const candidate = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()
  try {
    const parsed: unknown = JSON.parse(candidate)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function benchmarkXRunWithJudge(input: {
  run: XAutomationRun
  niche: string
  apiKey?: string
  fetchImpl?: typeof fetch
}) {
  const text = input.run.posts.map((post) => post.text).join("\n\n---\n\n")
  const inputHash = xBenchmarkInputHash({
    platform: input.run.platform,
    text,
  })
  const existing = (await listGeneratedXBenchmarks()).find(
    (item) => item.runId === input.run.id && item.grade.inputHash === inputHash
  )
  if (existing) return { benchmark: existing, cacheHit: true }
  const grade = await gradeXPost({
    platform: input.run.platform,
    text,
    niche: input.niche,
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
  })
  const benchmark: XGeneratedBenchmark = {
    id: `x-grade-${randomUUID()}`,
    runId: input.run.id,
    automationId: input.run.automationId,
    platform: input.run.platform,
    niche: clean(input.niche),
    text,
    grade,
    createdAt: new Date().toISOString(),
  }
  await withJsonArrayStore<XGeneratedBenchmark>({
    rootDir,
    fileName: "scores.json",
    key: "xBenchmarkScores",
    normalize: normalizeGenerated,
    update: (items) => ({
      records: [
        benchmark,
        ...items.filter((item) => item.runId !== benchmark.runId),
      ].slice(0, 1000),
    }),
  })
  return { benchmark, cacheHit: false }
}

export async function xBenchmarkComparisonForRun(runId: string) {
  const subject = (await listGeneratedXBenchmarks()).find(
    (item) => item.runId === runId
  )
  if (!subject) return null
  const references = nicheMatchedXBenchmarkReferences(
    subject,
    await listXBenchmarkCorpus()
  )
  return { subject, references } satisfies XBenchmarkComparison
}

export function nicheMatchedXBenchmarkReferences(
  subject: Pick<XGeneratedBenchmark, "platform" | "niche" | "text">,
  corpus: XBenchmarkCorpusRecord[],
  limit = 3
) {
  const subjectTokens = tokens(`${subject.niche} ${subject.text}`)
  return corpus
    .filter((item) => item.platform === subject.platform && item.grade)
    .map((item) => ({
      item,
      score: overlap(
        subjectTokens,
        tokens(`${item.niche} ${corpusText(item)}`)
      ),
    }))
    .sort(
      (a, b) => b.score - a.score || (b.item.lift ?? 0) - (a.item.lift ?? 0)
    )
    .slice(0, limit)
    .map(({ item }) => item)
}

export function benchmarkRubric(platform: XAutomationPlatform) {
  const anchors =
    "Use integer scores 0–10. 9–10 is exceptional and immediately engaging; 5 is readable but skippable; 0–3 is generic, vague, or platform-wrong. Judge the copy, not claimed metrics."
  return platform === "x"
    ? `${anchors}\nGrade hookStopPower (specific first-line scroll stop), valueDensity (identity insight/actionable substance; every line earns its place), voiceFormatFit (archetype fit, lowercase blunt native voice, no corporate or engagement-farming clichés), and replyBait (genuine curiosity gap, question, or self-identification trigger).`
    : `${anchors}\nGrade hookLabelPower (label or first line creates polarity/recognition), scannability (short lines, blank-line rhythm, readable in under three seconds), identityPolarity (the reader sees themselves or their sign and must choose a side), and replyBait (question, callout, or take people naturally respond to).`
}

function benchmarkResponseFormat(platform: XAutomationPlatform) {
  const keys =
    platform === "x"
      ? ["hookStopPower", "valueDensity", "voiceFormatFit", "replyBait"]
      : ["hookLabelPower", "scannability", "identityPolarity", "replyBait"]
  const properties = Object.fromEntries(
    keys.map((key) => [key, { type: "integer", minimum: 0, maximum: 10 }])
  )
  const rationales = Object.fromEntries(
    keys.map((key) => [key, { type: "string" }])
  )
  return {
    type: "json_schema" as const,
    json_schema: {
      name: `${platform}_benchmark_grade`,
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["scores", "rationales"],
        properties: {
          scores: {
            type: "object",
            additionalProperties: false,
            required: keys,
            properties,
          },
          rationales: {
            type: "object",
            additionalProperties: false,
            required: keys,
            properties: rationales,
          },
        },
      },
    },
  }
}

function normalizeGrade(
  value: unknown,
  platform: XAutomationPlatform,
  model: string,
  inputHash: string
): XBenchmarkGrade {
  const root = isRecord(value) ? value : {}
  const rawScores = isRecord(root.scores) ? root.scores : {}
  const rawRationales = isRecord(root.rationales) ? root.rationales : {}
  const keys: XBenchmarkDimensions[] =
    platform === "x"
      ? ["hookStopPower", "valueDensity", "voiceFormatFit", "replyBait"]
      : ["hookLabelPower", "scannability", "identityPolarity", "replyBait"]
  const scores = Object.fromEntries(
    keys.map((key) => [
      key,
      Math.max(0, Math.min(10, Math.round(Number(rawScores[key]) || 0))),
    ])
  ) as Partial<XBenchmarkScores>
  const overall =
    Math.round(
      (keys.reduce((sum, key) => sum + (scores[key] ?? 0), 0) / keys.length) *
        10
    ) / 10
  return {
    scores: {
      hookStopPower: 0,
      valueDensity: 0,
      voiceFormatFit: 0,
      hookLabelPower: 0,
      scannability: 0,
      identityPolarity: 0,
      replyBait: 0,
      ...scores,
      overall,
    },
    rationales: Object.fromEntries(
      keys.map((key) => [key, clean(rawRationales[key])])
    ),
    model,
    inputHash,
    gradedAt: new Date().toISOString(),
  }
}

function normalizeCorpus(value: unknown): XBenchmarkCorpusRecord | null {
  if (!isRecord(value) || !clean(value.id)) return null
  const platform = value.platform === "threads" ? "threads" : "x"
  const text = clean(value.text)
  const texts = Array.isArray(value.texts)
    ? value.texts.map(clean).filter(Boolean)
    : undefined
  if (!text && !texts?.length) return null
  return {
    id: clean(value.id),
    platform,
    niche: clean(value.niche),
    author: clean(value.author),
    sourceUrl: clean(value.sourceUrl) || undefined,
    text: text || undefined,
    texts,
    archetype: clean(value.archetype) || undefined,
    metrics: isRecord(value.metrics)
      ? (value.metrics as XBenchmarkCorpusRecord["metrics"])
      : {},
    lift: Number(value.lift) || undefined,
    grade: isRecord(value.grade) ? (value.grade as XBenchmarkGrade) : undefined,
    notes: Array.isArray(value.notes)
      ? value.notes.map(clean).filter(Boolean)
      : [],
    createdAt: clean(value.createdAt) || new Date().toISOString(),
  }
}

function normalizeGenerated(value: unknown): XGeneratedBenchmark | null {
  if (
    !isRecord(value) ||
    !clean(value.id) ||
    !clean(value.runId) ||
    !isRecord(value.grade)
  )
    return null
  return value as unknown as XGeneratedBenchmark
}

function corpusText(item: XBenchmarkCorpusRecord) {
  return item.text || item.texts?.join(" ") || ""
}

function tokens(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])
}

function overlap(a: Set<string>, b: Set<string>) {
  let score = 0
  for (const token of a) if (b.has(token)) score += 1
  return score
}
