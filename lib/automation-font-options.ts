import { slideshowFontOptions } from "@/lib/slideshow-font-family"

export const AUTOMATION_FONT_OPTIONS = slideshowFontOptions

export function automationFontPreviewFamily(value: string) {
  if (value === "Inter") return "Inter, var(--font-sans), sans-serif"
  if (value === "Arial") return "Arial, sans-serif"
  if (value === "Serif") return 'Georgia, "Times New Roman", serif'
  if (value === "TikTok Display Medium") {
    return '"TikTok Display", "TikTok Sans", Arial, sans-serif'
  }
  return `"${value}", var(--font-sans), sans-serif`
}
