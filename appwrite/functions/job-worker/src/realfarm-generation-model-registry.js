// Generated from lib/realfarm-generation-model-registry.ts. Do not edit by hand.
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
        imageCaptioning: {
            model: "google/gemini-2.5-flash",
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
    imageTools: {
        imageAction: {
            defaultModel: "gpt-image-1",
            models: [
                { label: "GPT Image 1", model: "gpt-image-1" },
                { label: "Flux", model: "flux" },
                { label: "DALL-E 3", model: "dall-e-3" },
            ],
        },
        edit: {
            providerModel: "flux-kontext-pro",
        },
        upscale: {
            imageProviderModel: "topaz/image-upscale",
        },
    },
};
export function openRouterModelForUseCase(useCase) {
    return generationModelRegistry.openRouter[useCase].model;
}
export const defaultSlideshowTextModel = generationModelRegistry.openRouter.slideshowText.model;
export const featuredOpenRouterModelIds = generationModelRegistry.openRouter.tempTestingCenter.featuredModelIds;
export const excludedOpenRouterModelIds = generationModelRegistry.openRouter.tempTestingCenter.excludedModelIds;
export const tempTestingCenterFallbackModels = generationModelRegistry.openRouter.tempTestingCenter.fallbackModels.map((model) => ({
    id: model.id,
    name: model.name,
    contextLength: null,
    promptPrice: "",
    completionPrice: "",
    supportsResponseFormat: true,
    supportsStructuredOutputs: true,
}));
export const imageActionModelOptions = generationModelRegistry.imageTools.imageAction.models;
export const defaultImageActionModel = generationModelRegistry.imageTools.imageAction.defaultModel;
export const kieFluxKontextModel = generationModelRegistry.imageTools.edit.providerModel;
export const kieTopazImageUpscaleModel = generationModelRegistry.imageTools.upscale.imageProviderModel;
