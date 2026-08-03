export const AUTOMATION_FONT_OPTIONS = [
  "TikTok Display Medium",
  "Inter",
  "Arial",
  "Serif",
] as const

export function automationFontPreviewFamily(value: string) {
  if (value === "Inter") return "Inter, var(--font-sans), sans-serif"
  if (value === "Arial") return "Arial, sans-serif"
  if (value === "Serif") return 'Georgia, "Times New Roman", serif'
  return '"TikTok Display", "TikTok Sans", Arial, sans-serif'
}
