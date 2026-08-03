import {
  defaultAutomationTextItem,
  type AutomationFormatSection,
  type TextItem,
} from "@/lib/realfarm-automation"

export type SlideshowVisualPreset = {
  id: string
  name: string
  description: string
  section: Pick<
    AutomationFormatSection,
    "aspect_ratio" | "imageGrid" | "overlay" | "noText"
  > & {
    textItems: Array<Partial<TextItem>>
  }
}

export const slideshowVisualPresets: readonly SlideshowVisualPreset[] = [
  {
    id: "center-left-yellow",
    name: "Center-left yellow",
    description: "Compact yellow headline on a landscape image.",
    section: {
      aspect_ratio: "4:3",
      imageGrid: "none",
      overlay: true,
      noText: false,
      textItems: [
        {
          font: "Inter",
          fontSize: "10px",
          fontWeight: 700,
          textStyle: "yellowText",
          textPosition: "center",
          textItemWidth: "38%",
          textAlign: "center",
          textAnchor: "flush",
          textVerticalAnchor: "flush",
          positionX: 29,
          positionY: 50,
          wordLengthMin: 4,
          wordLengthMax: 8,
          contentDirection: "A concise, intriguing how-to headline.",
        },
      ],
    },
  },
  {
    id: "bold-yellow-story",
    name: "Bold yellow story",
    description: "Large centered headline with a smaller supporting line.",
    section: {
      aspect_ratio: "9:16",
      imageGrid: "none",
      overlay: true,
      noText: false,
      textItems: [
        {
          font: "Inter",
          fontSize: "18px",
          fontWeight: 600,
          textStyle: "yellowText",
          textPosition: "center",
          textItemWidth: "76%",
          textAlign: "center",
          textAnchor: "flush",
          textVerticalAnchor: "flush",
          positionX: 50,
          positionY: 45,
          wordLengthMin: 8,
          wordLengthMax: 15,
          contentDirection: "A bold multi-line list or theory headline.",
        },
        {
          font: "Inter",
          fontSize: "10px",
          fontWeight: 600,
          textStyle: "yellowText",
          textPosition: "center",
          textItemWidth: "62%",
          textAlign: "center",
          textAnchor: "flush",
          textVerticalAnchor: "flush",
          positionX: 50,
          positionY: 62,
          wordLengthMin: 4,
          wordLengthMax: 8,
          contentDirection: "A short parenthetical qualifier or subtitle.",
        },
      ],
    },
  },
  {
    id: "white-caption-card",
    name: "White caption card",
    description: "A rounded white caption card over a portrait photo.",
    section: {
      aspect_ratio: "4:5",
      imageGrid: "none",
      overlay: false,
      noText: false,
      textItems: [
        {
          font: "Inter",
          fontSize: "18px",
          fontWeight: 500,
          textStyle: "background",
          backgroundMode: "line",
          backgroundRadius: 16,
          textPosition: "center",
          textItemWidth: "58%",
          textAlign: "center",
          textAnchor: "flush",
          textVerticalAnchor: "flush",
          positionX: 62,
          positionY: 51,
          wordLengthMin: 7,
          wordLengthMax: 14,
          contentDirection: "A direct educational headline with an emoji.",
        },
      ],
    },
  },
  {
    id: "split-white-reflection",
    name: "Split white reflection",
    description: "Two balanced white statements with generous spacing.",
    section: {
      aspect_ratio: "4:5",
      imageGrid: "none",
      overlay: true,
      noText: false,
      textItems: [
        {
          font: "Inter",
          fontSize: "11px",
          fontWeight: 700,
          textStyle: "whiteText",
          textPosition: "top",
          textItemWidth: "54%",
          textAlign: "center",
          textAnchor: "flush",
          textVerticalAnchor: "flush",
          positionX: 50,
          positionY: 29,
          wordLengthMin: 8,
          wordLengthMax: 14,
          contentDirection: "The first half of a thoughtful contrast.",
        },
        {
          font: "Inter",
          fontSize: "11px",
          fontWeight: 700,
          textStyle: "whiteText",
          textPosition: "center",
          textItemWidth: "60%",
          textAlign: "center",
          textAnchor: "flush",
          textVerticalAnchor: "flush",
          positionX: 50,
          positionY: 47,
          wordLengthMin: 10,
          wordLengthMax: 18,
          contentDirection:
            "The second half that reframes the first statement.",
        },
      ],
    },
  },
  {
    id: "serif-romance-cards",
    name: "Serif romance cards",
    description: "Two elegant serif headlines on white rounded cards.",
    section: {
      aspect_ratio: "4:5",
      imageGrid: "none",
      overlay: true,
      noText: false,
      textItems: [
        {
          font: "Serif",
          fontSize: "18px",
          fontWeight: 700,
          textStyle: "background",
          backgroundMode: "block",
          backgroundRadius: 14,
          textPosition: "center",
          textItemWidth: "72%",
          textAlign: "center",
          textAnchor: "flush",
          textVerticalAnchor: "flush",
          positionX: 50,
          positionY: 38,
          wordLengthMin: 5,
          wordLengthMax: 10,
          contentDirection:
            "An elegant romantic headline, optionally with emojis.",
        },
        {
          font: "Serif",
          fontSize: "14px",
          fontWeight: 700,
          textStyle: "background",
          backgroundMode: "block",
          backgroundRadius: 14,
          textPosition: "center",
          textItemWidth: "68%",
          textAlign: "center",
          textAnchor: "flush",
          textVerticalAnchor: "flush",
          positionX: 50,
          positionY: 65,
          wordLengthMin: 3,
          wordLengthMax: 7,
          contentDirection: "A short supporting promise or payoff.",
        },
      ],
    },
  },
] as const

export function slideshowVisualPresetById(id: string | undefined) {
  return slideshowVisualPresets.find((preset) => preset.id === id)
}

export function applySlideshowVisualPreset(
  section: AutomationFormatSection,
  preset: SlideshowVisualPreset
): AutomationFormatSection {
  return {
    ...section,
    ...preset.section,
    visualPresetId: preset.id,
    textItems: preset.section.textItems.map((presetItem, index) => {
      const existing = section.textItems[index]
      return defaultAutomationTextItem({
        ...presetItem,
        ...(existing?.id ? { id: existing.id } : {}),
        text: existing?.text ?? "",
        textMode: existing?.textMode ?? "prompt",
        staticText: existing?.staticText ?? "",
        contentDirection:
          existing?.contentDirection || presetItem.contentDirection || "",
      })
    }),
  }
}
