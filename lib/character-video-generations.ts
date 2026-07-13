import path from "node:path"

import { deleteAssetFromAppwrite } from "@/lib/asset-storage"
import { localCharacterGenerationFilePath } from "@/lib/character-generation-paths"
import { clean } from "@/lib/guards"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import type {
  CharacterVideoGeneration,
  CharacterVideoStatus,
} from "@/lib/realfarm-character-ui"

// A character video generation is stored on its own, keyed by the image
// `generationId` it animates (1:1). `id` mirrors `generationId` so the shared
// json-store derives a stable Appwrite row id per video.
export type StoredCharacterVideoGeneration = CharacterVideoGeneration & {
  ownerId?: string
  id: string
  characterId?: string
}

const defaultRootDir = path.join(process.cwd(), "data", "characters")
const dbFileName = "videos.json"

export async function listCharacterVideoGenerations(
  input: {
    rootDir?: string
    characterId?: string
  } = {}
): Promise<StoredCharacterVideoGeneration[]> {
  const records = await readVideoGenerations(input.rootDir)
  return records.filter(
    (record) =>
      input.characterId === undefined ||
      record.characterId === input.characterId
  )
}

export async function upsertCharacterVideoGeneration(
  input: Omit<StoredCharacterVideoGeneration, "id"> & { rootDir?: string }
): Promise<StoredCharacterVideoGeneration> {
  const rootDir = input.rootDir ?? defaultRootDir
  const record = normalizeVideoGeneration(input)
  const records = await readVideoGenerations(rootDir)
  const next = [
    record,
    ...records.filter((item) => item.generationId !== record.generationId),
  ]
  await writeVideoGenerations(rootDir, next)
  return record
}

export async function deleteCharacterVideoGenerationsForCharacter(input: {
  rootDir?: string
  characterId: string
}) {
  const rootDir = input.rootDir ?? defaultRootDir
  const records = await readVideoGenerations(rootDir)
  const deleted = records.filter(
    (record) => record.characterId === input.characterId
  )
  if (deleted.length === 0) {
    return { deleted: 0, deletedFiles: 0 }
  }
  const next = records.filter(
    (record) => record.characterId !== input.characterId
  )
  await writeVideoGenerations(rootDir, next)
  const deletedFiles = await deleteUnusedVideoFiles(rootDir, deleted, next)
  return { deleted: deleted.length, deletedFiles }
}

/** Remove the video attached to a given image generation (used on cascade delete). */
export async function deleteCharacterVideoGenerationForGeneration(input: {
  rootDir?: string
  generationIds: string[]
}) {
  const rootDir = input.rootDir ?? defaultRootDir
  const ids = new Set(
    input.generationIds.map((id) => clean(id)).filter(Boolean)
  )
  if (ids.size === 0) {
    return { deleted: 0, deletedFiles: 0 }
  }
  const records = await readVideoGenerations(rootDir)
  const deleted = records.filter((record) => ids.has(record.generationId))
  if (deleted.length === 0) {
    return { deleted: 0, deletedFiles: 0 }
  }
  const next = records.filter((record) => !ids.has(record.generationId))
  await writeVideoGenerations(rootDir, next)
  const deletedFiles = await deleteUnusedVideoFiles(rootDir, deleted, next)
  return { deleted: deleted.length, deletedFiles }
}

async function readVideoGenerations(
  rootDir = defaultRootDir
): Promise<StoredCharacterVideoGeneration[]> {
  return readJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "videos",
    normalize: (record: StoredCharacterVideoGeneration) => {
      const normalized = normalizeVideoGeneration(record)
      return normalized.generationId ? normalized : null
    },
  })
}

async function writeVideoGenerations(
  rootDir: string,
  records: StoredCharacterVideoGeneration[]
) {
  await writeJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "videos",
    records,
  })
}

function normalizeVideoGeneration(
  record: Omit<StoredCharacterVideoGeneration, "id"> & { id?: string }
): StoredCharacterVideoGeneration {
  const generationId = clean(record.generationId)
  return {
    id: generationId,
    generationId,
    characterId:
      record.characterId != null && String(record.characterId).trim()
        ? String(record.characterId)
        : undefined,
    videoUrl: clean(record.videoUrl) || undefined,
    model: clean(record.model) || undefined,
    status: normalizeStatus(record.status),
    error: clean(record.error) || undefined,
    progress: numberValue(record.progress),
    createdAt: clean(record.createdAt) || new Date().toISOString(),
  }
}

function normalizeStatus(value: unknown): CharacterVideoStatus {
  return value === "idle" ||
    value === "processing" ||
    value === "ready" ||
    value === "failed"
    ? value
    : "idle"
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

async function deleteUnusedVideoFiles(
  rootDir: string,
  deletedRecords: StoredCharacterVideoGeneration[],
  remainingRecords: StoredCharacterVideoGeneration[]
) {
  const remainingUrls = new Set(
    remainingRecords.map((record) => clean(record.videoUrl)).filter(Boolean)
  )
  const filePaths = new Set<string>()
  for (const record of deletedRecords) {
    const url = clean(record.videoUrl)
    if (!url || remainingUrls.has(url)) {
      continue
    }
    const filePath = localCharacterGenerationFilePath(rootDir, url)
    if (filePath) {
      filePaths.add(filePath)
    }
  }
  await Promise.all(
    [...filePaths].map((filePath) => deleteAssetFromAppwrite(filePath))
  )
  return filePaths.size
}
