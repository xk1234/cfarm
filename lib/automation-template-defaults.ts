import type {
  AutomationAspectRatio,
  AutomationImageGrid,
  AutomationImageMode,
  AutomationTextAlign,
  AutomationTextAnchor,
  AutomationTextPosition,
  ImageCollectionConfig,
  PromptFormatting,
  TikTokPostMode,
  TikTokPublishType,
  TikTokVisibility,
} from "@/lib/realfarm-automation"
import {
  defaultAutomationLanguage,
  defaultAutomationPublishType,
  defaultSlideshowDuration,
  defaultSlideshowTransition,
} from "@/lib/slideshow-publishing-config"

export type DefaultAutomationTextItemConfig = {
  fontSize: string
  textStyle: string
  font: string
  textPosition: AutomationTextPosition
  textItemWidth: string
  wordLengthMin: number
  wordLengthMax: number
  contentDirection: string
  textMode: "prompt" | "static"
  staticText: string
  textAlign: AutomationTextAlign
  textAnchor: AutomationTextAnchor
}

export type DefaultAutomationFormatSectionConfig = {
  image_url: string
  textItem: DefaultAutomationTextItemConfig
  aspect_ratio: AutomationAspectRatio
  imageGrid: AutomationImageGrid
  slideCount: number
  noText: boolean
  overlay: boolean
  ctaLocation?: "last" | "static"
  ctaStaticPosition?: string
  imageMode?: AutomationImageMode
}

export const defaultAutomationTemplateDefaults = {
  version: "default-automation-template-v1",
  image_fit: "contain" as const,
  language: defaultAutomationLanguage,
  schedule: {
    defaultPostingTime: "11:00 AM",
  },
  themeTones: {
    ugc: "Conversational & Relatable",
    cinema: "Bold & Provocative",
    nature: "Calm & Reflective",
    soccer: "Motivational & Empowering",
    books: "Educational & Informative",
    default: "Conversational & Relatable",
  },
  promptDirections: {
    hook: "Write one strong lowercase hook for the first slide.",
    body: "Write concise lowercase supporting text for body slides.",
    cta: "Write a short direct call to action when CTA text is enabled.",
  },
  prompt_formatting: {
    style:
      "The first slide should have one strong hook text item. Body slides should use concise supporting text. Keep text readable and native to TikTok slideshow memes.",
    narrative: "Create a concise slideshow narrative for the selected topic.",
    num_of_slides: 4,
  } satisfies PromptFormatting,
  image_collection_ids: {
    first_slide: {
      collection: "",
      mode: "collection",
      single_image: null,
    },
    all_slides: "",
    cta_slide: {
      check: false,
      cta_collection_check: false,
      cta_collection_id: "",
      image_id: null,
      cta_location: "last_slide",
    },
    video_demo_asset_id: "",
  } satisfies ImageCollectionConfig,
  formatting: {
    hook: {
      image_url: "",
      textItem: {
        fontSize: "10px",
        textStyle: "whiteText",
        font: "TikTok Display Medium",
        textPosition: "center",
        textItemWidth: "60%",
        wordLengthMin: 5,
        wordLengthMax: 10,
        contentDirection: "",
        textMode: "prompt",
        staticText: "",
        textAlign: "left",
        textAnchor: "flush",
      },
      aspect_ratio: "4:5",
      imageGrid: "none",
      slideCount: 1,
      noText: false,
      overlay: true,
    },
    body: {
      image_url: "",
      textItem: {
        fontSize: "8px",
        textStyle: "whiteText",
        font: "TikTok Display Medium",
        textPosition: "center",
        textItemWidth: "80%",
        wordLengthMin: 5,
        wordLengthMax: 10,
        contentDirection: "",
        textMode: "prompt",
        staticText: "",
        textAlign: "left",
        textAnchor: "flush",
      },
      aspect_ratio: "4:5",
      imageGrid: "none",
      slideCount: 3,
      noText: false,
      overlay: true,
    },
    cta: {
      image_url: "",
      textItem: {
        fontSize: "12px",
        textStyle: "yellowText",
        font: "TikTok Display Medium",
        textPosition: "center",
        textItemWidth: "70%",
        wordLengthMin: 5,
        wordLengthMax: 10,
        contentDirection: "",
        textMode: "prompt",
        staticText: "",
        textAlign: "center",
        textAnchor: "padded",
      },
      aspect_ratio: "4:5",
      imageGrid: "none",
      slideCount: 0,
      ctaLocation: "last",
      ctaStaticPosition: undefined,
      noText: false,
      overlay: false,
      imageMode: "collection",
    },
  } satisfies Record<
    "hook" | "body" | "cta",
    DefaultAutomationFormatSectionConfig
  >,
  tiktok_post_settings: {
    caption: {
      mode: "prompt",
      static_text: "",
      prompt_text:
        'this should be in "lowercase," same exact text as the first text item.',
    },
    description: {
      mode: "prompt",
      static_text: "",
      prompt_text:
        "give me 3-5 broad hashtags related to the topic/niche of the content, all lowercase, nothing else other than 3-5 hashtags",
    },
    visibility: "PUBLIC_TO_EVERYONE" satisfies TikTokVisibility,
    auto_music: true,
    auto_post: false,
    allow_comments: true,
    allow_duet: true,
    allow_stitch: true,
    disclose_video_content: false,
    disclose_brand_organic: false,
    disclose_branded_content: false,
    post_mode: "MEDIA_UPLOAD" satisfies TikTokPostMode,
    publish_type: defaultAutomationPublishType satisfies TikTokPublishType,
    slideshow_transition_style: defaultSlideshowTransition,
    slideshow_slide_duration: defaultSlideshowDuration,
    slideshow_sound_id: "",
    slideshow_sound_name: "",
    slideshow_sound_url: "",
  },
} as const
