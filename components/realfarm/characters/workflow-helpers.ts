import type { AssetRecord } from "@/lib/assets"
import type {
  CharacterWorkflowKey,
  CharacterWorkflowMetadata,
} from "@/lib/realfarm-character-ui"

export function compileWorkflowUserPrompt(input: {
  workflow: CharacterWorkflowKey
  prompt: string
  characterName: string
  moduleRecipe: Record<string, string>
  recreateMode: string
  referenceImageUrl: string
  motionVideoUrl: string
  selfieTemplate: string
  breastSize: string
  clothingImageUrl: string
  photoDumpCount: number
  slideshowSlides: number
  productName: string
  productAudience: string
  productAngle: string
}) {
  const userPrompt = input.prompt.trim()
  const promptLine = userPrompt || workflowFallbackPrompt(input.workflow)

  if (input.workflow === "free_generate") {
    return promptLine
  }

  if (input.workflow === "recreate_reference") {
    return [
      `workflow: recreate reference for ${input.characterName}`,
      "use any reference image only for pose, composition, camera, outfit vibe, and background.",
      `identity must stay as ${input.characterName}.`,
      `recreation mode: ${input.recreateMode}.`,
      `user changes: ${promptLine}`,
    ].join("\n")
  }

  if (input.workflow === "build_modules") {
    return [
      "workflow: build from modules",
      ...Object.entries(input.moduleRecipe).map(
        ([key, value]) => `${key}: ${value}`
      ),
      `user details: ${promptLine}`,
    ].join("\n")
  }

  if (input.workflow === "batch_photo_dump") {
    return [
      "workflow: batch photo dump",
      `theme: ${promptLine}`,
      `generate a coherent lifestyle image from a ${input.photoDumpCount}-image dump.`,
      "vary pose, outfit, background, and camera angle while keeping face, body, phone case, and skin texture consistent.",
    ].join("\n")
  }

  if (input.workflow === "tiktok_slideshow") {
    return [
      "workflow: tiktok slideshow image",
      `topic: ${promptLine}`,
      `this belongs to a ${input.slideshowSlides}-slide vertical photo slideshow.`,
      "create one candid iPhone-style slide image that can work with cover hooks and slide captions.",
    ].join("\n")
  }

  if (input.workflow === "product_ugc") {
    return [
      "workflow: product ugc creative pack",
      `product: ${input.productName || "attached product asset"}`,
      `audience: ${input.productAudience || "target audience from user prompt"}`,
      `angle: ${input.productAngle || promptLine}`,
      "create an authentic UGC ad image. Include product context only if it is attached or described.",
    ].join("\n")
  }

  if (input.workflow === "motion_control") {
    return [
      "workflow: kling motion-control video",
      "Same girl as reference image, identical face and features.",
      "Follow the movement and facial expressions in the video precisely. Smooth realistic animation, natural physics, stable camera.",
      `motion video: ${input.motionVideoUrl || "user-selected trending video"}`,
      `user details: ${promptLine}`,
    ].join("\n")
  }

  if (input.workflow === "seedream_bedroom_selfie") {
    return [
      "workflow: seedream v4 bedroom selfie preset",
      `preset: ${input.selfieTemplate}`,
      `breast size: ${input.breastSize || "d cup"}`,
      `user details: ${promptLine}`,
    ].join("\n")
  }

  if (input.workflow === "outfit_transfer") {
    return [
      "workflow: outfit transfer",
      "have the woman in image 1 wearing the clothing from reference image 2. Preserve facial structure, skin texture, lighting and body proportions.",
      `clothing reference: ${input.clothingImageUrl || "selected outfit asset"}`,
      `user details: ${promptLine}`,
    ].join("\n")
  }

  if (input.workflow === "pose_variation_cut_video") {
    return [
      "workflow: pose cut video",
      "edit the original image into a stronger pose variation, use original/end-frame as Kling 2.5 start and end frames, then add random 0.2-0.3s micro cuts and a random TikTok trending song from the music folder.",
      `user details: ${promptLine}`,
    ].join("\n")
  }

  return [
    "workflow: animate image source",
    "generate a still image that will animate well with subtle selfie movement, natural blinking, slight head tilt, and handheld phone motion.",
    `user details: ${promptLine}`,
  ].join("\n")
}

function workflowFallbackPrompt(workflow: CharacterWorkflowKey) {
  if (workflow === "recreate_reference") {
    return "recreate the reference as a candid UGC image"
  }
  if (workflow === "build_modules") {
    return "create an authentic UGC image from the selected modules"
  }
  if (workflow === "batch_photo_dump") {
    return "casual weekend at home"
  }
  if (workflow === "tiktok_slideshow") {
    return "candid lifestyle slideshow"
  }
  if (workflow === "product_ugc") {
    return "create a product UGC image"
  }
  if (workflow === "animate_image") {
    return "create a still image suitable for animation"
  }
  if (workflow === "motion_control") {
    return "apply the trending video motion to this character"
  }
  if (workflow === "seedream_bedroom_selfie") {
    return "generate a preset bedroom selfie"
  }
  if (workflow === "outfit_transfer") {
    return "transfer the selected outfit onto this character"
  }
  if (workflow === "pose_variation_cut_video") {
    return "create a start/end frame pose video with micro cuts and music"
  }
  return "Generate an authentic UGC image featuring this character."
}

export function buildWorkflowMetadata(input: {
  workflow: CharacterWorkflowKey
  workflowLabel: string
  moduleRecipe: Record<string, string>
  recreateMode: string
  referenceImageUrl: string
  motionVideoUrl: string
  selfieTemplate: string
  breastSize: string
  clothingImageUrl: string
  photoDumpCount: number
  slideshowSlides: number
  productName: string
  productAudience: string
  productAngle: string
}): CharacterWorkflowMetadata {
  const recipe: Record<string, unknown> = {}

  if (input.workflow === "recreate_reference") {
    recipe.mode = input.recreateMode
    recipe.referenceImageUrl = input.referenceImageUrl
    recipe.referenceUse =
      "pose, composition, camera, outfit vibe, and background only"
  }
  if (input.workflow === "build_modules") {
    Object.assign(recipe, input.moduleRecipe)
  }
  if (input.workflow === "batch_photo_dump") {
    recipe.imageCount = input.photoDumpCount
    recipe.vary = ["pose", "outfit", "background", "camera angle"]
    recipe.keepConsistent = ["face", "body", "phone case", "skin texture"]
  }
  if (input.workflow === "tiktok_slideshow") {
    recipe.slideCount = input.slideshowSlides
    recipe.outputs = ["images", "slide captions", "cover hook"]
  }
  if (input.workflow === "product_ugc") {
    recipe.productName = input.productName
    recipe.audience = input.productAudience
    recipe.angle = input.productAngle
    recipe.creativePack = [
      "hook image",
      "holding product",
      "before/after",
      "reaction selfie",
      "result shot",
    ]
  }
  if (input.workflow === "animate_image") {
    recipe.motionPreset = "Subtle selfie movement"
  }
  if (input.workflow === "motion_control") {
    recipe.motionVideoUrl = input.motionVideoUrl
    recipe.character_orientation = "image"
  }
  if (input.workflow === "seedream_bedroom_selfie") {
    recipe.template = input.selfieTemplate
    recipe.breastSize = input.breastSize || "d cup"
  }
  if (input.workflow === "outfit_transfer") {
    recipe.clothingImageUrl = input.clothingImageUrl
  }
  if (input.workflow === "pose_variation_cut_video") {
    recipe.steps = [
      "generate pose variation end frame",
      "animate original and end frame with Kling 2.5",
      "add random micro cuts",
      "add random TikTok trend audio",
    ]
  }

  return {
    workflow: input.workflow,
    workflowLabel: input.workflowLabel,
    recipe,
  }
}

export function generationCountForWorkflow(input: {
  workflow: CharacterWorkflowKey
  imageGenerateCount: number
  photoDumpCount: number
  slideshowSlides: number
}) {
  if (
    input.workflow === "recreate_reference" ||
    input.workflow === "build_modules" ||
    input.workflow === "product_ugc"
  ) {
    return clampNumber(input.imageGenerateCount, 1, 5)
  }
  if (input.workflow === "batch_photo_dump") {
    return clampNumber(input.photoDumpCount, 1, 12)
  }
  if (input.workflow === "tiktok_slideshow") {
    return clampNumber(input.slideshowSlides, 2, 10)
  }
  if (
    input.workflow === "motion_control" ||
    input.workflow === "seedream_bedroom_selfie" ||
    input.workflow === "outfit_transfer" ||
    input.workflow === "pose_variation_cut_video"
  ) {
    return 1
  }
  return 1
}

export function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min
  }
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function createPendingGenerationId(batchIndex: number) {
  return `${Date.now()}-${batchIndex + 1}`
}

export function hasImageDragItems(dataTransfer: DataTransfer) {
  const items = Array.from(dataTransfer.items ?? [])
  if (items.length > 0) {
    return items.some(
      (item) => item.kind === "file" && item.type.startsWith("image/")
    )
  }
  return Array.from(dataTransfer.files ?? []).some((file) =>
    file.type.startsWith("image/")
  )
}

export function ratioToCss(value: string) {
  return value.includes(":") ? value.replace(":", " / ") : "4 / 5"
}

export function referenceAssetReady(asset: AssetRecord | null) {
  return asset?.metadata?.analysisStatus === "ready" && Boolean(asset.fileUrl)
}
