import type { Character } from "@/lib/character-model"

export type CharacterHeadshotPromptConfig = {
  name: string
  attributes: Character
  customPrompt?: string
}

export function buildHeadshotPrompt({
  name,
  attributes,
  customPrompt,
}: CharacterHeadshotPromptConfig) {
  const characterJson = JSON.stringify({ ...attributes, name }, null, 2)
  const extraPrompt = customPrompt?.trim()

  return [
    "Generate a photorealistic AI UGC character headshot on a clean white background.",
    "The image must be a front-facing shoulders-up portrait, centered, evenly lit, with natural skin texture, realistic facial proportions, and no text, watermark, logo, border, or UI elements.",
    "Keep the identity consistent with this character JSON. Treat the JSON as the source of truth for age, ethnicity, gender, hair, eyes, face, skin, build, clothing, posture, emotion, accessories, and voice cues.",
    "Use the uploaded character image only as a visual reference when one is provided. Do not return the uploaded image itself; generate a new clean headshot from the reference plus the character JSON.",
    "Character JSON:",
    characterJson,
    extraPrompt
      ? `Custom prompt: ${extraPrompt}`
      : "Custom prompt: professional neutral headshot, white background, passport-style crop but natural UGC realism.",
  ].join("\n\n")
}
