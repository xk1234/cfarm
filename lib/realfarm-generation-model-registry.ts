export type CharacterImageGenerationModel = {
  label: string
  url: string
}

export type CharacterImageActionModel = {
  label: string
  model: string
}

export type CharacterImageToVideoModel = {
  label: string
  model: string
  provider: "kie"
}

export type OpenRouterModelUseCase =
  | "slideshowText"
  | "webResearch"
  | "automationHooks"
  | "imageCaptioning"
  | "characterAttributes"
  | "swipeAnalysis"
  | "swipeTranscription"

export const generationModelRegistry = {
  openRouter: {
    slideshowText: {
      // Model shootout 2026-07-14: claude-sonnet-5 scored 8.95/10 overall
      // (vs 7.75 for gemini-3.1-flash-lite) with the best latency of the top
      // tier and zero structured-output failures. ~$0.011 per slideshow.
      model: "anthropic/claude-sonnet-5",
      fallbackModels: ["z-ai/glm-5.2"],
    },
    webResearch: {
      model: "openai/gpt-5.4-mini",
    },
    automationHooks: {
      model: "google/gemini-3.1-flash-lite",
    },
    imageCaptioning: {
      model: "google/gemini-2.5-flash",
    },
    characterAttributes: {
      model: "google/gemini-2.5-flash",
    },
    swipeAnalysis: {
      model: "google/gemini-3-flash-preview",
    },
    swipeTranscription: {
      model: "openai/whisper-1",
    },
    tempTestingCenter: {
      featuredModelIds: [
        "anthropic/claude-sonnet-4.5",
        "openai/gpt-5.4-mini",
        "deepseek/deepseek-v4",
        "google/gemini-3.1-flash-lite",
        "moonshotai/kimi-k2.7",
        "x-ai/grok-4.5",
        "xiaomi/mimo-v2.5",
        "qwen/qwen3.7-plus",
        "z-ai/glm-5.2",
        "deepseek/deepseek-v4-flash",
        "minimax/minimax-m3",
      ],
      excludedModelIds: [
        "nvidia/nemotron-3-super-120b-a12b:free",
        "ai21/jamba-large-1.7",
        "ai21/jamba-1.6-large",
        "x-ai/grok-4.3",
      ],
      fallbackModels: [
        {
          id: "anthropic/claude-sonnet-4.5",
          name: "Anthropic: Claude Sonnet 4.5",
        },
        { id: "openai/gpt-5.4-mini", name: "OpenAI: GPT-5.4 Mini" },
        { id: "deepseek/deepseek-v4", name: "DeepSeek: DeepSeek V4" },
        {
          id: "google/gemini-3.1-flash-lite",
          name: "Google: Gemini 3.1 Flash Lite",
        },
        { id: "moonshotai/kimi-k2.7", name: "Moonshot AI: Kimi 2.7" },
        { id: "x-ai/grok-4.5", name: "xAI: Grok 4.5" },
        { id: "qwen/qwen3.7-plus", name: "Qwen: Qwen3.7 Plus" },
        { id: "z-ai/glm-5.2", name: "Z.ai: GLM 5.2" },
        {
          id: "deepseek/deepseek-v4-flash",
          name: "DeepSeek: DeepSeek V4 Flash",
        },
        { id: "minimax/minimax-m3", name: "MiniMax: MiniMax M3" },
        { id: "xiaomi/mimo-v2.5", name: "Xiaomi: MiMo 2.5" },
      ],
    },
  },
  character: {
    image: {
      defaultModel: "Nano Banana Pro",
      models: [
        { label: "Nano Banana Pro", url: "https://kie.ai/nano-banana-pro" },
        { label: "Flux 2", url: "https://kie.ai/flux-2" },
        { label: "GPT Image 2", url: "https://kie.ai/gpt-image-2" },
        { label: "Z-Image", url: "https://kie.ai/z-image" },
      ] satisfies CharacterImageGenerationModel[],
    },
    imageAction: {
      defaultModel: "gpt-image-1",
      models: [
        { label: "GPT Image 1", model: "gpt-image-1" },
        { label: "Flux", model: "flux" },
        { label: "DALL-E 3", model: "dall-e-3" },
      ] satisfies CharacterImageActionModel[],
    },
    edit: {
      providerModel: "flux-kontext-pro",
      models: [
        {
          label: "Flux.1 Kontext",
          url: "https://kie.ai/features/flux1-kontext",
        },
        { label: "Qwen Image Edit", url: "https://kie.ai/qwen/image-edit" },
      ] satisfies CharacterImageGenerationModel[],
    },
    video: {
      models: [
        { label: "Seedance 2.0", url: "https://kie.ai/seedance-2-0" },
        { label: "Kling 3.0", url: "https://kie.ai/kling-3-0" },
      ] satisfies CharacterImageGenerationModel[],
    },
    imageToVideo: {
      defaultModel: "Kling 2.6 Image to Video",
      models: [
        {
          label: "Kling 2.6 Image to Video",
          model: "kling-2.6/image-to-video",
          provider: "kie",
        },
        { label: "Kling 3.0 Video", model: "kling-3.0/video", provider: "kie" },
        {
          label: "Seedance 2.0",
          model: "bytedance/seedance-2",
          provider: "kie",
        },
      ] satisfies CharacterImageToVideoModel[],
    },
    upscale: {
      imageProviderModel: "topaz/image-upscale",
      models: [
        {
          label: "Topaz Image Upscale",
          url: "https://kie.ai/topaz-image-upscale",
        },
        {
          label: "Topaz Video Upscaler",
          url: "https://kie.ai/topaz-video-upscaler",
        },
      ] satisfies CharacterImageGenerationModel[],
    },
  },
} as const

export function openRouterModelForUseCase(useCase: OpenRouterModelUseCase) {
  return generationModelRegistry.openRouter[useCase].model
}

export const defaultSlideshowTextModel =
  generationModelRegistry.openRouter.slideshowText.model

export const slideshowTextFallbackModels =
  generationModelRegistry.openRouter.slideshowText.fallbackModels

export const featuredOpenRouterModelIds: readonly string[] =
  generationModelRegistry.openRouter.tempTestingCenter.featuredModelIds

export const excludedOpenRouterModelIds: readonly string[] =
  generationModelRegistry.openRouter.tempTestingCenter.excludedModelIds

export const tempTestingCenterFallbackModels =
  generationModelRegistry.openRouter.tempTestingCenter.fallbackModels.map(
    (model) => ({
      id: model.id,
      name: model.name,
      contextLength: null,
      promptPrice: "",
      completionPrice: "",
      supportsResponseFormat: true,
      supportsStructuredOutputs: true,
    })
  )

export const characterImageGenerationModelOptions =
  generationModelRegistry.character.image.models

export const defaultCharacterImageGenerationModel =
  generationModelRegistry.character.image.defaultModel

export const characterImageEditModelOptions =
  generationModelRegistry.character.edit.models

export const characterImageActionModelOptions =
  generationModelRegistry.character.imageAction.models

export const defaultCharacterImageActionModel: string =
  generationModelRegistry.character.imageAction.defaultModel

export const characterVideoGenerationModelOptions =
  generationModelRegistry.character.video.models

export const characterImageToVideoModelOptions =
  generationModelRegistry.character.imageToVideo.models

export const defaultCharacterImageToVideoModel =
  generationModelRegistry.character.imageToVideo.defaultModel

export const defaultCharacterImageToVideoProviderModel =
  generationModelRegistry.character.imageToVideo.models[0].model

export const kling30CharacterImageToVideoProviderModel =
  generationModelRegistry.character.imageToVideo.models[1].model

export const seedanceCharacterImageToVideoProviderModel =
  generationModelRegistry.character.imageToVideo.models[2].model

export const characterUpscaleModelOptions =
  generationModelRegistry.character.upscale.models

export const kieFluxKontextModel =
  generationModelRegistry.character.edit.providerModel

export const kieTopazImageUpscaleModel =
  generationModelRegistry.character.upscale.imageProviderModel

export function kieModelForCharacterImageToVideo(labelOrModel: string) {
  const cleanValue = labelOrModel.trim().toLowerCase()
  return (
    generationModelRegistry.character.imageToVideo.models.find(
      (model) =>
        model.label.toLowerCase() === cleanValue ||
        model.model.toLowerCase() === cleanValue ||
        cleanValue.includes(model.label.toLowerCase()) ||
        cleanValue.includes(model.model.toLowerCase())
    )?.model ?? defaultCharacterImageToVideoProviderModel
  )
}
