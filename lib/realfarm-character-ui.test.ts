import { describe, expect, it } from "vitest"

import { defaultCharacterAttributes } from "@/lib/character-model"
import {
  buildCharacterPromptPackage,
  characterImageAspectRatios,
  characterGenerationModels,
  characterImageToVideoModels,
  createCharacterImageGenerationRecord,
  defaultImageGenerationModel,
  defaultImageToVideoModel,
  ugcImagePromptPresets,
} from "@/lib/realfarm-character-ui"

describe("buildCharacterPromptPackage", () => {
  it("includes character attributes and headshot as prompt attachments", () => {
    const result = buildCharacterPromptPackage({
      userPrompt: "film this in a bright kitchen",
      character: {
        name: "Maya",
        preview_url: "/api/local-assets/characters/headshots/maya.png",
        attributes: {
          ...defaultCharacterAttributes,
          name: "Maya",
          gender: "female",
          age: 28,
        },
      },
      assets: [
        {
          name: "Serum bottle",
          fileUrl: "/api/local-assets/assets/serum.png",
        },
      ],
    })

    expect(result.prompt).toMatch(/^character:\n\{/)
    expect(result.prompt).toContain('\n\nfilm this in a bright kitchen')
    expect(result.prompt).not.toContain("Character attributes JSON")
    expect(result.prompt).toContain('"gender": "female"')
    expect(result.prompt.indexOf("character:")).toBeLessThan(result.prompt.indexOf("film this in a bright kitchen"))
    expect(result.attachments).toEqual([
      { label: "Maya profile picture", url: "/api/local-assets/characters/headshots/maya.png", kind: "character_headshot" },
      { label: "Serum bottle", url: "/api/local-assets/assets/serum.png", kind: "asset" },
    ])
  })
})

describe("UGC image generation options", () => {
  it("defaults image generation to Flux 2", () => {
    expect(defaultImageGenerationModel).toBe("Flux 2")
    expect(characterGenerationModels[0]).toBe(defaultImageGenerationModel)
  })

  it("exposes aspect ratio options for image generation", () => {
    expect(characterImageAspectRatios).toEqual(["9:16", "4:5", "1:1", "16:9", "3:4", "4:3"])
  })

  it("exposes Kie image-to-video model options for generated character images", () => {
    expect(defaultImageToVideoModel).toBe("Kling 2.6 Image to Video")
    expect(characterImageToVideoModels.map((model) => model.label)).toEqual([
      "Kling 2.6 Image to Video",
      "Kling 3.0 Video",
      "Seedance 2.0",
    ])
    expect(characterImageToVideoModels.every((model) => model.provider === "kie")).toBe(true)
  })

  it("loads the captured Genviral image presets for the prompt menu", () => {
    expect(ugcImagePromptPresets.length).toBeGreaterThanOrEqual(20)
    expect(ugcImagePromptPresets[0]).toMatchObject({
      name: expect.any(String),
      prompt: expect.any(String),
    })
    expect(ugcImagePromptPresets.every((preset) => preset.prompt.trim().length > 0)).toBe(true)
    expect(ugcImagePromptPresets.every((preset) => preset.thumbnailUrl?.startsWith("https://cdn.vireel.io/"))).toBe(true)
  })

  it("creates a Flux 2 generation record with a real prompt", () => {
    const record = createCharacterImageGenerationRecord({
      id: "test-generation",
      createdAt: "2026-07-02T08:00:00.000Z",
      prompt: "Generate a candid UGC image of Maya holding a serum bottle in a bright bathroom.",
      attachments: [],
      aspectRatio: "4:5",
      status: "processing",
    })

    expect(record).toMatchObject({
      id: "test-generation",
      model: "Flux 2",
      createdAt: "2026-07-02T08:00:00.000Z",
      aspectRatio: "4:5",
      status: "processing",
    })
    expect(record.prompt).toContain("serum bottle")
  })

  it("tracks image-to-video generation state on character image records", () => {
    const record = createCharacterImageGenerationRecord({
      id: "test-generation",
      createdAt: "2026-07-02T08:00:00.000Z",
      prompt: "Animate Maya waving to camera.",
      attachments: [],
      imageUrl: "/api/local-assets/characters/images/maya.png",
      videoUrl: "/api/local-assets/characters/videos/maya.mp4",
      videoModel: "Kling 2.6 Image to Video",
      videoStatus: "ready",
    })

    expect(record).toMatchObject({
      imageUrl: "/api/local-assets/characters/images/maya.png",
      videoUrl: "/api/local-assets/characters/videos/maya.mp4",
      videoModel: "Kling 2.6 Image to Video",
      videoStatus: "ready",
    })
  })
})
