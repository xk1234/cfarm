import { clean, isRecord } from "@/lib/guards"
import { randomUUID } from "node:crypto"
import path from "node:path"

import { readJsonArrayStore, withJsonArrayStore } from "@/lib/json-store"
import { hookVariableNameFromLabel } from "@/lib/hook-variables"

export type WordCollectionSource = "manual" | "ai" | "research"

export type WordCollectionRecord = {
  id: string
  name: string
  description?: string
  words: string[]
  source: WordCollectionSource
  created_at: string
  updated_at: string
}

const defaultRootDir = path.join(process.cwd(), "data", "word-collections")
const fileName = "word-collections.json"

export async function listWordCollections(input: { rootDir?: string } = {}) {
  return readJsonArrayStore<WordCollectionRecord>({
    rootDir: input.rootDir ?? defaultRootDir,
    fileName,
    key: "collections",
    normalize: normalizeWordCollection,
  })
}

export async function upsertWordCollection(input: {
  rootDir?: string
  collection: Partial<WordCollectionRecord> & {
    name?: string
    words?: string[]
  }
}) {
  const now = new Date().toISOString()
  const source = input.collection
  const id =
    clean(source.id) ||
    hookVariableNameFromLabel(source.name) ||
    `word-collection-${randomUUID()}`
  if (id.toLowerCase() === "year") {
    throw new Error(
      "YEAR is a retired variable tag. Use the CURRENT_YEAR runtime variable instead."
    )
  }
  const nextCollection: WordCollectionRecord = {
    id,
    name: clean(source.name) || "Untitled word collection",
    description: clean(source.description) || undefined,
    words: normalizeWords(source.words),
    source: normalizeSource(source.source),
    created_at: clean(source.created_at) || now,
    updated_at: now,
  }

  return withJsonArrayStore<WordCollectionRecord, WordCollectionRecord>({
    rootDir: input.rootDir ?? defaultRootDir,
    fileName,
    key: "collections",
    normalize: normalizeWordCollection,
    update: (records) => {
      const index = records.findIndex((record) => record.id === id)
      const next = [...records]
      if (index >= 0) {
        next[index] = {
          ...next[index],
          ...nextCollection,
          created_at: next[index].created_at,
          updated_at: now,
        }
      } else {
        next.unshift(nextCollection)
      }
      return {
        records: next,
        result: index >= 0 ? next[index] : nextCollection,
      }
    },
  })
}

export async function deleteWordCollection(input: {
  rootDir?: string
  id: string
}) {
  const id = clean(input.id)
  if (!id) {
    return null
  }
  return withJsonArrayStore<WordCollectionRecord, WordCollectionRecord | null>({
    rootDir: input.rootDir ?? defaultRootDir,
    fileName,
    key: "collections",
    normalize: normalizeWordCollection,
    update: (records) => {
      const deleted = records.find((record) => record.id === id) ?? null
      return {
        records: records.filter((record) => record.id !== id),
        result: deleted,
      }
    },
  })
}

function normalizeWordCollection(
  raw: WordCollectionRecord
): WordCollectionRecord | null {
  const record: Record<string, unknown> = isRecord(raw) ? raw : {}
  const id = clean(record.id) || `word-collection-${randomUUID()}`
  // Old workspaces stored the current year as a one-item random collection.
  // Keep that retired record out of every variable picker; legacy [[YEAR]]
  // references are resolved and migrated by hook-variables.ts.
  if (id.toLowerCase() === "year") return null
  const now = new Date().toISOString()
  const words = normalizeWords(record.words)
  return {
    id,
    name: clean(record.name) || id,
    description: clean(record.description) || undefined,
    words,
    source: normalizeSource(record.source),
    created_at: clean(record.created_at) || now,
    updated_at: clean(record.updated_at) || now,
  } satisfies WordCollectionRecord
}

function normalizeWords(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }
  const seen = new Set<string>()
  return value.map(clean).filter((word) => {
    if (!word || seen.has(word.toLowerCase())) {
      return false
    }
    seen.add(word.toLowerCase())
    return true
  })
}

function normalizeSource(value: unknown): WordCollectionSource {
  return value === "ai" || value === "research" ? value : "manual"
}
