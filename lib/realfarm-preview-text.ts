import {
  defaultAutomationTextItem,
  type AutomationTextItem,
} from "@/lib/realfarm-automation"

const loremWords = [
  "lorem",
  "ipsum",
  "dolor",
  "sit",
  "amet",
  "consectetur",
  "adipiscing",
  "elit",
  "sed",
  "do",
  "eiusmod",
  "tempor",
  "incididunt",
  "ut",
  "labore",
  "et",
  "dolore",
  "magna",
  "aliqua",
  "enim",
]

export function previewTextForTextItem(
  textItem:
    | Partial<
        Pick<
          AutomationTextItem,
          | "wordLengthMin"
          | "contentDirection"
          | "textMode"
          | "staticText"
          | "text"
        >
      >
    | undefined
) {
  if (textItem?.textMode === "static") {
    const staticText = (textItem.staticText || textItem.text || "").trim()
    if (staticText) return staticText
  }

  const wordCount = Math.max(
    1,
    Math.min(
      30,
      Math.round(
        textItem?.wordLengthMin ?? defaultAutomationTextItem().wordLengthMin
      )
    )
  )

  return Array.from(
    { length: wordCount },
    (_, index) => loremWords[index % loremWords.length]
  ).join(" ")
}
