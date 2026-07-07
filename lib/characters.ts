import { rm } from "node:fs/promises"
import path from "node:path"

import { deleteCharacterImageGenerationsForCharacter } from "@/lib/character-image-generations"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

export type Character = {
  name: string
  age: number
  ethnicity: string
  gender: string

  hair: {
    length: string
    texture: string
    color: string
    highlights?: string
    style: string
    part?: string
  }

  eyes: {
    color: string
    shape: string
    details: string
  }

  facial_features: {
    face_shape: string
    forehead: string
    jawline: string
    chin: string
    cheekbones: string
    nose: string
    lips: string
    eyebrows: string
    other_distinctive_features?: string
  }

  skin: {
    tone: string
    undertone: string
    texture: string
    visible_details: string
  }

  build: {
    body_type: string
    height_impression?: string
  }

  clothing: {
    outfit_description: string
    top?: string
    bottoms?: string
    footwear?: string
    makeup?: string
  }

  posture_and_mannerisms: {
    posture: string
    body_language: string
    gestures: string
  }

  emotional_baseline: {
    primary_emotion: string
    demeanor: string
    communication_style: string
  }

  accessories: {
    visible_accessories: string[]
    no_visible_accessories?: boolean
  }

  voice: {
    tone: string
    clarity: string
    vocal_quality: string
    speech_patterns: string
  }
}

export type CharacterRecord = {
  id: number
  user_id: string
  name: string
  attributes: Character
  collection_id: string | null
  created_at: string
  updated_at: string
  preview_url: string
}

export type CharacterPayload = {
  id?: number
  name: string
  attributes: Character
  preview_url?: string
}

const CHARACTERS_DB_PATH = path.join(process.cwd(), "data", "characters.json")
const USER_ID = "103073708745629128582"

export const defaultCharacterAttributes: Character = {
  name: "UU's character 1",
  age: 45,
  ethnicity: "somali",
  gender: "male",
  hair: {
    length: "waist-length",
    texture: "sleek",
    color: "gray",
    highlights: "sun-bleached",
    style: "slicked-back",
    part: "center",
  },
  eyes: {
    color: "black",
    shape: "deep-set",
    details: "slight circles",
  },
  facial_features: {
    face_shape: "wide",
    forehead: "average",
    jawline: "rounded",
    chin: "square",
    cheekbones: "prominent",
    nose: "button",
    lips: "wide",
    eyebrows: "feathered",
    other_distinctive_features: "chin dimple, small facial scar",
  },
  skin: {
    tone: "somali",
    undertone: "warm",
    texture: "dewy",
    visible_details: "moderate freckles, one beauty mark",
  },
  build: {
    body_type: "athletic",
    height_impression: "very-short",
  },
  clothing: {
    outfit_description: "dark-academia styling with mixed-metal jewelry",
    top: "dark shirt",
    bottoms: "tailored trousers",
    footwear: "minimal shoes",
    makeup: "none",
  },
  posture_and_mannerisms: {
    posture: "upright",
    body_language: "calm and composed",
    gestures: "measured hand movement",
  },
  emotional_baseline: {
    primary_emotion: "calm",
    demeanor: "confident",
    communication_style: "direct and grounded",
  },
  accessories: {
    visible_accessories: ["mixed-metals"],
    no_visible_accessories: false,
  },
  voice: {
    tone: "warm",
    clarity: "clear",
    vocal_quality: "steady",
    speech_patterns: "natural conversational pacing",
  },
}

export async function listCharacters(): Promise<CharacterRecord[]> {
  return readCharactersFile()
}

export async function saveCharacter(payload: CharacterPayload): Promise<CharacterRecord> {
  const current = await readCharactersFile()
  const now = new Date().toISOString()
  const existing = payload.id ? current.find((character) => character.id === payload.id) : undefined
  const character: CharacterRecord = {
    id: existing?.id ?? Date.now(),
    user_id: USER_ID,
    name: payload.name,
    attributes: normalizeCharacterAttributes({ ...payload.attributes, name: payload.name }),
    collection_id: existing?.collection_id ?? null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    preview_url: payload.preview_url ?? existing?.preview_url ?? "",
  }
  const next = existing
    ? current.map((item) => item.id === existing.id ? character : item)
    : [character, ...current]

  await writeCharactersFile(next)
  return character
}

export async function deleteCharacter(id: number) {
  const current = await readCharactersFile()
  const deleted = current.find((character) => character.id === id) ?? null
  const next = current.filter((character) => character.id !== id)
  await writeCharactersFile(next)
  const deletedPreviewFiles = deleted ? await deleteUnusedCharacterFiles([deleted], next) : 0
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

async function deleteUnusedCharacterFiles(deletedCharacters: CharacterRecord[], remainingCharacters: CharacterRecord[]) {
  const remainingUrls = new Set(remainingCharacters.map((character) => clean(character.preview_url)).filter(Boolean))
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
    await rm(filePath, { force: true })
  }

  return filePaths.size
}

function localCharacterFilePath(assetUrl: string) {
  const prefix = "/api/local-assets/characters/"
  if (!assetUrl.startsWith(prefix)) {
    return null
  }

  const encodedRelativePath = assetUrl.slice("/api/local-assets/".length).split(/[?#]/)[0]
  let relativePath = ""
  try {
    relativePath = encodedRelativePath.split("/").map((part) => decodeURIComponent(part)).join(path.sep)
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

export function normalizeCharacterAttributes(input: unknown): Character {
  const raw = isRecord(input) ? input : {}
  const hasNestedShape = ["hair", "eyes", "facial_features", "skin", "build", "clothing"].some((key) => isRecord(raw[key]))
  const base = structuredClone(defaultCharacterAttributes)

  if (hasNestedShape) {
    return mergeCharacter(base, raw)
  }

  const flat = raw as Record<string, unknown>
  return mergeCharacter(base, {
    name: stringValue(flat.name, base.name),
    gender: stringValue(flat.gender, base.gender),
    age: numberValue(flat.age, base.age),
    ethnicity: stringValue(flat.ethnicity, base.ethnicity),
    hair: {
      length: stringValue(flat.hairLength, base.hair.length),
      texture: stringValue(flat.hairTexture, base.hair.texture),
      color: stringValue(flat.hairColor, base.hair.color),
      highlights: stringValue(flat.hairHighlights, base.hair.highlights),
      style: stringValue(flat.hairStyle, base.hair.style),
    },
    eyes: {
      color: stringValue(flat.eyeColor, base.eyes.color),
      shape: stringValue(flat.eyeShape, base.eyes.shape),
      details: stringValue(flat.underEyes, base.eyes.details),
    },
    facial_features: {
      face_shape: stringValue(flat.faceShape, base.facial_features.face_shape),
      forehead: stringValue(flat.forehead, base.facial_features.forehead),
      jawline: stringValue(flat.jawline, base.facial_features.jawline),
      chin: stringValue(flat.chin, base.facial_features.chin),
      cheekbones: stringValue(flat.cheekbones, base.facial_features.cheekbones),
      nose: stringValue(flat.noseShape, base.facial_features.nose),
      lips: stringValue(flat.lipShape, base.facial_features.lips),
      eyebrows: stringValue(flat.eyebrowShape, base.facial_features.eyebrows),
      other_distinctive_features: [
        stringValue(flat.dimples, ""),
        stringValue(flat.scars, ""),
        stringValue(flat.birthmarks, ""),
        stringValue(flat.teethGap, ""),
      ].filter((value) => value && value !== "none").join(", ") || base.facial_features.other_distinctive_features,
    },
    skin: {
      tone: stringValue(flat.skinTone, base.skin.tone),
      texture: stringValue(flat.skinClarity, base.skin.texture),
      visible_details: [
        stringValue(flat.freckles, ""),
        stringValue(flat.moles, ""),
      ].filter((value) => value && value !== "none").join(", ") || base.skin.visible_details,
    },
    build: {
      body_type: stringValue(flat.bodyType, base.build.body_type),
      height_impression: stringValue(flat.heightImpression, base.build.height_impression),
    },
    clothing: {
      outfit_description: stringValue(flat.styleAesthetic, base.clothing.outfit_description),
    },
    accessories: {
      visible_accessories: [
        stringValue(flat.glasses, ""),
        stringValue(flat.defaultJewelry, ""),
        stringValue(flat.defaultHeadwear, ""),
        stringValue(flat.piercings, ""),
        stringValue(flat.tattoos, ""),
      ].filter((value) => value && value !== "none"),
    },
  })
}

function mergeCharacter(base: Character, raw: Record<string, unknown>): Character {
  return {
    ...base,
    name: stringValue(raw.name, base.name),
    age: numberValue(raw.age, base.age),
    ethnicity: stringValue(raw.ethnicity, base.ethnicity),
    gender: stringValue(raw.gender, base.gender),
    hair: { ...base.hair, ...(isRecord(raw.hair) ? stringRecord(raw.hair) : {}) },
    eyes: { ...base.eyes, ...(isRecord(raw.eyes) ? stringRecord(raw.eyes) : {}) },
    facial_features: { ...base.facial_features, ...(isRecord(raw.facial_features) ? stringRecord(raw.facial_features) : {}) },
    skin: { ...base.skin, ...(isRecord(raw.skin) ? stringRecord(raw.skin) : {}) },
    build: { ...base.build, ...(isRecord(raw.build) ? stringRecord(raw.build) : {}) },
    clothing: { ...base.clothing, ...(isRecord(raw.clothing) ? stringRecord(raw.clothing) : {}) },
    posture_and_mannerisms: { ...base.posture_and_mannerisms, ...(isRecord(raw.posture_and_mannerisms) ? stringRecord(raw.posture_and_mannerisms) : {}) },
    emotional_baseline: { ...base.emotional_baseline, ...(isRecord(raw.emotional_baseline) ? stringRecord(raw.emotional_baseline) : {}) },
    accessories: {
      ...base.accessories,
      ...(isRecord(raw.accessories) ? {
        ...stringRecord(raw.accessories),
        visible_accessories: Array.isArray(raw.accessories.visible_accessories)
          ? raw.accessories.visible_accessories.filter((item): item is string => typeof item === "string")
          : base.accessories.visible_accessories,
        no_visible_accessories: typeof raw.accessories.no_visible_accessories === "boolean"
          ? raw.accessories.no_visible_accessories
          : base.accessories.no_visible_accessories,
      } : {}),
    },
    voice: { ...base.voice, ...(isRecord(raw.voice) ? stringRecord(raw.voice) : {}) },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function stringValue(value: unknown, fallback = "") {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number") {
    return String(value)
  }
  return fallback
}

function numberValue(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const ageMatch = value.match(/\d+/)
    if (ageMatch) {
      return Number(ageMatch[0])
    }
  }
  return fallback
}

function stringRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => typeof value === "string" || typeof value === "number")
      .map(([key, value]) => [key, String(value)])
  )
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
