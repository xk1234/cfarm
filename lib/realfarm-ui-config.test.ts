import { describe, expect, it } from "vitest"

import { assetCategoryByTab, assetTabs } from "@/lib/realfarm-asset-ui-config"
import {
  characterAttributeOptionsConfig,
  characterEditorFieldsConfig,
  characterEditorTabsConfig,
  characterSummaryFieldsConfig,
  defaultCharacterHeadshotPromptConfig,
  defaultCharacterPreviewUrlConfig,
  characterImageAspectRatiosConfig,
} from "@/lib/realfarm-character-ui-config"
import {
  characterImageGenerationModelOptions,
  characterImageToVideoModelOptions,
  defaultCharacterImageGenerationModel,
  defaultCharacterImageToVideoModel,
  generationModelRegistry,
} from "@/lib/realfarm-generation-model-registry"
import {
  automationTextPreviewClassName,
  automationTextPreviewStyle,
  defaultSlideshowTextStyle,
  slideshowTextColorOptions,
  slideshowTextFontOptions,
  slideshowTextSizeOptions,
} from "@/lib/realfarm-slideshow-text-style-config"
import {
  characterAttributeOptions,
  characterEditorFields,
  characterEditorTabs,
  characterGenerationModels,
  characterImageAspectRatios,
  characterImageToVideoModels,
  characterSummaryFields,
  defaultCharacterHeadshotPrompt,
  defaultCharacterPreviewUrl,
  defaultImageGenerationModel,
  defaultImageToVideoModel,
} from "@/lib/realfarm-character-ui"

describe("RealFarm UI config", () => {
  it("loads character attributes, tabs, summary fields, and defaults from config", () => {
    expect(characterAttributeOptions).toBe(characterAttributeOptionsConfig)
    expect(characterEditorTabs).toBe(characterEditorTabsConfig)
    expect(characterEditorFields).toBe(characterEditorFieldsConfig)
    expect(characterSummaryFields).toBe(characterSummaryFieldsConfig)
    expect(defaultCharacterPreviewUrl).toBe(defaultCharacterPreviewUrlConfig)
    expect(defaultCharacterHeadshotPrompt).toBe(
      defaultCharacterHeadshotPromptConfig
    )
    expect(characterImageAspectRatios).toBe(characterImageAspectRatiosConfig)
    expect(characterAttributeOptionsConfig["hair.color"]).toContain("black")
  })

  it("loads character generation model options from the central registry", () => {
    expect(defaultImageGenerationModel).toBe(
      defaultCharacterImageGenerationModel
    )
    expect(defaultImageToVideoModel).toBe(defaultCharacterImageToVideoModel)
    expect(characterGenerationModels).toEqual(
      characterImageGenerationModelOptions.map((model) => model.label)
    )
    expect(characterImageToVideoModels).toBe(characterImageToVideoModelOptions)
    expect(generationModelRegistry.character.image.defaultModel).toBe(
      "Nano Banana Pro"
    )
  })

  it("loads asset tabs and categories from config", () => {
    expect(assetTabs).toEqual([
      "outfits",
      "accessories",
      "background",
      "products",
    ])
    expect(assetCategoryByTab).toEqual({
      outfits: "outfit",
      accessories: "accessory",
      background: "background",
      products: "product",
    })
  })

  it("loads reusable slideshow text editor presets from config", () => {
    expect(defaultSlideshowTextStyle).toEqual({
      font: "Default",
      color: "Yellow Text",
      size: "14px",
    })
    expect(slideshowTextFontOptions).toContain("Bebas Neue")
    expect(slideshowTextColorOptions).toContain("Yellow Text")
    expect(slideshowTextSizeOptions).toContain("14px")
  })

  it("maps automation text item styles to preview rendering styles", () => {
    expect(automationTextPreviewClassName("whiteText")).toContain("text-white")
    expect(automationTextPreviewClassName("yellowText")).toContain(
      "text-yellow"
    )
    expect(automationTextPreviewClassName("background")).toContain("bg-white")
    expect(
      automationTextPreviewStyle({
        font: "Inter",
        fontSize: "12px",
        textStyle: "whiteText",
        textPosition: "top",
        textAnchor: "padded",
        textItemWidth: "80%",
        textAlign: "left",
      })
    ).toMatchObject({
      top: "14%",
      width: "80%",
      fontSize: "12px",
      textAlign: "left",
      fontFamily: "Inter, sans-serif",
    })
  })
})
