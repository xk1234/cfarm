import "server-only"

import path from "node:path"

import { clean } from "@/lib/guards"
import { readJsonArrayRecord, upsertJsonArrayRecord } from "@/lib/json-store"
import {
  defaultImageCaptioningModel,
  defaultSlideshowTextModel,
} from "@/lib/realfarm-generation-model-registry"

export type GenerationModelSettings = {
  id: "generation-models"
  slideshowTextModel: string
  imageCaptioningModel: string
  updatedAt: string
}

const store = {
  rootDir: path.join(process.cwd(), "data", "settings"),
  fileName: "generation-models.json",
  key: "settings",
}

export function defaultGenerationModelSettings(): GenerationModelSettings {
  return {
    id: "generation-models",
    slideshowTextModel: defaultSlideshowTextModel,
    imageCaptioningModel: defaultImageCaptioningModel,
    updatedAt: new Date(0).toISOString(),
  }
}

export function normalizeGenerationModelSettings(
  value: unknown
): GenerationModelSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const defaults = defaultGenerationModelSettings()
  return {
    id: "generation-models",
    slideshowTextModel:
      clean(input.slideshowTextModel) || defaults.slideshowTextModel,
    imageCaptioningModel:
      clean(input.imageCaptioningModel) || defaults.imageCaptioningModel,
    updatedAt: clean(input.updatedAt) || defaults.updatedAt,
  }
}

export async function getGenerationModelSettings() {
  return (
    (await readJsonArrayRecord<GenerationModelSettings>({
      ...store,
      id: "generation-models",
      normalize: normalizeGenerationModelSettings,
    })) ?? defaultGenerationModelSettings()
  )
}

export async function saveGenerationModelSettings(input: {
  slideshowTextModel: string
  imageCaptioningModel: string
}) {
  const settings = normalizeGenerationModelSettings({
    id: "generation-models",
    ...input,
    updatedAt: new Date().toISOString(),
  })
  if (!settings) throw new Error("Invalid generation model settings")
  await upsertJsonArrayRecord({ ...store, record: settings })
  return settings
}
