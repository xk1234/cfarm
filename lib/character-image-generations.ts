import path from "node:path"

import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import type { CharacterImageGenerationRecord, CharacterPromptAttachment } from "@/lib/realfarm-character-ui"

export type StoredCharacterImageGenerationRecord = CharacterImageGenerationRecord & {
  characterId?: number
}

const defaultRootDir = path.join(process.cwd(), "data", "characters")
const dbFileName = "images.json"

export async function listCharacterImageGenerations(input: {
  rootDir?: string
  characterId?: number
} = {}) {
  const records = await readCharacterImageGenerations(input.rootDir)
  return records.filter((record) => input.characterId === undefined || record.characterId === input.characterId)
}

export async function upsertCharacterImageGeneration(input: StoredCharacterImageGenerationRecord & {
  rootDir?: string
}) {
  const rootDir = input.rootDir ?? defaultRootDir
  const record = normalizeGeneration(input)
  const records = await readCharacterImageGenerations(rootDir)
  const next = [record, ...records.filter((item) => item.id !== record.id)]
  await writeCharacterImageGenerations(rootDir, next)
  return record
}

async function readCharacterImageGenerations(rootDir = defaultRootDir): Promise<StoredCharacterImageGenerationRecord[]> {
  return readJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "generations",
    normalize: (record: StoredCharacterImageGenerationRecord) => {
      const normalized = normalizeGeneration(record)
      return normalized.imageUrl ? normalized : null
    },
  })
}

async function writeCharacterImageGenerations(rootDir: string, records: StoredCharacterImageGenerationRecord[]) {
  await writeJsonArrayStore({ rootDir, fileName: dbFileName, key: "generations", records })
}

function normalizeGeneration(record: StoredCharacterImageGenerationRecord): StoredCharacterImageGenerationRecord {
  return {
    id: clean(record.id) || `${Date.now()}`,
    characterId: typeof record.characterId === "number" && Number.isFinite(record.characterId) ? record.characterId : undefined,
    prompt: clean(record.prompt),
    model: clean(record.model) || "Unknown model",
    createdAt: clean(record.createdAt) || new Date().toISOString(),
    attachments: normalizeAttachments(record.attachments),
    aspectRatio: clean(record.aspectRatio) || "9:16",
    status: record.status === "processing" || record.status === "failed" ? record.status : "ready",
    imageUrl: clean(record.imageUrl) || undefined,
    error: clean(record.error) || undefined,
    progress: numberValue(record.progress),
    videoUrl: clean(record.videoUrl) || undefined,
    videoModel: clean(record.videoModel) || undefined,
    videoStatus: record.videoStatus,
    videoError: clean(record.videoError) || undefined,
    videoProgress: numberValue(record.videoProgress),
  }
}

function normalizeAttachments(value: unknown): CharacterPromptAttachment[] {
  return Array.isArray(value)
    ? value.flatMap((attachment) => {
        if (!attachment || typeof attachment !== "object") {
          return []
        }
        const record = attachment as Partial<CharacterPromptAttachment>
        const label = clean(record.label)
        const url = clean(record.url)
        const kind = record.kind === "character_headshot" ? "character_headshot" : record.kind === "asset" ? "asset" : undefined
        return label && url && kind ? [{ label, url, kind }] : []
      })
    : []
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
