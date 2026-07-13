import { clean } from "@/lib/guards"
import path from "node:path"

import { deleteAssetFromAppwrite } from "@/lib/asset-storage"
import { localCharacterGenerationFilePath } from "@/lib/character-generation-paths"
import {
  deleteCharacterVideoGenerationForGeneration,
  deleteCharacterVideoGenerationsForCharacter,
} from "@/lib/character-video-generations"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import {
  characterWorkflowOptions,
  type CharacterImageGenerationRecord,
  type CharacterPromptAttachment,
  type CharacterWorkflowKey,
  type CharacterWorkflowMetadata,
} from "@/lib/realfarm-character-ui"

export type StoredCharacterImageGenerationRecord =
  CharacterImageGenerationRecord & {
    ownerId?: string
    characterId?: string
  }

const defaultRootDir = path.join(process.cwd(), "data", "characters")
const dbFileName = "images.json"

export async function listCharacterImageGenerations(
  input: {
    rootDir?: string
    characterId?: string
  } = {}
) {
  const records = await readCharacterImageGenerations(input.rootDir)
  return records.filter(
    (record) =>
      input.characterId === undefined ||
      record.characterId === input.characterId
  )
}

export async function upsertCharacterImageGeneration(
  input: StoredCharacterImageGenerationRecord & {
    rootDir?: string
  }
) {
  const rootDir = input.rootDir ?? defaultRootDir
  const record = normalizeGeneration(input)
  const records = await readCharacterImageGenerations(rootDir)
  const next = [record, ...records.filter((item) => item.id !== record.id)]
  await writeCharacterImageGenerations(rootDir, next)
  return record
}

export async function deleteCharacterImageGenerationsForCharacter(input: {
  rootDir?: string
  characterId: string
}) {
  const rootDir = input.rootDir ?? defaultRootDir
  const records = await readCharacterImageGenerations(rootDir)
  const deleted = records.filter(
    (record) => record.characterId === input.characterId
  )
  if (deleted.length === 0) {
    return { deleted: 0, deletedFiles: 0 }
  }

  const next = records.filter(
    (record) => record.characterId !== input.characterId
  )
  await writeCharacterImageGenerations(rootDir, next)
  const deletedFiles = await deleteUnusedGenerationFiles(rootDir, deleted, next)
  const videoCleanup = await deleteCharacterVideoGenerationsForCharacter({
    rootDir,
    characterId: input.characterId,
  })
  return {
    deleted: deleted.length,
    deletedFiles: deletedFiles + videoCleanup.deletedFiles,
  }
}

export async function deleteCharacterImageGeneration(input: {
  rootDir?: string
  id: string
}) {
  const rootDir = input.rootDir ?? defaultRootDir
  const id = clean(input.id)
  if (!id) {
    return { deleted: false, deletedFiles: 0 }
  }
  const records = await readCharacterImageGenerations(rootDir)
  const deleted = records.filter((record) => record.id === id)
  if (deleted.length === 0) {
    return { deleted: false, deletedFiles: 0 }
  }

  const next = records.filter((record) => record.id !== id)
  await writeCharacterImageGenerations(rootDir, next)
  const deletedFiles = await deleteUnusedGenerationFiles(rootDir, deleted, next)
  const videoCleanup = await deleteCharacterVideoGenerationForGeneration({
    rootDir,
    generationIds: [id],
  })
  return {
    deleted: true,
    deletedFiles: deletedFiles + videoCleanup.deletedFiles,
  }
}

async function readCharacterImageGenerations(
  rootDir = defaultRootDir
): Promise<StoredCharacterImageGenerationRecord[]> {
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

async function writeCharacterImageGenerations(
  rootDir: string,
  records: StoredCharacterImageGenerationRecord[]
) {
  await writeJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "generations",
    records,
  })
}

function normalizeGeneration(
  record: StoredCharacterImageGenerationRecord
): StoredCharacterImageGenerationRecord {
  return {
    id: clean(record.id) || `${Date.now()}`,
    characterId:
      record.characterId != null && String(record.characterId).trim()
        ? String(record.characterId)
        : undefined,
    prompt: clean(record.prompt),
    model: clean(record.model) || "Unknown model",
    createdAt: clean(record.createdAt) || new Date().toISOString(),
    attachments: normalizeAttachments(record.attachments),
    aspectRatio: clean(record.aspectRatio) || "9:16",
    status:
      record.status === "processing" || record.status === "failed"
        ? record.status
        : "ready",
    imageUrl: clean(record.imageUrl) || undefined,
    error: clean(record.error) || undefined,
    progress: numberValue(record.progress),
    workflow: normalizeWorkflow(record.workflow),
    workflowLabel: clean(record.workflowLabel) || undefined,
    workflowMetadata: normalizeWorkflowMetadata(record.workflowMetadata),
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
        const kind =
          record.kind === "character_headshot"
            ? "character_headshot"
            : record.kind === "asset"
              ? "asset"
              : undefined
        return label && url && kind ? [{ label, url, kind }] : []
      })
    : []
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function normalizeWorkflow(value: unknown): CharacterWorkflowKey | undefined {
  const workflow = clean(value)
  return characterWorkflowOptions.some((option) => option.key === workflow)
    ? (workflow as CharacterWorkflowKey)
    : undefined
}

function normalizeWorkflowMetadata(
  value: unknown
): CharacterWorkflowMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  const record = value as Partial<CharacterWorkflowMetadata>
  const workflow = normalizeWorkflow(record.workflow)
  const workflowLabel = clean(record.workflowLabel)
  if (!workflow || !workflowLabel) {
    return undefined
  }
  return {
    workflow,
    workflowLabel,
    recipe:
      record.recipe &&
      typeof record.recipe === "object" &&
      !Array.isArray(record.recipe)
        ? (record.recipe as Record<string, unknown>)
        : undefined,
    note: clean(record.note) || undefined,
  }
}

async function deleteUnusedGenerationFiles(
  rootDir: string,
  deletedRecords: StoredCharacterImageGenerationRecord[],
  remainingRecords: StoredCharacterImageGenerationRecord[]
) {
  const remainingUrls = new Set(
    remainingRecords.flatMap((record) => generationOutputUrls(record))
  )
  const filePaths = new Set<string>()

  for (const record of deletedRecords) {
    for (const url of generationOutputUrls(record)) {
      const normalizedUrl = clean(url)
      if (!normalizedUrl || remainingUrls.has(normalizedUrl)) {
        continue
      }
      const filePath = localCharacterGenerationFilePath(rootDir, normalizedUrl)
      if (filePath) {
        filePaths.add(filePath)
      }
    }
  }

  await Promise.all(
    [...filePaths].map((filePath) => deleteAssetFromAppwrite(filePath))
  )
  return filePaths.size
}

function generationOutputUrls(record: StoredCharacterImageGenerationRecord) {
  return [record.imageUrl, generatedWorkflowRecipeUrl(record, "rawVideoUrl")]
    .map(clean)
    .filter(Boolean)
}

function generatedWorkflowRecipeUrl(
  record: StoredCharacterImageGenerationRecord,
  key: string
) {
  const recipe = record.workflowMetadata?.recipe
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
    return ""
  }
  const value = recipe[key]
  return typeof value === "string" ? value : ""
}
