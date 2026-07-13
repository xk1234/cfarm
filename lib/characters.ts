import { clean } from "@/lib/guards"
import path from "node:path"

import { deleteAssetFromAppwrite } from "@/lib/asset-storage"
import { deleteCharacterImageGenerationsForCharacter } from "@/lib/character-image-generations"
import {
  defaultCharacterAttributes,
  normalizeCharacterAttributes,
  type Character,
} from "@/lib/character-model"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import { getCurrentUser } from "@/lib/auth"

// Character, defaults, and normalization live in one place (character-model);
// re-exported here so existing `@/lib/characters` importers keep working.
export {
  defaultCharacterAttributes,
  normalizeCharacterAttributes,
  type Character,
}

export type CharacterRecord = {
  ownerId?: string
  id: string
  user_id: string
  name: string
  attributes: Character
  collection_id: string | null
  created_at: string
  updated_at: string
  preview_url: string
}

export type CharacterPayload = {
  id?: string
  name: string
  attributes: Character
  preview_url?: string
}

const CHARACTERS_DB_PATH = path.join(process.cwd(), "data", "characters.json")
export async function listCharacters(): Promise<CharacterRecord[]> {
  return readCharactersFile()
}

export async function saveCharacter(
  payload: CharacterPayload
): Promise<CharacterRecord> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Authentication is required to save a character")
  const current = await readCharactersFile()
  const now = new Date().toISOString()
  const existing = payload.id
    ? current.find((character) => character.id === payload.id)
    : undefined
  const character: CharacterRecord = {
    id: existing?.id ?? `${Date.now()}`,
    user_id: user.$id,
    ownerId: user.$id,
    name: payload.name,
    attributes: normalizeCharacterAttributes({
      ...payload.attributes,
      name: payload.name,
    }),
    collection_id: existing?.collection_id ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    preview_url: payload.preview_url ?? existing?.preview_url ?? "",
  }
  const next = existing
    ? current.map((item) => (item.id === existing.id ? character : item))
    : [character, ...current]

  await writeCharactersFile(next)
  return character
}

export async function deleteCharacter(id: string) {
  const current = await readCharactersFile()
  const deleted = current.find((character) => character.id === id) ?? null
  const next = current.filter((character) => character.id !== id)
  await writeCharactersFile(next)
  const deletedPreviewFiles = deleted
    ? await deleteUnusedCharacterFiles([deleted], next)
    : 0
  const deletedGenerations = deleted
    ? await deleteCharacterImageGenerationsForCharacter({ characterId: id })
    : { deleted: 0, deletedFiles: 0 }
  return {
    deleted: current.length !== next.length,
    deletedFiles: deletedPreviewFiles + deletedGenerations.deletedFiles,
  }
}

async function readCharactersFile() {
  return readJsonArrayStore({
    rootDir: path.dirname(CHARACTERS_DB_PATH),
    fileName: path.basename(CHARACTERS_DB_PATH),
    key: "characters",
    normalize: (character: CharacterRecord) => ({
      ...character,
      id: String(character.id), // coerce legacy numeric ids to string
      attributes: normalizeCharacterAttributes({
        ...character.attributes,
        name: character.name,
      }),
    }),
  })
}

async function writeCharactersFile(characters: CharacterRecord[]) {
  await writeJsonArrayStore({
    rootDir: path.dirname(CHARACTERS_DB_PATH),
    fileName: path.basename(CHARACTERS_DB_PATH),
    key: "characters",
    records: characters,
  })
}

async function deleteUnusedCharacterFiles(
  deletedCharacters: CharacterRecord[],
  remainingCharacters: CharacterRecord[]
) {
  const remainingUrls = new Set(
    remainingCharacters
      .map((character) => clean(character.preview_url))
      .filter(Boolean)
  )
  const filePaths = new Map<string, string>()

  for (const character of deletedCharacters) {
    const previewUrl = clean(character.preview_url)
    if (remainingUrls.has(previewUrl)) {
      continue
    }
    const filePath = localCharacterFilePath(previewUrl)
    if (filePath) {
      filePaths.set(filePath, previewUrl)
    }
  }

  for (const filePath of filePaths.keys()) {
    await deleteAssetFromAppwrite(filePath)
  }

  return filePaths.size
}

function localCharacterFilePath(assetUrl: string) {
  const prefix = "/api/local-assets/characters/"
  if (!assetUrl.startsWith(prefix)) {
    return null
  }

  const encodedRelativePath = assetUrl
    .slice("/api/local-assets/".length)
    .split(/[?#]/)[0]
  let relativePath = ""
  try {
    relativePath = encodedRelativePath
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join(path.sep)
  } catch {
    return null
  }

  if (!relativePath || path.isAbsolute(relativePath)) {
    return null
  }

  const dataRoot = path.resolve(process.cwd(), "data")
  const filePath = path.resolve(dataRoot, relativePath)
  return filePath.startsWith(`${dataRoot}${path.sep}`) ? filePath : null
}
