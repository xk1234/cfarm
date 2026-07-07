export const automationLanguageOptions = [
  "English",
  "Chinese",
  "Malay",
  "Indian",
  "Spanish",
] as const

export type AutomationLanguage = (typeof automationLanguageOptions)[number]

export const defaultAutomationLanguage: AutomationLanguage = "English"

export const slideshowTransitionOptions = [
  { label: "Hard Cut", value: "hard" },
  { label: "Fade", value: "fade" },
  { label: "Slide", value: "slide" },
  { label: "Zoom", value: "zoom" },
] as const

export type SlideshowTransitionValue =
  (typeof slideshowTransitionOptions)[number]["value"]

export const defaultSlideshowTransition: SlideshowTransitionValue = "hard"

export const slideshowDurationOptions = [2, 3, 4, 5, 6, 8] as const

export const defaultSlideshowDuration = 4
export const randomTikTokSoundLabel = "Random TikTok sound"
export const defaultAutomationPublishType = "slideshow"

export function deeplTargetLanguage(language: string) {
  switch (language.trim().toLowerCase()) {
    case "chinese":
      return "ZH-HANS"
    case "malay":
      return "MS"
    case "indian":
    case "hindi":
      return "HI"
    case "spanish":
      return "ES"
    case "english":
    default:
      return null
  }
}

export function slideshowTransitionLabel(value: string) {
  return (
    slideshowTransitionOptions.find((option) => option.value === value)
      ?.label ?? value
  )
}

export function slideshowTransitionValue(labelOrValue: string) {
  const normalized = labelOrValue.trim().toLowerCase()
  return (
    slideshowTransitionOptions.find(
      (option) =>
        option.value === normalized || option.label.toLowerCase() === normalized
    )?.value ?? defaultSlideshowTransition
  )
}

export function slideshowDurationValue(value: unknown) {
  return Math.max(1, Number(value) || defaultSlideshowDuration)
}
