import type { AssetCategory } from "@/lib/assets"

export const characterAttributeOptionsConfig: Record<string, string[]> = {
  gender: ["female", "male"],
  age: ["20", "27", "35", "45", "55", "65"],
  ethnicity: [
    "somali",
    "mexican",
    "east-asian",
    "south-asian",
    "black",
    "white",
    "middle-eastern",
    "latina",
  ],
  "skin.tone": ["fair", "olive", "brown", "deep", "mexican", "somali"],
  "skin.undertone": ["warm", "cool", "neutral", "golden"],
  "skin.texture": ["clear", "dewy", "textured", "matte"],
  "skin.visible_details": [
    "none",
    "light freckles",
    "moderate freckles",
    "one beauty mark",
    "small facial scar",
  ],
  "facial_features.face_shape": [
    "oval",
    "round",
    "square",
    "oblong",
    "heart",
    "wide",
  ],
  "facial_features.forehead": ["short", "average", "tall", "broad"],
  "facial_features.jawline": ["soft", "rounded", "square", "sharp"],
  "facial_features.chin": ["rounded", "square", "receding", "pointed"],
  "facial_features.cheekbones": ["soft", "prominent", "high"],
  "facial_features.nose": ["narrow", "wide", "button", "roman"],
  "facial_features.lips": ["thin", "medium", "full", "wide"],
  "facial_features.eyebrows": [
    "thin",
    "arched",
    "straight",
    "thick",
    "feathered",
  ],
  "facial_features.other_distinctive_features": [
    "none",
    "chin dimple",
    "small facial scar",
    "beauty mark",
    "subtle dimples",
  ],
  "hair.color": ["black", "brown", "auburn", "blonde", "gray"],
  "hair.style": ["slicked-back", "pixie", "waves", "braids", "loose-curls"],
  "hair.length": ["short", "medium", "long", "very-long", "waist-length"],
  "hair.texture": ["straight", "wavy", "curly", "coily", "fine", "sleek"],
  "hair.highlights": [
    "none",
    "platinum-tips",
    "caramel",
    "silver",
    "sun-bleached",
  ],
  "hair.part": ["none", "center", "side", "messy"],
  "eyes.color": ["brown", "green", "blue", "hazel", "gray", "black"],
  "eyes.shape": ["almond", "hooded", "round", "deep-set"],
  "eyes.details": ["bright", "slight circles", "deep circles", "heavy lids"],
  "build.body_type": ["slim", "average", "athletic", "hourglass", "broad"],
  "build.height_impression": ["very-short", "short", "average", "tall"],
  "clothing.outfit_description": [
    "streetwear",
    "quiet luxury",
    "editorial",
    "minimal",
    "athleisure",
    "dark academia",
  ],
  "clothing.top": ["t-shirt", "hoodie", "button-down", "blazer", "tank"],
  "clothing.bottoms": [
    "jeans",
    "tailored trousers",
    "shorts",
    "skirt",
    "leggings",
  ],
  "clothing.footwear": ["sneakers", "boots", "loafers", "sandals"],
  "clothing.makeup": ["none", "natural", "glossy", "editorial"],
  "posture_and_mannerisms.posture": [
    "upright",
    "relaxed",
    "leaning forward",
    "casual slouch",
  ],
  "posture_and_mannerisms.body_language": [
    "calm",
    "confident",
    "animated",
    "reserved",
  ],
  "posture_and_mannerisms.gestures": [
    "measured hand movement",
    "talks with hands",
    "minimal gestures",
    "points to camera",
  ],
  "emotional_baseline.primary_emotion": ["calm", "warm", "serious", "playful"],
  "emotional_baseline.demeanor": [
    "confident",
    "friendly",
    "reserved",
    "direct",
  ],
  "emotional_baseline.communication_style": [
    "direct",
    "conversational",
    "soft-spoken",
    "energetic",
  ],
  "accessories.visible_accessories": [
    "none",
    "studs",
    "chain",
    "watch",
    "mixed-metals",
    "round glasses",
  ],
  "voice.tone": ["warm", "low", "bright", "raspy"],
  "voice.clarity": ["clear", "soft", "crisp", "muffled"],
  "voice.vocal_quality": ["steady", "breathy", "smooth", "textured"],
  "voice.speech_patterns": [
    "natural conversational pacing",
    "fast",
    "slow",
    "deliberate",
  ],
}

export const characterEditorTabsConfig = [
  "Overview",
  "Voice",
  "Images",
  "Videos",
  "Settings",
] as const

export type CharacterEditorTabConfig =
  (typeof characterEditorTabsConfig)[number]

export const characterEditorFieldsConfig: Record<
  Exclude<CharacterEditorTabConfig, "Overview">,
  string[]
> = {
  Voice: [
    "voice.tone",
    "voice.clarity",
    "voice.vocal_quality",
    "voice.speech_patterns",
  ],
  Images: [],
  Videos: [],
  Settings: [],
}

export const characterSummaryFieldsConfig: [string, string][] = [
  ["Gender", "gender"],
  ["Age", "age"],
  ["Ethnicity", "ethnicity"],
  ["Tone", "skin.tone"],
  ["Undertone", "skin.undertone"],
  ["Texture", "skin.texture"],
  ["Visible Details", "skin.visible_details"],
  ["Shape", "facial_features.face_shape"],
  ["Jawline", "facial_features.jawline"],
  ["Cheekbones", "facial_features.cheekbones"],
  ["Chin", "facial_features.chin"],
  ["Nose", "facial_features.nose"],
  ["Lips", "facial_features.lips"],
  ["Hair Color", "hair.color"],
  ["Hair Style", "hair.style"],
]

export const defaultCharacterPreviewUrlConfig =
  "/api/local-assets/characters/headshots/default-profile.png"

export const defaultCharacterHeadshotPromptConfig =
  "professional front-facing headshot, clean white background"

export const characterImageAspectRatiosConfig = [
  "9:16",
  "4:5",
  "1:1",
  "16:9",
  "3:4",
  "4:3",
] as const

export type CharacterAssetTab =
  "outfits" | "accessories" | "background" | "products"

export type CharacterAssetCategoryByTab = Record<
  CharacterAssetTab,
  AssetCategory
>
