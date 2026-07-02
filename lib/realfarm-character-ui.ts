import { defaultCharacterAttributes, normalizeCharacterAttributes, type Character } from "@/lib/character-model"

export type CharacterAttributes = Character

export const characterAttributeOptions: Record<string, string[]> = {
  gender: ["female", "male"],
  age: ["20", "27", "35", "45", "55", "65"],
  ethnicity: ["somali", "mexican", "east-asian", "south-asian", "black", "white", "middle-eastern", "latina"],
  "skin.tone": ["fair", "olive", "brown", "deep", "mexican", "somali"],
  "skin.undertone": ["warm", "cool", "neutral", "golden"],
  "skin.texture": ["clear", "dewy", "textured", "matte"],
  "skin.visible_details": ["none", "light freckles", "moderate freckles", "one beauty mark", "small facial scar"],
  "facial_features.face_shape": ["oval", "round", "square", "oblong", "heart", "wide"],
  "facial_features.forehead": ["short", "average", "tall", "broad"],
  "facial_features.jawline": ["soft", "rounded", "square", "sharp"],
  "facial_features.chin": ["rounded", "square", "receding", "pointed"],
  "facial_features.cheekbones": ["soft", "prominent", "high"],
  "facial_features.nose": ["narrow", "wide", "button", "roman"],
  "facial_features.lips": ["thin", "medium", "full", "wide"],
  "facial_features.eyebrows": ["thin", "arched", "straight", "thick", "feathered"],
  "facial_features.other_distinctive_features": ["none", "chin dimple", "small facial scar", "beauty mark", "subtle dimples"],
  "hair.color": ["black", "brown", "auburn", "blonde", "gray"],
  "hair.style": ["slicked-back", "pixie", "waves", "braids", "loose-curls"],
  "hair.length": ["short", "medium", "long", "very-long", "waist-length"],
  "hair.texture": ["straight", "wavy", "curly", "coily", "fine", "sleek"],
  "hair.highlights": ["none", "platinum-tips", "caramel", "silver", "sun-bleached"],
  "hair.part": ["none", "center", "side", "messy"],
  "eyes.color": ["brown", "green", "blue", "hazel", "gray", "black"],
  "eyes.shape": ["almond", "hooded", "round", "deep-set"],
  "eyes.details": ["bright", "slight circles", "deep circles", "heavy lids"],
  "build.body_type": ["slim", "average", "athletic", "hourglass", "broad"],
  "build.height_impression": ["very-short", "short", "average", "tall"],
  "clothing.outfit_description": ["streetwear", "quiet luxury", "editorial", "minimal", "athleisure", "dark academia"],
  "clothing.top": ["t-shirt", "hoodie", "button-down", "blazer", "tank"],
  "clothing.bottoms": ["jeans", "tailored trousers", "shorts", "skirt", "leggings"],
  "clothing.footwear": ["sneakers", "boots", "loafers", "sandals"],
  "clothing.makeup": ["none", "natural", "glossy", "editorial"],
  "posture_and_mannerisms.posture": ["upright", "relaxed", "leaning forward", "casual slouch"],
  "posture_and_mannerisms.body_language": ["calm", "confident", "animated", "reserved"],
  "posture_and_mannerisms.gestures": ["measured hand movement", "talks with hands", "minimal gestures", "points to camera"],
  "emotional_baseline.primary_emotion": ["calm", "warm", "serious", "playful"],
  "emotional_baseline.demeanor": ["confident", "friendly", "reserved", "direct"],
  "emotional_baseline.communication_style": ["direct", "conversational", "soft-spoken", "energetic"],
  "accessories.visible_accessories": ["none", "studs", "chain", "watch", "mixed-metals", "round glasses"],
  "voice.tone": ["warm", "low", "bright", "raspy"],
  "voice.clarity": ["clear", "soft", "crisp", "muffled"],
  "voice.vocal_quality": ["steady", "breathy", "smooth", "textured"],
  "voice.speech_patterns": ["natural conversational pacing", "fast", "slow", "deliberate"],
}

export const characterEditorTabs = [
  "Overview",
  "Voice",
  "Images",
  "Videos",
  "Settings",
] as const

export type CharacterEditorTab = typeof characterEditorTabs[number]

export const characterEditorFields: Record<Exclude<CharacterEditorTab, "Overview">, string[]> = {
  Voice: ["voice.tone", "voice.clarity", "voice.vocal_quality", "voice.speech_patterns"],
  Images: [],
  Videos: [],
  Settings: [],
}

export const characterSummaryFields: [string, string][] = [
  ["Gender", "gender"],
  ["Age", "age"],
  ["Ethnicity", "ethnicity"],
  ["Tone", "skin.tone"],
  ["Undertone", "skin.undertone"],
  ["Texture", "skin.texture"],
  ["Visible Details", "skin.visible_details"],
  ["Shape", "facial_features.face_shape"],
  ["Jawline", "facial_features.jawline"],
  ["Cheekbones", "facial_features.cheekbones"],
  ["Chin", "facial_features.chin"],
  ["Nose", "facial_features.nose"],
  ["Lips", "facial_features.lips"],
  ["Hair Color", "hair.color"],
  ["Hair Style", "hair.style"],
]

export const defaultCharacterPreviewUrl = "/api/local-assets/characters/headshots/default-profile.png"
export const defaultCharacterHeadshotPrompt = "professional front-facing headshot, clean white background"

export const imageGenerationModels = [
  { label: "GPT Image 2", url: "https://kie.ai/gpt-image-2" },
  { label: "Nano Banana Pro", url: "https://kie.ai/nano-banana-pro" },
  { label: "Flux 2", url: "https://kie.ai/flux-2" },
  { label: "Z-Image", url: "https://kie.ai/z-image" },
]

export const imageEditModels = [
  { label: "Flux.1 Kontext", url: "https://kie.ai/features/flux1-kontext" },
  { label: "Qwen Image Edit", url: "https://kie.ai/qwen/image-edit" },
]

export const videoGenerationModels = [
  { label: "Seedance 2.0", url: "https://kie.ai/seedance-2-0" },
  { label: "Kling 3.0", url: "https://kie.ai/kling-3-0" },
]

export const upscaleModels = [
  { label: "Topaz Image Upscale", url: "https://kie.ai/topaz-image-upscale" },
  { label: "Topaz Video Upscaler", url: "https://kie.ai/topaz-video-upscaler" },
]

export const characterGenerationModels = imageGenerationModels.map((model) => model.label)


export type ImportedCharacterPayload = {
  name?: string
  attributes: CharacterAttributes
  previewUrl?: string
}

export function parseImportedCharacter(input: string): ImportedCharacterPayload | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  try {
    const jsonCandidate = trimmed.startsWith("{")
      ? trimmed
      : trimmed.slice(Math.max(0, trimmed.indexOf("{")), trimmed.lastIndexOf("}") + 1)
    const parsed = JSON.parse(jsonCandidate) as unknown
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>
      const character = Array.isArray(record.characters) ? record.characters[0] : record
      if (character && typeof character === "object") {
        const characterRecord = character as Record<string, unknown>
        const rawAttributes = characterRecord.attributes
        if (rawAttributes && typeof rawAttributes === "object" && !Array.isArray(rawAttributes)) {
          return {
            name: typeof characterRecord.name === "string" ? characterRecord.name : undefined,
            attributes: normalizeImportedAttributes(rawAttributes as Record<string, unknown>),
            previewUrl: typeof characterRecord.preview_url === "string" ? characterRecord.preview_url : undefined,
          }
        }
        if (["age", "gender", "ethnicity", "hair", "eyes", "skin", "facial_features"].some((key) => key in characterRecord)) {
          return {
            name: typeof characterRecord.name === "string" ? characterRecord.name : undefined,
            attributes: normalizeImportedAttributes(characterRecord),
            previewUrl: typeof characterRecord.preview_url === "string" ? characterRecord.preview_url : undefined,
          }
        }
      }
    }
  } catch {
    return inferAttributesFromPlainText(trimmed)
  }

  return null
}

function normalizeImportedAttributes(rawAttributes: Record<string, unknown>): CharacterAttributes {
  return normalizeCharacterAttributes(rawAttributes)
}

function inferAttributesFromPlainText(text: string): ImportedCharacterPayload | null {
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

export function getCharacterFieldValue(attributes: CharacterAttributes, path: string): string | number | string[] | undefined {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") {
      return undefined
    }
    return (current as Record<string, unknown>)[key]
  }, attributes) as string | number | string[] | undefined
}

export function setCharacterFieldValue(attributes: CharacterAttributes, path: string, value: string | number): CharacterAttributes {
  const next = structuredClone(attributes)
  const parts = path.split(".")
  let target: Record<string, unknown> = next as unknown as Record<string, unknown>
  for (const part of parts.slice(0, -1)) {
    const current = target[part]
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      target[part] = {}
    }
    target = target[part] as Record<string, unknown>
  }
  const finalKey = parts[parts.length - 1]
  target[finalKey] = path === "accessories.visible_accessories"
    ? (String(value) === "none" ? [] : [String(value)])
    : value
  return normalizeCharacterAttributes(next)
}

export function formatCharacterValue(value?: string | number | string[]): string {
  if (!value) {
    return "None"
  }

  if (Array.isArray(value)) {
    return value.length ? value.map((item) => formatCharacterValue(item)).join(", ") : "None"
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

