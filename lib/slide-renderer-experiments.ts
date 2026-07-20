import {
  renderedSlideSvg,
  type SlideshowSlide,
  type SlideshowTextItem,
} from "@/lib/slideshow-renderer"

export type SlideRendererStressCase = {
  id: string
  previewUrl: string
  aspectRatio: "9:16" | "4:5" | "1:1"
  wordCount: number
  settings: {
    seed: number
    font: string
    aspectRatio: "9:16" | "4:5" | "1:1"
    overlay: boolean
    overlayImage: boolean
    background: {
      hueA: number
      hueB: number
      pattern: string
    }
    imageUrl: string
    textItems: SlideshowTextItem[]
  }
}

export type SlideSettingImpact =
  "renderer" | "structural" | "generation" | "fixed"

export type SlideSettingExample = {
  label: string
  previewUrls: string[]
  note?: string
  value: unknown
  slideshow: AtlasSlideshowDocument
}

export type AtlasImageSource = {
  url: string
  dataUrl: string
}

export type AtlasSlideshowDocument = {
  settings: {
    duration: number
    aspect_ratio: string
    font: string
    background_color: string
    transition_style: string
    export_as_video: boolean
    sound_id: string
    sound_name: string
    sound_url: string
  }
  images: SlideshowSlide[]
}

export type SlideSettingComparison = {
  id: string
  title: string
  category:
    | "Hooks & voice"
    | "Whole slideshow"
    | "Slide media"
    | "Text box"
    | "Structure & AI"
  editorLocation: string
  description: string
  impact: SlideSettingImpact
  values: SlideSettingExample[]
}

const loremWords =
  "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure dolor reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa officia deserunt mollit anim id est laborum".split(
    " "
  )

const aspectRatios = ["9:16", "4:5", "1:1"] as const
const fonts = [
  "Default",
  "TikTok Display Medium",
  "Bebas Neue",
  "Elegance",
  "Elegance Italic",
  "Arial Black",
  "Georgia",
] as const
const fontSizes = [
  "6px",
  "8px",
  "10px",
  "12px",
  "14px",
  "16px",
  "18px",
  "20px",
  "24px",
] as const
const textStyles = [
  "outline",
  "whiteText",
  "blackText",
  "yellowText",
  "whiteBackground",
  "white50Background",
  "blackBackground",
  "black50Background",
] as const
const textAlignments = ["left", "center", "right"] as const
const textAnchors = ["padded", "flush"] as const
const textPlacements = ["top", "center", "bottom", "custom"] as const
const patterns = ["rings", "diagonal", "spotlight", "split"] as const

const visualEditorSettingIds = new Set([
  "aspect-ratio",
  "font",
  "image-fitting",
  "dark-overlay",
  "overlay-image",
  "overlay-padding",
  "text-style",
  "text-size",
  "text-position",
  "text-width",
  "alignment",
  "horizontal-padding",
  "vertical-padding",
  "display-text",
])

export function generateSlideRendererStressCases(
  count = 50,
  seed = 318_2026,
  imageSources: AtlasImageSource[] = []
): SlideRendererStressCase[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    generateStressCase(seed + index * 7919, index, imageSources)
  )
}

/**
 * Deterministic, one-variable-at-a-time comparisons for the slideshow editor
 * documentation. Every visible frame is produced by renderedSlideSvg().
 */
export function generateSlideshowSettingComparisons(
  imageSources: AtlasImageSource[] = []
): SlideSettingComparison[] {
  let previewSequence = 0
  const compare = (
    input: Omit<SlideSettingComparison, "values"> & {
      values: Array<{
        label: string
        value: unknown
        options?: AtlasRenderOptions
        note?: string
        count?: number
      }>
    }
  ): SlideSettingComparison => ({
    ...input,
    values: input.values.map(({ label, value, options, note, count = 1 }) => {
      const variants = Array.from(
        { length: count },
        () => options?.variant ?? previewSequence++
      )
      return {
        label,
        value,
        note,
        previewUrls: variants.map((variant) =>
          atlasSlide({ ...options, variant }, imageSources)
        ),
        slideshow: atlasSlideshowDocument(options, variants, imageSources),
      }
    }),
  })

  const comparisons = [
    compare({
      id: "hook-library",
      title: "Hooks",
      category: "Hooks & voice",
      editorLocation: "Hooks & style → Hooks",
      description:
        "Stores one hook per line. Generation selects and resolves one hook for the first slide; the examples show representative resolved output.",
      impact: "generation",
      values: [
        {
          label: "Question hook",
          value: "Why does your living room still feel unfinished?",
          options: { text: "Why does your living room still feel unfinished?" },
        },
        {
          label: "Contrarian hook",
          value: "Your room does not need more decor",
          options: { text: "Your room does not need more decor" },
        },
        {
          label: "List hook",
          value: "3 details that make a room look expensive",
          options: { text: "3 details that make a room look expensive" },
        },
      ],
    }),
    compare({
      id: "hook-casing",
      title: "Hook casing",
      category: "Hooks & voice",
      editorLocation: "Hooks & style → Hooks",
      description:
        "Transforms hook text while preserving variable tokens. Mixed keeps the capitalization entered by the author.",
      impact: "generation",
      values: [
        ["all lowercase", "small choices make a room feel intentional"],
        ["ALL UPPERCASE", "SMALL CHOICES MAKE A ROOM FEEL INTENTIONAL"],
        ["Title Case", "Small Choices Make A Room Feel Intentional"],
        ["First word uppercase", "Small choices make a room feel intentional"],
        ["Mixed", "Small choices make a ROOM feel intentional"],
      ].map(([label, text]) => ({
        label,
        value: label,
        options: { text },
      })),
    }),
    compare({
      id: "hook-no-duplicates",
      title: "No duplicate values per hook",
      category: "Hooks & voice",
      editorLocation: "Hooks & style → Hooks",
      description:
        "Controls whether repeated collection variables may resolve to the same value inside one hook.",
      impact: "generation",
      values: [
        {
          label: "Off · repeats allowed",
          value: false,
          options: { text: "Layer linen with linen for an effortless room" },
        },
        {
          label: "On · unique values",
          value: true,
          options: { text: "Layer linen with oak for an effortless room" },
        },
      ],
    }),
    compare({
      id: "tone",
      title: "Tone",
      category: "Hooks & voice",
      editorLocation: "Hooks & style → Style",
      description:
        "Guides the voice of generated slide copy. These deterministic sample lines make each preset's intended direction visually comparable without calling an LLM.",
      impact: "generation",
      values: [
        [
          "Conversational & Relatable",
          "This one change makes the whole room feel calmer",
        ],
        [
          "Motivational & Empowering",
          "You can create a home that finally feels like you",
        ],
        [
          "Educational & Informative",
          "Repeating one material creates visual continuity",
        ],
        ["Bold & Provocative", "Stop filling every empty corner"],
        [
          "Calm & Reflective",
          "Let the room breathe before adding another object",
        ],
        ["Witty & Humorous", "Your throw pillows are not a personality test"],
        ["Witty & Relatable", "Yes, the big light really is the problem"],
        [
          "Practical & Aspirational",
          "Start with one anchor piece, then layer slowly",
        ],
        [
          "Authoritative & Reassuring",
          "Use this proportion and the room will feel balanced",
        ],
        ["Custom", "Quiet luxury without the showroom stiffness"],
      ].map(([label, text]) => ({
        label,
        value: label,
        options: { text },
      })),
    }),
    compare({
      id: "slideshow-writing-style",
      title: "Slideshow writing style",
      category: "Hooks & voice",
      editorLocation: "Hooks & style → Style",
      description:
        "Adds free-form writing instructions to every generated slide. It changes generated wording, not the renderer itself.",
      impact: "generation",
      values: [
        {
          label: "Short editorial",
          value: "Short editorial lines. No filler.",
          options: { text: "Warm wood. Soft light. One clear focal point." },
        },
        {
          label: "Detailed teaching",
          value: "Explain the design principle and why it works.",
          options: {
            text: "A repeated wood tone connects separate pieces and makes the layout feel deliberate",
          },
        },
      ],
    }),
    compare({
      id: "aspect-ratio",
      title: "Aspect ratio",
      category: "Whole slideshow",
      editorLocation: "Hooks & style → Slides",
      description:
        "Changes the frame dimensions for every Hook, Content, and CTA slide. Text wrapping is recalculated inside the new frame.",
      impact: "renderer",
      values: ["9:16", "4:5", "3:4", "3:2", "1:1"].map((value) => ({
        label: value,
        value,
        options: { aspectRatio: value },
      })),
    }),
    compare({
      id: "font",
      title: "Font",
      category: "Whole slideshow",
      editorLocation: "Hooks & style → Slides",
      description:
        "Applies one font family to every text box. The renderer keeps Inter and Arial as fallbacks when a named font is unavailable.",
      impact: "renderer",
      values: ["TikTok Display Medium", "Inter", "Arial"].map((value) => ({
        label: value,
        value,
        options: { font: value },
      })),
    }),
    compare({
      id: "image-fitting",
      title: "Image fitting",
      category: "Whole slideshow",
      editorLocation: "Hooks & style → Slides",
      description:
        "Currently fixed to centered cover cropping. The editor intentionally exposes no alternate value.",
      impact: "fixed",
      values: [
        {
          label: "Cover — crop edges",
          value: "cover",
          note: "Fixed value; the source image fills the complete frame.",
        },
      ],
    }),
    compare({
      id: "dark-overlay",
      title: "Dark overlay / CTA Overlay",
      category: "Whole slideshow",
      editorLocation: "Hooks & style → Slides; Format → CTA",
      description:
        "Adds the production renderer's 20% black readability layer above the source image and below text.",
      impact: "renderer",
      values: [
        { label: "Off", value: false, options: { overlay: false } },
        { label: "On", value: true, options: { overlay: true } },
      ],
    }),
    compare({
      id: "collection",
      title: "Hook, Content, or CTA collection",
      category: "Slide media",
      editorLocation: "Format → Hook / Content / CTA",
      description:
        "Selects the source-image pool. The renderer receives the chosen image; collection randomization happens before rendering.",
      impact: "renderer",
      values: [
        { label: "Ocean", value: "ocean", options: { source: "ocean" } },
        {
          label: "Interior",
          value: "interior",
          options: { source: "interior" },
        },
        { label: "Desert", value: "desert", options: { source: "desert" } },
      ],
    }),
    compare({
      id: "overlay-image",
      title: "Overlay Image",
      category: "Slide media",
      editorLocation: "Format → Content / CTA",
      description:
        "Places a second 16:9 image above the background. Its collection chooses the overlay media; Padding controls its width.",
      impact: "renderer",
      values: [
        { label: "Off", value: false, options: { overlayImage: false } },
        { label: "On", value: true, options: { overlayImage: true } },
      ],
    }),
    compare({
      id: "overlay-padding",
      title: "Overlay image Padding",
      category: "Slide media",
      editorLocation: "Format → Content → Overlay Image",
      description:
        "Insets the overlay image from both sides. Renderer values above 40% are clamped to 40%, even though the number field accepts up to 100%.",
      impact: "renderer",
      values: [0, 10, 25, 40, 100].map((value) => ({
        label: `${value}%`,
        value,
        options: { overlayImage: true, overlayPadding: value },
        note:
          value === 100
            ? "Same rendered result as 40% because of the renderer clamp."
            : undefined,
      })),
    }),
    compare({
      id: "image-overrides",
      title: "Image overrides",
      category: "Slide media",
      editorLocation: "Format → Content → Image overrides",
      description:
        "Replaces the collection for one numbered content slide without changing the rest of the slideshow.",
      impact: "structural",
      values: [
        { label: "Default collection", value: null, count: 3 },
        {
          label: "Slide 2 overridden",
          value: { slideIndex: 2, collection: "desert" },
          options: { source: "desert" },
          count: 3,
          note: "In the app, only the targeted slide changes source collection.",
        },
      ],
    }),
    compare({
      id: "text-style",
      title: "Style",
      category: "Text box",
      editorLocation: "Format → select text → Style",
      description:
        "Changes text fill, outline, or the per-line tight highlight background. Highlight rectangles follow each wrapped line's actual length.",
      impact: "renderer",
      values: [
        ["White Text", "whiteText"],
        ["Yellow Text", "yellowText"],
        ["Black Text", "blackText"],
        ["Background", "background"],
        ["Dark Background", "black50Background"],
        ["Outline", "outline"],
      ].map(([label, value]) => ({
        label,
        value,
        options: { textStyle: value },
      })),
    }),
    compare({
      id: "text-size",
      title: "Size",
      category: "Text box",
      editorLocation: "Format → select text → Size",
      description:
        "Scales glyphs and line height. Larger sizes also wrap sooner because the text box width stays fixed.",
      impact: "renderer",
      values: [
        "8px",
        "10px",
        "12px",
        "14px",
        "16px",
        "18px",
        "20px",
        "22px",
        "24px",
      ].map((value) => ({ label: value, value, options: { fontSize: value } })),
    }),
    compare({
      id: "text-position",
      title: "Position",
      category: "Text box",
      editorLocation: "Format → select text → Position",
      description:
        "Moves the text group to the top, optical center, or bottom safe area of the slide.",
      impact: "renderer",
      values: ["top", "center", "bottom"].map((value) => ({
        label: titleCase(value),
        value,
        options: {
          textPlacement: value as AtlasRenderOptions["textPlacement"],
        },
      })),
    }),
    compare({
      id: "text-width",
      title: "Width",
      category: "Text box",
      editorLocation: "Format → select text → Width",
      description:
        "Sets the wrapping box as a percentage of frame width. It does not stretch the letters.",
      impact: "renderer",
      values: [40, 50, 60, 70, 80, 90, 100].map((value) => ({
        label: `${value}%`,
        value: `${value}%`,
        options: { textWidth: value },
      })),
    }),
    compare({
      id: "word-length",
      title: "Word length",
      category: "Text box",
      editorLocation: "Format → select text → Word length",
      description:
        "Constrains generated copy length. It is a generation setting, but longer generated text visibly creates more wrapped lines.",
      impact: "generation",
      values: [
        [2, 3],
        [5, 10],
        [10, 15],
        [15, 20],
        [20, 25],
        [25, 30],
      ].map(([minimum, maximum]) => ({
        label: `${minimum}–${maximum} words`,
        value: { minimum, maximum },
        options: { wordCount: maximum },
      })),
    }),
    compare({
      id: "alignment",
      title: "Alignment",
      category: "Text box",
      editorLocation: "Format → select text → Alignment",
      description:
        "Aligns wrapped lines left, center, or right and changes the SVG text anchor.",
      impact: "renderer",
      values: ["left", "center", "right"].map((value) => ({
        label: `${titleCase(value)} align`,
        value,
        options: { textAlign: value as AtlasRenderOptions["textAlign"] },
      })),
    }),
    compare({
      id: "horizontal-padding",
      title: "Left/Right Padding",
      category: "Text box",
      editorLocation: "Format → select text → Left/Right Padding",
      description:
        "Padded uses a 10% horizontal safe area. Flush reduces that inset to 1.5% while keeping the text inside the frame.",
      impact: "renderer",
      values: ["padded", "flush"].map((value) => ({
        label: titleCase(value),
        value,
        options: { textAlign: "left", textAnchor: value as "padded" | "flush" },
      })),
    }),
    compare({
      id: "vertical-padding",
      title: "Top/Bottom Padding",
      category: "Text box",
      editorLocation: "Format → select text → Top/Bottom Padding",
      description:
        "Padded keeps text in a 16% vertical safe area. Flush moves that safe area to 5%.",
      impact: "renderer",
      values: ["padded", "flush"].map((value) => ({
        label: titleCase(value),
        value,
        options: {
          textPlacement: "top",
          textVerticalAnchor: value as "padded" | "flush",
        },
      })),
    }),
    compare({
      id: "display-text",
      title: "Display text / CTA Display text",
      category: "Text box",
      editorLocation: "Format → Hook / Content / CTA",
      description:
        "Removes all text items from that section's rendered slides when disabled.",
      impact: "renderer",
      values: [
        { label: "Off", value: false, options: { displayText: false } },
        { label: "On", value: true, options: { displayText: true } },
      ],
    }),
    compare({
      id: "text-count",
      title: "Add text / Delete",
      category: "Text box",
      editorLocation: "Format → selected text toolbar",
      description:
        "Controls how many independent text boxes appear on the slide. Overlapping boxes are stacked by the shared renderer.",
      impact: "renderer",
      values: [
        { label: "No text boxes", value: 0, options: { textItemCount: 0 } },
        { label: "One text box", value: 1, options: { textItemCount: 1 } },
        { label: "Two text boxes", value: 2, options: { textItemCount: 2 } },
      ],
    }),
    compare({
      id: "content-direction",
      title: "Content direction",
      category: "Structure & AI",
      editorLocation: "Format → selected text toolbar",
      description:
        "Instructs the text generator what this box should say. The prompt itself never reaches the renderer, so equal generated text renders identically.",
      impact: "generation",
      values: [
        {
          label: "Educational direction",
          value: "Explain one practical principle",
          note: "No direct renderer change; the generated words are what matter.",
        },
        {
          label: "Contrarian direction",
          value: "Challenge a common assumption",
          note: "No direct renderer change; the generated words are what matter.",
        },
      ],
    }),
    compare({
      id: "slide-count-mode",
      title: "Static / Varying slide count",
      category: "Structure & AI",
      editorLocation: "Format → Content",
      description:
        "Static always requests the exact count. Varying lets generation choose within Minimum and Maximum; it changes slideshow length, not a frame's styling.",
      impact: "structural",
      values: [
        { label: "Static · 3", value: { mode: "static", count: 3 }, count: 3 },
        {
          label: "Varying · 2–5",
          value: { mode: "varying", minimum: 2, maximum: 5 },
          count: 5,
        },
      ],
    }),
    compare({
      id: "slide-overrides",
      title: "Slide overrides",
      category: "Structure & AI",
      editorLocation: "Format → Content → Slide overrides",
      description:
        "Replaces content direction for one numbered slide. This changes generated copy for that slide, not renderer geometry.",
      impact: "generation",
      values: [
        { label: "Default direction", value: null, count: 3 },
        {
          label: "Slide 3 soft-sell",
          value: { slideIndex: 3, direction: "Soft-sell the product" },
          count: 3,
          note: "The renderer only sees the final generated text.",
        },
      ],
    }),
    compare({
      id: "ai-image-matching",
      title: "AI image matching",
      category: "Structure & AI",
      editorLocation: "Format → Hook / Content",
      description:
        "Chooses the most semantically relevant image before rendering instead of using collection order. It does not alter the frame renderer.",
      impact: "generation",
      values: [
        { label: "Off · collection order", value: false },
        {
          label: "On · semantic match",
          value: true,
          note: "The visual changes only when matching chooses a different source image.",
        },
      ],
    }),
    compare({
      id: "cta-enabled",
      title: "Enable CTA",
      category: "Structure & AI",
      editorLocation: "Format → CTA",
      description:
        "Adds or removes the CTA section at the end of the slideshow.",
      impact: "structural",
      values: [
        {
          label: "Off · no CTA slide",
          value: false,
          options: { displayText: false },
          note: "The final slideshow ends after its content slides.",
        },
        {
          label: "On · CTA appended",
          value: true,
          options: { text: "Save this for your next redesign" },
        },
      ],
    }),
    compare({
      id: "cta-image-mode",
      title: "Collection or Image",
      category: "Structure & AI",
      editorLocation: "Format → CTA",
      description:
        "Collection rotates through a CTA pool. Single image pins one selected asset for every generated CTA.",
      impact: "structural",
      values: [
        { label: "Collection", value: "collection", count: 3 },
        { label: "Single image", value: "single_image", count: 1 },
      ],
    }),
  ]

  return comparisons.filter((setting) => visualEditorSettingIds.has(setting.id))
}

type AtlasRenderOptions = {
  aspectRatio?: string
  font?: string
  overlay?: boolean
  overlayImage?: boolean
  overlayPadding?: number
  source?: "ocean" | "interior" | "desert"
  text?: string
  wordCount?: number
  textStyle?: string
  fontSize?: string
  textWidth?: number
  textPlacement?: "top" | "center" | "bottom"
  textAlign?: "left" | "center" | "right"
  textAnchor?: "padded" | "flush"
  textVerticalAnchor?: "padded" | "flush"
  textItemCount?: number
  displayText?: boolean
  variant?: number
}

function atlasSlide(
  options: AtlasRenderOptions = {},
  imageSources: AtlasImageSource[] = []
) {
  const variant = options.variant ?? 0
  const { slide, sourceRenderUrl, overlayRenderUrl } = atlasSlidePayload(
    options,
    variant,
    imageSources
  )
  return svgDataUrl(
    renderedSlideSvg(slide, sourceRenderUrl, overlayRenderUrl, {
      aspectRatio: options.aspectRatio ?? "9:16",
      font: options.font ?? "TikTok Display Medium",
    })
  )
}

function atlasSlideshowDocument(
  options: AtlasRenderOptions | undefined,
  variants: number[],
  imageSources: AtlasImageSource[]
): AtlasSlideshowDocument {
  return {
    settings: {
      duration: 3,
      aspect_ratio: options?.aspectRatio ?? "9:16",
      font: options?.font ?? "TikTok Display Medium",
      background_color: "#111117",
      transition_style: "none",
      export_as_video: false,
      sound_id: "",
      sound_name: "",
      sound_url: "",
    },
    images: variants.map(
      (variant) => atlasSlidePayload(options ?? {}, variant, imageSources).slide
    ),
  }
}

function atlasSlidePayload(
  options: AtlasRenderOptions,
  variant: number,
  imageSources: AtlasImageSource[]
) {
  const source = options.source ?? atlasSourceForVariant(variant)
  const collectionSource = imageSources.length
    ? imageSources[variant % imageSources.length]
    : null
  const overlayCollectionSource = imageSources.length
    ? imageSources[(variant + 1) % imageSources.length]
    : null
  const sourceRenderUrl =
    collectionSource?.dataUrl ?? svgDataUrl(atlasBackgroundSvg(source))
  const sourceDocumentUrl =
    collectionSource?.url ?? `generated://setting-atlas/${source}`
  const overlayRenderUrl = options.overlayImage
    ? (overlayCollectionSource?.dataUrl ?? svgDataUrl(overlaySvg(198, 276)))
    : undefined
  const overlayDocumentUrl = options.overlayImage
    ? (overlayCollectionSource?.url ?? "generated://setting-atlas/overlay")
    : undefined
  const textItemCount =
    options.displayText === false ? 0 : (options.textItemCount ?? 1)
  const align = options.textAlign ?? "center"
  const anchor = options.textAnchor ?? "padded"
  const x =
    align === "left"
      ? anchor === "flush"
        ? 1.5
        : 10
      : align === "right"
        ? anchor === "flush"
          ? 98.5
          : 90
        : 50
  const primaryText =
    options.text ??
    (options.wordCount
      ? loremText(options.wordCount, 4)
      : "Small choices make a room feel intentional")
  const textItems: SlideshowTextItem[] = Array.from(
    { length: textItemCount },
    (_, index) => ({
      id: `atlas-text-${index + 1}`,
      text:
        index === 0 ? primaryText : "Use contrast, scale, and negative space",
      fontSize: options.fontSize ?? (index === 0 ? "14px" : "9px"),
      textSize: { width: options.textWidth ?? 70, height: 18 },
      textStyle: options.textStyle ?? (index === 0 ? "outline" : "whiteText"),
      textAlign: align,
      textAnchor: anchor,
      textVerticalAnchor: options.textVerticalAnchor ?? "padded",
      textPlacement: options.textPlacement ?? "center",
      textPosition: { x, y: 45 },
    })
  )
  const slide: SlideshowSlide = {
    id: `setting-atlas-${variant + 1}`,
    image_url: sourceDocumentUrl,
    source_image_url: sourceDocumentUrl,
    overlay: options.overlay ?? true,
    overlayImage: options.overlayImage
      ? {
          image_url: overlayDocumentUrl ?? "",
          source_image_url: overlayDocumentUrl,
          padding: options.overlayPadding ?? 10,
        }
      : undefined,
    textItems,
  }
  return { slide, sourceRenderUrl, overlayRenderUrl }
}

function atlasSourceForVariant(index: number): "ocean" | "interior" | "desert" {
  return (["ocean", "interior", "desert"] as const)[index % 3]
}

function atlasBackgroundSvg(source: "ocean" | "interior" | "desert") {
  const palette =
    source === "ocean"
      ? ["#083344", "#0891b2", "#67e8f9"]
      : source === "interior"
        ? ["#3f2d24", "#b08968", "#f3e9dc"]
        : ["#7c2d12", "#ea580c", "#fed7aa"]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" preserveAspectRatio="none"><defs><linearGradient id="atlas" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette[0]}"/><stop offset=".58" stop-color="${palette[1]}"/><stop offset="1" stop-color="${palette[2]}"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#atlas)"/><circle cx="820" cy="360" r="310" fill="white" fill-opacity=".18"/><path d="M0 1460c210-180 390-220 580-76s310 94 500-54v590H0z" fill="white" fill-opacity=".16"/><rect x="90" y="1020" width="900" height="510" rx="54" fill="black" fill-opacity=".11"/></svg>`
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function generateStressCase(
  seed: number,
  index: number,
  imageSources: AtlasImageSource[]
) {
  const random = mulberry32(seed)
  const aspectRatio = pick(aspectRatios, random)
  const font = pick(fonts, random)
  const overlay = random() > 0.48
  const hasOverlayImage = random() > 0.8
  const hueA = randomInt(random, 0, 359)
  const hueB = (hueA + randomInt(random, 45, 210)) % 360
  const pattern = pick(patterns, random)
  const collectionSource = imageSources.length
    ? imageSources[Math.abs(seed) % imageSources.length]
    : null
  const sourceUrl =
    collectionSource?.dataUrl ?? svgDataUrl(backgroundSvg(hueA, hueB, pattern))
  const sourceDocumentUrl =
    collectionSource?.url ?? `generated://stress-case/${pattern}`
  const overlayUrl = hasOverlayImage
    ? svgDataUrl(overlaySvg(hueB, hueA))
    : undefined
  const textItemCount = random() > 0.76 ? 2 : 1
  const textItems = Array.from({ length: textItemCount }, (_, textIndex) =>
    randomizedTextItem(random, index, textIndex)
  )
  const slide: SlideshowSlide = {
    id: `stress-slide-${index + 1}`,
    image_url: sourceUrl,
    overlay,
    overlayImage: hasOverlayImage
      ? {
          image_url: overlayUrl ?? "",
          padding: randomInt(random, 3, 24),
        }
      : undefined,
    textItems,
  }
  const svg = renderedSlideSvg(slide, sourceUrl, overlayUrl, {
    aspectRatio,
    font,
  })

  return {
    id: `case-${String(index + 1).padStart(2, "0")}`,
    previewUrl: svgDataUrl(svg),
    aspectRatio,
    wordCount: textItems.reduce(
      (total, item) => total + item.text.trim().split(/\s+/).length,
      0
    ),
    settings: {
      seed,
      font,
      aspectRatio,
      overlay,
      overlayImage: hasOverlayImage,
      background: { hueA, hueB, pattern },
      imageUrl: sourceDocumentUrl,
      textItems,
    },
  } satisfies SlideRendererStressCase
}

function randomizedTextItem(
  random: () => number,
  caseIndex: number,
  textIndex: number
): SlideshowTextItem {
  const placement = pick(textPlacements, random)
  const align = pick(textAlignments, random)
  const anchor = pick(textAnchors, random)
  const wordCount = randomInt(random, 2, textIndex === 0 ? 64 : 24)
  const width = randomInt(random, 34, 96)
  const fontSize = pick(fontSizes, random)
  const textStyle = pick(textStyles, random)
  const x =
    align === "left"
      ? randomInt(random, 2, 34)
      : align === "right"
        ? randomInt(random, 66, 98)
        : randomInt(random, 32, 68)
  const y = randomInt(random, 6, 94)

  return {
    id: `stress-${caseIndex + 1}-text-${textIndex + 1}`,
    text: loremText(wordCount, caseIndex * 13 + textIndex * 7),
    fontSize,
    textSize: { width, height: 100 },
    textStyle,
    textAlign: align,
    textAnchor: anchor,
    textVerticalAnchor: pick(textAnchors, random),
    textPlacement: placement === "custom" ? undefined : placement,
    textPosition: { x, y },
  }
}

function loremText(wordCount: number, offset: number) {
  const words = Array.from(
    { length: wordCount },
    (_, index) => loremWords[(offset + index) % loremWords.length]
  )
  const text = words.join(" ")
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${wordCount > 12 ? "." : ""}`
}

function backgroundSvg(
  hueA: number,
  hueB: number,
  pattern: (typeof patterns)[number]
) {
  const patternLayer =
    pattern === "rings"
      ? '<circle cx="220" cy="230" r="155" fill="none" stroke="white" stroke-opacity=".22" stroke-width="46"/><circle cx="780" cy="720" r="220" fill="none" stroke="white" stroke-opacity=".12" stroke-width="72"/>'
      : pattern === "diagonal"
        ? '<path d="M-80 840 700 60h260L180 840z" fill="white" fill-opacity=".16"/><path d="M330 1000 1000 330v260L590 1000z" fill="black" fill-opacity=".1"/>'
        : pattern === "spotlight"
          ? '<circle cx="500" cy="260" r="360" fill="white" fill-opacity=".24"/><rect x="0" y="720" width="1000" height="280" fill="black" fill-opacity=".14"/>'
          : '<rect width="500" height="1000" fill="white" fill-opacity=".12"/><circle cx="500" cy="500" r="260" fill="none" stroke="white" stroke-opacity=".2" stroke-width="80"/>'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hueA} 72% 43%)"/><stop offset="1" stop-color="hsl(${hueB} 76% 28%)"/></linearGradient></defs><rect width="1000" height="1000" fill="url(#g)"/>${patternLayer}</svg>`
}

function overlaySvg(hueA: number, hueB: number) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop stop-color="hsl(${hueA} 80% 52%)"/><stop offset="1" stop-color="hsl(${hueB} 75% 22%)"/></linearGradient></defs><rect width="1600" height="900" rx="72" fill="url(#g)"/><circle cx="430" cy="450" r="230" fill="white" fill-opacity=".2"/><path d="M760 260h520v72H760zm0 154h380v72H760zm0 154h460v72H760z" fill="white" fill-opacity=".72"/></svg>`
}

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function pick<const T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)]
}

function randomInt(random: () => number, min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min
}

function mulberry32(seed: number) {
  let value = seed >>> 0
  return function random() {
    value += 0x6d2b79f5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}
