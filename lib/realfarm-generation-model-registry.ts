export type ImageActionModel = {
  label: string
  model: string
}

export type OpenRouterModelUseCase =
  | "slideshowText"
  | "webResearch"
  | "automationHooks"
  | "xPostGeneration"
  | "contentHumanize"
  | "contentReview"
  | "imageCaptioning"
  | "ugcAnalysis"
  | "ugcScript"

export const generationModelRegistry = {
  openRouter: {
    slideshowText: {
      // Model shootout 2026-07-14: claude-sonnet-5 scored 8.95/10 overall
      // (vs 7.75 for gemini-3.1-flash-lite) with the best latency of the top
      // tier and zero structured-output failures. ~$0.011 per slideshow.
      model: "anthropic/claude-sonnet-5",
    },
    webResearch: {
      model: "openai/gpt-5.4-mini",
    },
    automationHooks: {
      model: "google/gemini-3.1-flash-lite",
    },
    xPostGeneration: {
      model: "anthropic/claude-sonnet-5",
      fallbackModels: ["google/gemini-3.1-flash-lite"],
    },
    contentHumanize: {
      model: "google/gemini-3.1-flash-lite",
    },
    contentReview: {
      model: "openai/gpt-5.4-mini",
    },
    imageCaptioning: {
      model: "google/gemini-2.5-flash",
    },
    ugcAnalysis: { model: "openai/gpt-5.4-mini" },
    ugcScript: { model: "anthropic/claude-sonnet-5" },
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
  imageTools: {
    imageAction: {
      defaultModel: "gpt-image-1",
      models: [
        { label: "GPT Image 1", model: "gpt-image-1" },
        { label: "Flux", model: "flux" },
        { label: "DALL-E 3", model: "dall-e-3" },
      ] satisfies ImageActionModel[],
    },
    edit: {
      providerModel: "flux-kontext-pro",
    },
    upscale: {
      imageProviderModel: "topaz/image-upscale",
    },
  },
  ugc: {
    // Slugs verified against fal.ai model pages + OpenShorts saasshorts.py (2026-07-22).
    // Centralized here because FAL changes identifiers; re-verify before flipping
    // ENABLE_UGC_AUTOMATION since fal versions/prices drift.
    falFlux2ProEndpoint: "fal-ai/flux-2-pro",
    // Hailuo + Kling are namespaced by tier — the bare slugs 404, the /standard path is required.
    falHailuo23FastEndpoint: "fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video",
    falVeedLipSyncEndpoint: "veed/lipsync",
    falKlingAvatarV2Endpoint: "fal-ai/kling-video/ai-avatar/v2/standard",
    // eleven_multilingual_v2 is the documented default for the with-timestamps endpoint
    // (returns audio_base64 + character alignment). Do NOT use eleven_v3 here — it does
    // not support /v1/text-to-speech/{voice_id}/with-timestamps.
    elevenLabsModelId: "eleven_multilingual_v2",
    // Rachel — a stable public premade voice. Override per deployment as desired.
    elevenLabsDefaultVoiceId: "21m00Tcm4TlvDq8ikWAM",
    // BASE url; the client appends /{voice_id}/with-timestamps (see lib/elevenlabs-tts.ts).
    elevenLabsTimestampEndpoint: "https://api.elevenlabs.io/v1/text-to-speech",
  },
} as const

export function openRouterModelForUseCase(useCase: OpenRouterModelUseCase) {
  return generationModelRegistry.openRouter[useCase].model
}

export const defaultSlideshowTextModel =
  generationModelRegistry.openRouter.slideshowText.model

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

export const imageActionModelOptions =
  generationModelRegistry.imageTools.imageAction.models

export const defaultImageActionModel: string =
  generationModelRegistry.imageTools.imageAction.defaultModel

export const kieFluxKontextModel =
  generationModelRegistry.imageTools.edit.providerModel

export const kieTopazImageUpscaleModel =
  generationModelRegistry.imageTools.upscale.imageProviderModel
