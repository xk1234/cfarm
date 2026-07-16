import type { Character } from "@/lib/character-model"

export type CharacterAttributesPromptConfig = {
  name?: string
  sourceImageDataUrl: string
  currentAttributes?: Partial<Character>
}

export function buildCharacterAttributesPrompt({
  name,
  sourceImageDataUrl,
  currentAttributes,
}: CharacterAttributesPromptConfig) {
  return [
    {
      role: "system",
      content: [
        "Extract a UGC character attribute JSON object from the uploaded image.",
        "Return only valid JSON, with no markdown fences and no commentary.",
        "Use visible evidence from the image as the source of truth. Do not invent brand names or identity claims.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [
            "Create a complete character JSON object with these keys:",
            "name, age, ethnicity, gender, hair, eyes, facial_features, skin, build, clothing, posture_and_mannerisms, emotional_baseline, accessories, voice.",
            "Nested values should be concise visual descriptors suitable for generating a consistent photorealistic headshot.",
            `Preferred name: ${name?.trim() || "New character"}.`,
            currentAttributes
              ? `Existing attributes to preserve only when not contradicted by the image: ${JSON.stringify(currentAttributes)}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
        {
          type: "image_url",
          image_url: { url: sourceImageDataUrl },
        },
      ],
    },
  ]
}
