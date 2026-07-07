import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  defaultSlideshowTextModel,
  featuredOpenRouterModelIds,
  generationModelRegistry,
  kieModelForCharacterImageToVideo,
  openRouterModelForUseCase,
  tempTestingCenterFallbackModels,
} from "@/lib/realfarm-generation-model-registry"

const root = process.cwd()

function src(filePath: string) {
  return readFileSync(path.join(root, filePath), "utf8")
}

describe("RealFarm generation model registry", () => {
  it("centralizes OpenRouter model ids by use case", () => {
    expect(openRouterModelForUseCase("slideshowText")).toBe(
      "google/gemini-3.1-flash-lite"
    )
    expect(defaultSlideshowTextModel).toBe(
      openRouterModelForUseCase("slideshowText")
    )
    expect(openRouterModelForUseCase("automationHooks")).toBe(
      openRouterModelForUseCase("slideshowText")
    )
    expect(openRouterModelForUseCase("imageCaptioning")).toBe(
      "google/gemini-2.5-flash"
    )
    expect(openRouterModelForUseCase("characterAttributes")).toBe(
      "google/gemini-2.5-flash"
    )
    expect(openRouterModelForUseCase("swipeAnalysis")).toBe(
      "google/gemini-3-flash-preview"
    )
    expect(openRouterModelForUseCase("swipeTranscription")).toBe(
      "openai/whisper-1"
    )
    expect(featuredOpenRouterModelIds).toBe(
      generationModelRegistry.openRouter.tempTestingCenter.featuredModelIds
    )
    expect(tempTestingCenterFallbackModels.map((model) => model.id)).toEqual([
      ...featuredOpenRouterModelIds,
    ])
  })

  it("centralizes KIE provider model ids used by character generation routes", () => {
    expect(kieModelForCharacterImageToVideo("Kling 2.6 Image to Video")).toBe(
      "kling-2.6/image-to-video"
    )
    expect(kieModelForCharacterImageToVideo("Seedance 2.0")).toBe(
      "bytedance/seedance-2"
    )
    expect(kieModelForCharacterImageToVideo("unknown model")).toBe(
      "kling-2.6/image-to-video"
    )
  })

  it("keeps provider model ids out of routes and feature libs", () => {
    const checkedFiles = [
      "lib/slideshow-text-generation.ts",
      "lib/openrouter-models.ts",
      "lib/swipes.ts",
      "app/api/automations/hooks/route.ts",
      "app/api/characters/attributes/route.ts",
      "app/api/image-collections/captions/route.ts",
      "app/api/characters/image/route.ts",
      "app/api/characters/video/route.ts",
      "app/api/characters/headshot/route.ts",
    ]

    for (const filePath of checkedFiles) {
      const source = src(filePath)
      expect(source, filePath).not.toMatch(
        /"(?:google\/gemini-[^"]+|openai\/whisper-1|kling-[^"]+|bytedance\/seedance-2|flux-kontext-pro|topaz\/image-upscale)"/
      )
    }
  })
})
