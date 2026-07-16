import { randomUUID } from "node:crypto"
import path from "node:path"

import { clean, isRecord } from "@/lib/guards"
import { getAppwrite } from "@/lib/appwrite"
import {
  deleteJsonArrayRecord,
  readJsonArrayRecord,
  readJsonArrayStore,
  upsertJsonArrayRecord,
} from "@/lib/json-store"
import { enqueueJob } from "@/lib/queue"

export type KnowledgeBaseSourceKind =
  | "link"
  | "youtube"
  | "file"
  | "google"
  | "reddit"
  | "rss"
  | "twitter"
  | "tiktok"
export type KnowledgeBaseSourceMode = "research" | "realtime"
export type KnowledgeBaseSourceStatus =
  "idle" | "queued" | "processing" | "ready" | "error"
export type KnowledgeBaseExpiry = "0m" | "1h" | "24h" | "1w" | "1mo" | "1y"

export type KnowledgeChunk = {
  id: string
  sourceId: string
  text: string
  title?: string
  url?: string
  generatedAt: string
}

export type KnowledgeBaseSource = {
  id: string
  mode: KnowledgeBaseSourceMode
  kind: KnowledgeBaseSourceKind
  label: string
  value: string
  expiry: KnowledgeBaseExpiry
  enabled: boolean
  status: KnowledgeBaseSourceStatus
  lastScrapedAt?: string
  nextRefreshAt?: string
  error?: string
  storageFileId?: string
  fileName?: string
  mimeType?: string
  chunks: KnowledgeChunk[]
}

export type KnowledgeBaseRecord = {
  id: string
  name: string
  description: string
  status: "idle" | "refreshing" | "ready" | "error"
  sources: KnowledgeBaseSource[]
  compiledText: string
  createdAt: string
  updatedAt: string
  lastRefreshedAt?: string
}

const rootDir = path.join(process.cwd(), "data", "knowledge-bases")
const fileName = "knowledge-bases.json"

export async function listKnowledgeBases() {
  return readJsonArrayStore<KnowledgeBaseRecord>({
    rootDir,
    fileName,
    key: "knowledgeBases",
    normalize: normalizeKnowledgeBase,
  })
}

export async function getKnowledgeBase(id: string) {
  return readJsonArrayRecord<KnowledgeBaseRecord>({
    rootDir,
    fileName,
    key: "knowledgeBases",
    id,
    normalize: normalizeKnowledgeBase,
  })
}

export async function upsertKnowledgeBase(input: Partial<KnowledgeBaseRecord>) {
  const now = new Date().toISOString()
  const id = clean(input.id) || randomUUID()
  const previous = await getKnowledgeBase(id)
  const next = normalizeKnowledgeBase({
    ...(previous ?? {}),
    ...input,
    id,
    createdAt: previous?.createdAt ?? clean(input.createdAt) ?? now,
    updatedAt: now,
  } as KnowledgeBaseRecord)
  await upsertJsonArrayRecord({
    rootDir,
    fileName,
    key: "knowledgeBases",
    record: next,
  })
  return next
}

export async function deleteKnowledgeBase(id: string) {
  const deleted = await getKnowledgeBase(id)
  if (deleted) {
    await deleteJsonArrayRecord({
      rootDir,
      fileName,
      key: "knowledgeBases",
      id,
    })
  }
  const storage = getAppwrite()?.storage
  if (deleted && storage) {
    await Promise.all(
      deleted.sources
        .map((source) => source.storageFileId)
        .filter((fileId): fileId is string => Boolean(fileId))
        .map((fileId) =>
          storage
            .deleteFile("knowledge_base_files", fileId)
            .catch(() => undefined)
        )
    )
  }
  return deleted
}

export async function queueKnowledgeBaseRefresh(
  id: string,
  sourceIds?: string[]
) {
  const kb = await getKnowledgeBase(id)
  if (!kb) return null
  const selected = kb.sources.filter(
    (source) =>
      isRefreshableKnowledgeSource(source) &&
      (!sourceIds?.length || sourceIds.includes(source.id))
  )
  const queuedAt = new Date().toISOString()
  const updated = await upsertKnowledgeBase({
    ...kb,
    status: selected.length ? "refreshing" : kb.status,
    sources: kb.sources.map((source) =>
      selected.some((item) => item.id === source.id)
        ? { ...source, status: "queued", error: undefined }
        : source
    ),
  })
  await Promise.all(
    selected.map((source) =>
      enqueueJob({
        type: "refresh-knowledge-source",
        payload: {
          knowledgeBaseId: id,
          sourceId: source.id,
          requestedAt: queuedAt,
        },
        dedupeKey: `knowledge-source:${id}:${source.id}:${queuedAt}`,
        maxAttempts: 3,
      })
    )
  )
  return updated
}

export function isRefreshableKnowledgeSource(
  source: Pick<KnowledgeBaseSource, "mode" | "enabled">
) {
  return source.mode === "realtime" && source.enabled
}

export async function ensureHdbTrendsKnowledgeBase() {
  const existing = await listKnowledgeBases()
  if (existing.length) return existing
  const now = new Date().toISOString()
  const source = (
    mode: KnowledgeBaseSourceMode,
    kind: KnowledgeBaseSourceKind,
    label: string,
    value: string,
    expiry: KnowledgeBaseExpiry
  ): KnowledgeBaseSource => ({
    id: randomUUID(),
    mode,
    kind,
    label,
    value,
    expiry,
    enabled: true,
    status: "idle",
    chunks: [],
  })
  const seeded = await upsertKnowledgeBase({
    id: "hdb-property-trends",
    name: "HDB Property Trends",
    description:
      "Research and live reporting on Singapore HDB resale prices, supply, policy, and buyer sentiment.",
    status: "idle",
    sources: [
      source(
        "realtime",
        "link",
        "HDB resale statistics",
        "https://www.hdb.gov.sg/residential/selling-a-flat/overview/resale-statistics",
        "1mo"
      ),
      source(
        "realtime",
        "link",
        "HDB resale portal",
        "https://services2.hdb.gov.sg/webapp/BB33RTIS/",
        "24h"
      ),
      source(
        "realtime",
        "rss",
        "Google News: Singapore HDB resale",
        "https://news.google.com/rss/search?q=Singapore%20HDB%20resale%20prices&hl=en-SG&gl=SG&ceid=SG:en",
        "24h"
      ),
    ],
    compiledText: "",
    createdAt: now,
    updatedAt: now,
  })
  return [seeded]
}

export function knowledgeContext(
  records: KnowledgeBaseRecord[],
  ids: string[],
  maxChars = 30000
) {
  return records
    .filter((item) => ids.includes(item.id))
    .map((item) => `# ${item.name}\n${item.compiledText}`)
    .join("\n\n")
    .slice(0, maxChars)
}

export function knowledgeContextPrompt(context: string) {
  const value = clean(context)
  if (!value) return ""
  return `Use the following knowledge-base context as factual grounding. Do not claim facts outside it unless the prompt already supplies them.

Citation rules:
- Every generated slide text item containing a factual claim from the context must include a compact inline citation.
- Use only source names, publishers, titles, or URLs that appear in the context. Never invent attribution.
- Preserve the most specific source or publisher attribution supplied by the context and format it as a compact parenthetical citation.
- Keep citations inside the text item's word limit. A citation counts toward that limit.
- If the context does not support a requested claim, say the data is unavailable instead of filling the gap.

Knowledge-base context:
${value}`
}

export function expiryMilliseconds(expiry: KnowledgeBaseExpiry) {
  return {
    "0m": 0,
    "1h": 3_600_000,
    "24h": 86_400_000,
    "1w": 604_800_000,
    "1mo": 2_592_000_000,
    "1y": 31_536_000_000,
  }[expiry]
}

function normalizeKnowledgeBase(raw: KnowledgeBaseRecord): KnowledgeBaseRecord {
  const record: Partial<KnowledgeBaseRecord> = isRecord(raw) ? raw : {}
  const now = new Date().toISOString()
  const sources = Array.isArray(record.sources)
    ? (record.sources
        .map(normalizeSource)
        .filter(Boolean) as KnowledgeBaseSource[])
    : []
  return {
    id: clean(record.id) || randomUUID(),
    name: clean(record.name) || "Untitled knowledge base",
    description: clean(record.description),
    status:
      record.status === "refreshing" ||
      record.status === "ready" ||
      record.status === "error"
        ? record.status
        : "idle",
    sources,
    compiledText: clean(record.compiledText),
    createdAt: clean(record.createdAt) || now,
    updatedAt: clean(record.updatedAt) || now,
    lastRefreshedAt: clean(record.lastRefreshedAt) || undefined,
  }
}

function normalizeSource(value: unknown): KnowledgeBaseSource | null {
  if (!isRecord(value)) return null
  const kinds: KnowledgeBaseSourceKind[] = [
    "link",
    "youtube",
    "file",
    "google",
    "reddit",
    "rss",
    "twitter",
    "tiktok",
  ]
  const kind = kinds.includes(value.kind as KnowledgeBaseSourceKind)
    ? (value.kind as KnowledgeBaseSourceKind)
    : "link"
  const expiryValues: KnowledgeBaseExpiry[] = [
    "0m",
    "1h",
    "24h",
    "1w",
    "1mo",
    "1y",
  ]
  return {
    id: clean(value.id) || randomUUID(),
    mode: value.mode === "realtime" ? "realtime" : "research",
    kind,
    label: clean(value.label) || kind,
    value: clean(value.value),
    expiry: expiryValues.includes(value.expiry as KnowledgeBaseExpiry)
      ? (value.expiry as KnowledgeBaseExpiry)
      : "24h",
    enabled: value.enabled !== false,
    status:
      value.status === "queued" ||
      value.status === "processing" ||
      value.status === "ready" ||
      value.status === "error"
        ? value.status
        : "idle",
    lastScrapedAt: clean(value.lastScrapedAt) || undefined,
    nextRefreshAt: clean(value.nextRefreshAt) || undefined,
    error: clean(value.error) || undefined,
    storageFileId: clean(value.storageFileId) || undefined,
    fileName: clean(value.fileName) || undefined,
    mimeType: clean(value.mimeType) || undefined,
    chunks: Array.isArray(value.chunks)
      ? value.chunks
          .filter(isRecord)
          .map((chunk) => ({
            id: clean(chunk.id) || randomUUID(),
            sourceId: clean(chunk.sourceId),
            text: clean(chunk.text),
            title: clean(chunk.title) || undefined,
            url: clean(chunk.url) || undefined,
            generatedAt: clean(chunk.generatedAt) || new Date().toISOString(),
          }))
          .filter((chunk) => chunk.text)
      : [],
  }
}
