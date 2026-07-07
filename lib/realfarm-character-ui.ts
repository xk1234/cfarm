import { clean } from "@/lib/guards"
import {
  defaultCharacterAttributes,
  normalizeCharacterAttributes,
  type Character,
} from "@/lib/character-model"
import type { AssetRecord } from "@/lib/assets"
import type { CharacterRecord } from "@/lib/characters"
import {
  characterAttributeOptionsConfig,
  characterEditorFieldsConfig,
  characterEditorTabsConfig,
  characterImageAspectRatiosConfig,
  characterSummaryFieldsConfig,
  defaultCharacterHeadshotPromptConfig,
  defaultCharacterPreviewUrlConfig,
} from "@/lib/realfarm-character-ui-config"
import {
  characterImageEditModelOptions,
  characterImageGenerationModelOptions,
  characterImageActionModelOptions,
  characterImageToVideoModelOptions,
  characterUpscaleModelOptions,
  characterVideoGenerationModelOptions,
  defaultCharacterImageActionModel,
  defaultCharacterImageGenerationModel,
  defaultCharacterImageToVideoModel,
} from "@/lib/realfarm-generation-model-registry"

export type CharacterAttributes = Character

export const characterAttributeOptions = characterAttributeOptionsConfig

export const characterEditorTabs = characterEditorTabsConfig

export type CharacterEditorTab = (typeof characterEditorTabs)[number]

export const characterEditorFields = characterEditorFieldsConfig

export const characterSummaryFields = characterSummaryFieldsConfig

export const defaultCharacterPreviewUrl = defaultCharacterPreviewUrlConfig
export const defaultCharacterHeadshotPrompt =
  defaultCharacterHeadshotPromptConfig

export const imageGenerationModels = characterImageGenerationModelOptions

export const defaultImageGenerationModel: string =
  defaultCharacterImageGenerationModel

export const imageEditModels = characterImageEditModelOptions

export const imageActionModels = characterImageActionModelOptions

export const defaultImageActionModel: string = defaultCharacterImageActionModel

export const videoGenerationModels = characterVideoGenerationModelOptions

export const characterImageToVideoModels = characterImageToVideoModelOptions

export const defaultImageToVideoModel: string =
  defaultCharacterImageToVideoModel

export const upscaleModels = characterUpscaleModelOptions

export const characterGenerationModels: string[] = imageGenerationModels.map(
  (model) => model.label
)
export const characterImageAspectRatios = characterImageAspectRatiosConfig

export type ImportedCharacterPayload = {
  name?: string
  attributes: CharacterAttributes
  previewUrl?: string
  sourceImageDataUrl?: string
}

export type CharacterPromptAttachment = {
  label: string
  url: string
  kind: "character_headshot" | "asset"
}

export type CharacterWorkflowKey =
  | "free_generate"
  | "recreate_reference"
  | "build_modules"
  | "batch_photo_dump"
  | "tiktok_slideshow"
  | "product_ugc"
  | "animate_image"
  | "motion_control"
  | "seedream_bedroom_selfie"
  | "outfit_transfer"
  | "pose_variation_cut_video"

export type CharacterWorkflowOption = {
  key: CharacterWorkflowKey
  label: string
  description: string
  placeholder: string
}

export const characterWorkflowOptions: CharacterWorkflowOption[] = [
  {
    key: "free_generate",
    label: "Free Generate",
    description: "Create a scene from text.",
    placeholder: "Describe a scene, pose, outfit, background...",
  },
  {
    key: "recreate_reference",
    label: "Recreate Reference",
    description: "Use a reference for pose, camera, composition, and vibe.",
    placeholder: "Optional: describe what to change from the reference...",
  },
  {
    key: "build_modules",
    label: "Build From Modules",
    description: "Pick pose, outfit, camera, and background modules.",
    placeholder: "Describe extra details for the selected modules...",
  },
  {
    key: "batch_photo_dump",
    label: "Batch Photo Dump",
    description: "Generate a related lifestyle image set.",
    placeholder: "Describe the photo dump theme...",
  },
  {
    key: "tiktok_slideshow",
    label: "TikTok Slideshow",
    description: "Create a slide-by-slide UGC photo set.",
    placeholder: "Describe the slideshow topic, vibe, or story...",
  },
  {
    key: "product_ugc",
    label: "Product UGC",
    description: "Create ad-style images around a product and angle.",
    placeholder: "Describe the product angle, hook, or audience...",
  },
  {
    key: "animate_image",
    label: "Animate Image",
    description: "Start from a generated image and turn it into video.",
    placeholder: "Describe the source image or motion you want...",
  },
  {
    key: "motion_control",
    label: "Motion Control",
    description:
      "Apply a trending reference video's movement to this character.",
    placeholder: "Paste the trending video URL or describe motion changes...",
  },
  {
    key: "seedream_bedroom_selfie",
    label: "Seedream Selfie",
    description: "Generate a styled bedroom selfie from preset prompts.",
    placeholder: "Optional changes for the selected selfie preset...",
  },
  {
    key: "outfit_transfer",
    label: "Outfit Transfer",
    description: "Put the character into clothing from an outfit reference.",
    placeholder: "Optional clothing transfer notes...",
  },
  {
    key: "pose_variation_cut_video",
    label: "Pose Cut Video",
    description:
      "Create a pose variation, animate start/end frames, add cuts and music.",
    placeholder: "Optional notes for the pose variation video...",
  },
]

export const editCharacterWorkflowKeys: CharacterWorkflowKey[] = [
  "recreate_reference",
  "animate_image",
  "motion_control",
  "seedream_bedroom_selfie",
  "outfit_transfer",
  "pose_variation_cut_video",
]

export function getCharacterWorkflowMode(workflow: CharacterWorkflowKey) {
  return editCharacterWorkflowKeys.includes(workflow) ? "edit" : "create"
}

export function visibleCharacterWorkflowOptions(hasSourceGeneration: boolean) {
  return characterWorkflowOptions.filter((option) =>
    hasSourceGeneration
      ? true
      : getCharacterWorkflowMode(option.key) === "create"
  )
}

export type CharacterWorkflowMetadata = {
  workflow: CharacterWorkflowKey
  workflowLabel: string
  recipe?: Record<string, unknown>
  note?: string
}

export type CharacterImageGenerationRecord = {
  id: string
  prompt: string
  model: string
  createdAt: string
  attachments: CharacterPromptAttachment[]
  aspectRatio: string
  status: "processing" | "ready" | "failed"
  imageUrl?: string
  error?: string
  progress?: number
  videoUrl?: string
  videoModel?: string
  videoStatus?: "idle" | "processing" | "ready" | "failed"
  videoError?: string
  videoProgress?: number
  workflow?: CharacterWorkflowKey
  workflowLabel?: string
  workflowMetadata?: CharacterWorkflowMetadata
}

export function createCharacterImageGenerationRecord(input: {
  prompt: string
  attachments: CharacterPromptAttachment[]
  model?: string
  id?: string
  createdAt?: string
  aspectRatio?: string
  status?: CharacterImageGenerationRecord["status"]
  imageUrl?: string
  error?: string
  progress?: number
  videoUrl?: string
  videoModel?: string
  videoStatus?: CharacterImageGenerationRecord["videoStatus"]
  videoError?: string
  videoProgress?: number
  workflow?: CharacterWorkflowKey
  workflowLabel?: string
  workflowMetadata?: CharacterWorkflowMetadata
}): CharacterImageGenerationRecord {
  return {
    id: input.id ?? `${Date.now()}`,
    prompt: input.prompt,
    model: input.model?.trim() || defaultImageGenerationModel,
    createdAt: input.createdAt ?? new Date().toISOString(),
    attachments: input.attachments,
    aspectRatio: input.aspectRatio?.trim() || characterImageAspectRatios[0],
    status: input.status ?? "ready",
    imageUrl: input.imageUrl,
    error: input.error,
    progress: input.progress,
    videoUrl: input.videoUrl,
    videoModel: input.videoModel,
    videoStatus: input.videoStatus,
    videoError: input.videoError,
    videoProgress: input.videoProgress,
    workflow: input.workflow,
    workflowLabel: input.workflowLabel,
    workflowMetadata: input.workflowMetadata,
  }
}

export function characterGenerationPrimaryMedia(
  generation: Pick<
    CharacterImageGenerationRecord,
    "imageUrl" | "videoUrl" | "videoStatus"
  >
) {
  if (generation.videoUrl && generation.videoStatus !== "failed") {
    return { type: "video" as const, url: generation.videoUrl }
  }
  if (generation.imageUrl) {
    return { type: "image" as const, url: generation.imageUrl }
  }
  return null
}

export function buildCharacterPromptPackage(input: {
  userPrompt: string
  character: Pick<CharacterRecord, "name" | "preview_url" | "attributes">
  assets?: Pick<AssetRecord, "name" | "fileUrl">[]
}) {
  const character = input.character
  const attributes = normalizeCharacterAttributes({
    ...character.attributes,
    name: character.name,
  })
  const attachments: CharacterPromptAttachment[] = []
  const headshotUrl = clean(character.preview_url) || defaultCharacterPreviewUrl

  if (headshotUrl) {
    attachments.push({
      label: `${character.name} profile picture`,
      url: headshotUrl,
      kind: "character_headshot",
    })
  }

  for (const asset of input.assets ?? []) {
    if (!asset.fileUrl) {
      continue
    }
    attachments.push({
      label: asset.name,
      url: asset.fileUrl,
      kind: "asset",
    })
  }

  const userPrompt =
    clean(input.userPrompt) ||
    "Generate an authentic UGC image featuring this character."
  return {
    prompt: `character:\n${JSON.stringify(attributes, null, 2)}\n\n${userPrompt}`,
    attachments,
  }
}

export function parseImportedCharacter(
  input: string
): ImportedCharacterPayload | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  try {
    const jsonCandidate = trimmed.startsWith("{")
      ? trimmed
      : trimmed.slice(
          Math.max(0, trimmed.indexOf("{")),
          trimmed.lastIndexOf("}") + 1
        )
    const parsed = JSON.parse(jsonCandidate) as unknown
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>
      const character = Array.isArray(record.characters)
        ? record.characters[0]
        : record
      if (character && typeof character === "object") {
        const characterRecord = character as Record<string, unknown>
        const rawAttributes = characterRecord.attributes
        if (
          rawAttributes &&
          typeof rawAttributes === "object" &&
          !Array.isArray(rawAttributes)
        ) {
          return {
            name:
              typeof characterRecord.name === "string"
                ? characterRecord.name
                : undefined,
            attributes: normalizeImportedAttributes(
              rawAttributes as Record<string, unknown>
            ),
            previewUrl:
              typeof characterRecord.preview_url === "string"
                ? characterRecord.preview_url
                : undefined,
          }
        }
        if (
          [
            "age",
            "gender",
            "ethnicity",
            "hair",
            "eyes",
            "skin",
            "facial_features",
          ].some((key) => key in characterRecord)
        ) {
          return {
            name:
              typeof characterRecord.name === "string"
                ? characterRecord.name
                : undefined,
            attributes: normalizeImportedAttributes(characterRecord),
            previewUrl:
              typeof characterRecord.preview_url === "string"
                ? characterRecord.preview_url
                : undefined,
          }
        }
      }
    }
  } catch {
    return inferAttributesFromPlainText(trimmed)
  }

  return null
}

function normalizeImportedAttributes(
  rawAttributes: Record<string, unknown>
): CharacterAttributes {
  return normalizeCharacterAttributes(rawAttributes)
}

function inferAttributesFromPlainText(
  text: string
): ImportedCharacterPayload | null {
  const lower = text.toLowerCase()
  const attributes = structuredClone(defaultCharacterAttributes)
  let matched = false
  if (lower.includes("female") || lower.includes("woman")) {
    attributes.gender = "female"
    matched = true
  }
  if (lower.includes("male") || lower.includes("man")) {
    attributes.gender = "male"
    matched = true
  }
  if (lower.includes("gray hair")) {
    attributes.hair.color = "gray"
    matched = true
  }
  if (lower.includes("green eyes")) {
    attributes.eyes.color = "green"
    matched = true
  }
  if (lower.includes("streetwear")) {
    attributes.clothing.outfit_description = "streetwear"
    matched = true
  }

  return matched ? { attributes } : null
}


export function getCharacterFieldValue(
  attributes: CharacterAttributes,
  path: string
): string | number | string[] | undefined {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined
    }
    return (current as Record<string, unknown>)[key]
  }, attributes) as string | number | string[] | undefined
}

export function setCharacterFieldValue(
  attributes: CharacterAttributes,
  path: string,
  value: string | number
): CharacterAttributes {
  const next = structuredClone(attributes)
  const parts = path.split(".")
  let target: Record<string, unknown> = next as unknown as Record<
    string,
    unknown
  >
  for (const part of parts.slice(0, -1)) {
    const current = target[part]
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      target[part] = {}
    }
    target = target[part] as Record<string, unknown>
  }
  const finalKey = parts[parts.length - 1]
  target[finalKey] =
    path === "accessories.visible_accessories"
      ? String(value) === "none"
        ? []
        : [String(value)]
      : value
  return normalizeCharacterAttributes(next)
}

export function formatCharacterValue(
  value?: string | number | string[]
): string {
  if (!value) {
    return "None"
  }

  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => formatCharacterValue(item)).join(", ")
      : "None"
  }

  if (typeof value === "number") {
    return String(value)
  }

  return value
    .split("-")
    .flatMap((part) => part.split("_"))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export function formatCharacterFieldName(value: string) {
  return value
    .split(".")
    .at(-1)!
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase())
}
