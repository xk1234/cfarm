import { clean } from "@/lib/guards"
export type ReferenceRecreationAnalysis = {
  composition: Record<string, unknown>
  camera: Record<string, unknown>
  pose: Record<string, unknown>
  facial_expression: Record<string, unknown>
  hair: Record<string, unknown>
  clothing: Record<string, unknown>
  accessories: Record<string, unknown>
  environment: Record<string, unknown>
  lighting: Record<string, unknown>
  recreation_notes: Record<string, unknown>
}

export type BedroomSelfieTemplateId =
  | "barely_awake_oversized_tee"
  | "tank_top_flirty_smile"
  | "messy_bun_glasses"
  | "sheet_pull_soft_smile_bralette"

export const defaultReferenceAnalysisModel = "openai/gpt-5.5"
export const nanoBananaProModel = "nano-banana-pro"
export const klingMotionControlModel = "kling-3.0/motion-control"
export const klingV25StartEndFrameModel = "kling/v2-5-turbo-image-to-video-pro"
export const seedreamV4EditModel = "bytedance/seedream-v4-edit"
export const wanClothingEditModel = "wan/2-7-image"

export function buildReferenceAnalysisOpenRouterRequest(input: {
  referenceImageUrl: string
}) {
  return {
    model: defaultReferenceAnalysisModel,
    messages: [
      {
        role: "system",
        content: [
          "Extract a structured visual recreation recipe from the uploaded reference image.",
          "Do not identify the person. Describe only composition, camera, pose, expression, styling, environment, and lighting.",
          "Return values that can guide a photorealistic UGC image recreation while preserving a different character identity.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this reference image for pose, composition, camera, outfit vibe, environment, and lighting. Return only the structured JSON required by the schema.",
          },
          {
            type: "image_url",
            image_url: { url: input.referenceImageUrl },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ugc_reference_recreation_analysis",
        strict: true,
        schema: referenceAnalysisJsonSchema,
      },
    },
  } as const
}

export function parseReferenceAnalysisContent(
  content: unknown
): ReferenceRecreationAnalysis {
  const text = typeof content === "string" ? content.trim() : ""
  if (!text) {
    throw new Error("Reference analysis returned an empty response")
  }
  const unfenced = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
  const start = unfenced.indexOf("{")
  const end = unfenced.lastIndexOf("}")
  const jsonText =
    start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced
  const parsed = JSON.parse(jsonText) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Reference analysis did not return an object")
  }
  return parsed as ReferenceRecreationAnalysis
}

export function buildNanoBananaProPayload(input: {
  prompt: string
  imageUrls: string[]
  aspectRatio?: string
  resolution?: "1K" | "2K" | "4K"
}) {
  return {
    model: nanoBananaProModel,
    input: {
      prompt: clean(input.prompt),
      image_input: input.imageUrls.map(clean).filter(Boolean).slice(0, 8),
      aspect_ratio: normalizeNanoAspectRatio(input.aspectRatio),
      resolution: input.resolution ?? "1K",
      output_format: "png",
    },
  }
}

export function buildReferenceRecreationPrompt(input: {
  characterName: string
  characterJson: unknown
  analysis: ReferenceRecreationAnalysis
  userPrompt?: string
}) {
  return [
    `Create a photorealistic UGC image of ${input.characterName}.`,
    "Use image 1 only for the character identity, face, features, skin texture, and body proportions.",
    "Use the reference recipe JSON below for pose, composition, camera, outfit vibe, background, and lighting.",
    "Do not copy the reference person's identity. The identity must stay as the character in image 1.",
    `reference recipe:\n${JSON.stringify(input.analysis, null, 2)}`,
    `character:\n${JSON.stringify(input.characterJson, null, 2)}`,
    clean(input.userPrompt) ? `user changes:\n${clean(input.userPrompt)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function buildKlingMotionControlPayload(input: {
  prompt: string
  characterImageUrl: string
  motionVideoUrl: string
}) {
  return {
    model: klingMotionControlModel,
    input: {
      prompt: clean(input.prompt),
      input_urls: [clean(input.characterImageUrl)],
      video_urls: [clean(input.motionVideoUrl)],
      mode: "720p",
      character_orientation: "image",
      background_source: "input_video",
    },
  }
}

export function buildPoseVariationPrompt() {
  return "Edit the original image to create a strong pose variation. Increase head tilt significantly. Lean the face slightly closer toward the camera. Angle the head downward and sideways as if filmed from a tilted handheld selfie. Preserve identity, face structure, hairstyle, and outfit. Background and lighting may remain simple."
}

export function buildKlingV25StartEndFramePayload(input: {
  prompt: string
  startImageUrl: string
  endImageUrl: string
  duration?: "5" | "10"
}) {
  return {
    model: klingV25StartEndFrameModel,
    input: {
      prompt: clean(input.prompt),
      image_url: clean(input.startImageUrl),
      tail_image_url: clean(input.endImageUrl),
      duration: input.duration ?? "5",
      negative_prompt:
        "blur, distort, low quality, warped face, identity drift",
      cfg_scale: 0.5,
    },
  }
}

export function buildSeedreamBedroomSelfiePrompt(input: {
  template: BedroomSelfieTemplateId
  breastSize?: string
}) {
  const breastSize = clean(input.breastSize) || "d cup"
  return `${bedroomSelfieTemplates[input.template] ?? bedroomSelfieTemplates.barely_awake_oversized_tee} adult woman. ${breastSize}. Preserve the attached character identity, face, features, skin texture, and body proportions.`
}

export function buildSeedreamV4EditPayload(input: {
  prompt: string
  imageUrls: string[]
}) {
  return {
    model: seedreamV4EditModel,
    input: {
      prompt: clean(input.prompt),
      image_urls: input.imageUrls.map(clean).filter(Boolean).slice(0, 10),
      image_size: "portrait_16_9",
      image_resolution: "1K",
      max_images: 1,
      nsfw_checker: true,
    },
  }
}

export function buildWanClothingEditPayload(input: {
  influencerImageUrl: string
  clothingImageUrl: string
}) {
  return {
    model: wanClothingEditModel,
    input: {
      prompt:
        "have the woman in image 1 wearing the clothing from reference image 2. Preserve facial structure, skin texture, lighting and body proportions.",
      input_urls: [
        clean(input.influencerImageUrl),
        clean(input.clothingImageUrl),
      ],
      aspect_ratio: "9:16",
      enable_sequential: false,
      n: 1,
      resolution: "2K",
      thinking_mode: false,
      watermark: false,
    },
  }
}

const bedroomSelfieTemplates: Record<BedroomSelfieTemplateId, string> = {
  barely_awake_oversized_tee:
    "grainy low-light bedroom selfie, natural handheld selfie in a dimly lit bedroom at night, lying on bed. moody uneven lighting. visible pillow and duvet. handheld iphone camera photo. grainy iphone camera quality. low exposure, intimate candid vibe. head slightly tilted downward, soft unfocused gaze, relaxed eyelids. hair slightly messy. one hand under cheek. shoulder angled slightly toward camera. wearing an oversized white t-shirt. Looking directly at camera.",
  tank_top_flirty_smile:
    "grainy low-light bedroom selfie, natural handheld selfie in a dimly lit bedroom at night, lying on bed. moody uneven lighting. visible pillow, handheld iphone camera photo. grainy iphone camera quality. low exposure, intimate candid vibe. soft flirty smirk, head tilted toward shoulder. framing slightly cropped at forehead. wearing a ribbed white tank top.",
  messy_bun_glasses:
    "grainy low-light bedroom selfie, natural handheld selfie in a dimly lit bedroom at night. moody uneven lighting. visible pillow and soft background blur. handheld iphone camera photo. grainy iphone camera quality. low exposure, intimate candid vibe. pouty glossy lips, relaxed eyes, subtle chin-down angle creating flirty look. wearing a black cotton spaghetti strap top. Hair in messy bun. Wearing black glasses with clear lens. Looking directly at camera.",
  sheet_pull_soft_smile_bralette:
    "grainy low-light bedroom selfie, natural handheld selfie lying on side in bed in a dimly lit bedroom in the morning. soft diffused light from window. visible pillow, white duvet pulled halfway up chest. handheld iphone camera photo. grainy iphone camera quality. low exposure, intimate candid vibe. low exposure, gentle soft smile, relaxed eyes, slightly flushed cheeks. head tilted into pillow, hair slightly tangled. wearing a simple white cotton bralette. Looking directly at camera.",
}

function normalizeNanoAspectRatio(value: unknown) {
  const ratio = clean(value)
  return [
    "1:1",
    "2:3",
    "3:2",
    "3:4",
    "4:3",
    "4:5",
    "5:4",
    "9:16",
    "16:9",
    "21:9",
    "auto",
  ].includes(ratio)
    ? ratio
    : "9:16"
}


const stringSchema = { type: "string" } as const
const stringArraySchema = { type: "array", items: stringSchema } as const
const nullableStringSchema = { type: ["string", "null"] } as const

const referenceAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "composition",
    "camera",
    "pose",
    "facial_expression",
    "hair",
    "clothing",
    "accessories",
    "environment",
    "lighting",
    "recreation_notes",
  ],
  properties: {
    composition: objectSchema([
      "orientation",
      "framing",
      "subject_position",
      "crop",
      "depth_of_field",
      "background_perspective",
    ]),
    camera: objectSchema([
      "shot_type",
      "camera_angle",
      "camera_distance",
      "lens_feel",
      "capture_device",
      "image_texture",
    ]),
    pose: objectSchema([
      "body_orientation",
      "torso_position",
      "head_position",
      "arm_position",
      "hand_position",
      "leg_position",
      "gaze_direction",
    ]),
    facial_expression: objectSchema(["eyes", "mouth", "overall_expression"]),
    hair: {
      type: "object",
      additionalProperties: false,
      required: [
        "length",
        "color",
        "texture",
        "parting",
        "placement",
        "hair_accessories",
      ],
      properties: {
        length: stringSchema,
        color: stringSchema,
        texture: stringSchema,
        parting: stringSchema,
        placement: stringSchema,
        hair_accessories: stringArraySchema,
      },
    },
    clothing: {
      type: "object",
      additionalProperties: false,
      required: ["top", "outerwear", "bottom", "footwear"],
      properties: {
        top: clothingItemSchema(false),
        outerwear: clothingItemSchema(false),
        bottom: clothingItemSchema(false),
        footwear: clothingItemSchema(true),
      },
    },
    accessories: {
      type: "object",
      additionalProperties: false,
      required: ["jewelry", "face_accessories", "handheld_items", "other"],
      properties: {
        jewelry: stringArraySchema,
        face_accessories: stringArraySchema,
        handheld_items: stringArraySchema,
        other: stringArraySchema,
      },
    },
    environment: {
      type: "object",
      additionalProperties: false,
      required: [
        "location_type",
        "setting",
        "background_elements",
        "ground_surface",
        "weather",
        "time_of_day",
        "props",
      ],
      properties: {
        location_type: stringSchema,
        setting: stringSchema,
        background_elements: stringArraySchema,
        ground_surface: stringSchema,
        weather: stringSchema,
        time_of_day: stringSchema,
        props: stringArraySchema,
      },
    },
    lighting: {
      type: "object",
      additionalProperties: false,
      required: [
        "main_light_source",
        "secondary_light_sources",
        "direction",
        "intensity",
        "color_temperature",
        "shadow_quality",
        "reflections",
      ],
      properties: {
        main_light_source: stringSchema,
        secondary_light_sources: stringArraySchema,
        direction: stringSchema,
        intensity: stringSchema,
        color_temperature: stringSchema,
        shadow_quality: stringSchema,
        reflections: stringSchema,
      },
    },
    recreation_notes: {
      type: "object",
      additionalProperties: false,
      required: ["must_preserve", "can_change", "avoid"],
      properties: {
        must_preserve: stringArraySchema,
        can_change: stringArraySchema,
        avoid: stringArraySchema,
      },
    },
  },
} as const

function objectSchema(keys: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: keys,
    properties: Object.fromEntries(keys.map((key) => [key, stringSchema])),
  }
}

function clothingItemSchema(nullable: boolean) {
  const valueSchema = nullable ? nullableStringSchema : stringSchema
  return {
    type: "object",
    additionalProperties: false,
    required: ["type", "color", "fit", "details"],
    properties: {
      type: valueSchema,
      color: valueSchema,
      fit: nullable ? nullableStringSchema : stringSchema,
      details: valueSchema,
    },
  }
}
