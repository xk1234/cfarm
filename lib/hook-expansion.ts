import { clean } from "@/lib/guards"
import type { WordCollectionRecord } from "@/lib/word-collections"

export type HookExpansionResult = {
  text: string
  template: string
  substitutions: Record<string, string>
}

const slotPattern = /\[\[([a-zA-Z0-9_-]+)\]\]|\{([a-zA-Z0-9_-]+)\}/g
const properTitleCaseSlots = new Set(["zodiac"])

export function expandHook(
  hook: string,
  slots: Record<string, string> | undefined,
  collections: WordCollectionRecord[],
  random: () => number = Math.random
): HookExpansionResult {
  const template = clean(hook)
  const slotMap = slots ?? {}
  const collectionsById = new Map(
    collections.flatMap((collection) => {
      const keys = [
        collection.id,
        collection.name,
        collection.id.toLowerCase(),
        collection.name.toLowerCase(),
      ]
      return keys.map((key) => [key, collection] as const)
    })
  )
  const substitutions: Record<string, string> = {}
  const expandedText = template.replace(
    slotPattern,
    (match, bracketSlot, braceSlot) => {
      const slotName = clean(bracketSlot || braceSlot)
      if (!slotName) {
        return match
      }
      if (!substitutions[slotName]) {
        const collectionId = clean(slotMap[slotName]) || slotName
        const collection = collectionId
          ? collectionsById.get(collectionId)
          : null
        const words = collection?.words.filter(Boolean) ?? []
        if (words.length === 0) {
          return match
        }
        const index = Math.min(
          words.length - 1,
          Math.max(0, Math.floor(random() * words.length))
        )
        substitutions[slotName] = formatSlotSubstitution(slotName, words[index])
      }
      return substitutions[slotName] || match
    }
  )
  const text = correctIndefiniteArticles(
    correctPluralSuffixes(expandedText, substitutions)
  )

  return { text, template, substitutions }
}

export function expandAllHookCombinations(
  hook: string,
  slots: Record<string, string> | undefined,
  collections: WordCollectionRecord[]
): HookExpansionResult[] {
  const template = clean(hook)
  const slotMap = slots ?? {}
  const collectionsById = new Map(
    collections.flatMap((collection) =>
      [
        collection.id,
        collection.name,
        collection.id.toLowerCase(),
        collection.name.toLowerCase(),
      ].map((key) => [key, collection] as const)
    )
  )
  const slotNames = [...template.matchAll(slotPattern)]
    .map((match) => clean(match[1] || match[2]))
    .filter((slotName, index, values) => slotName && values.indexOf(slotName) === index)

  if (slotNames.length === 0) {
    return [{ text: template, template, substitutions: {} }]
  }

  const valuesBySlot = slotNames.map((slotName) => {
    const collectionId = clean(slotMap[slotName]) || slotName
    const collection = collectionsById.get(collectionId)
    const words = collection?.words.filter(Boolean) ?? []
    return {
      slotName,
      values:
        words.length > 0
          ? words.map((word) => formatSlotSubstitution(slotName, word))
          : [`[[${slotName}]]`],
    }
  })
  const expansions: HookExpansionResult[] = []

  function visit(index: number, substitutions: Record<string, string>) {
    if (index >= valuesBySlot.length) {
      const expandedText = template.replace(
        slotPattern,
        (match, bracketSlot, braceSlot) =>
          substitutions[clean(bracketSlot || braceSlot)] || match
      )
      expansions.push({
        text: correctIndefiniteArticles(
          correctPluralSuffixes(expandedText, substitutions)
        ),
        template,
        substitutions: { ...substitutions },
      })
      return
    }

    const slot = valuesBySlot[index]
    for (const value of slot.values) {
      visit(index + 1, { ...substitutions, [slot.slotName]: value })
    }
  }

  visit(0, {})
  return expansions
}

function formatSlotSubstitution(slotName: string, value: string) {
  const normalized = clean(value)
  if (properTitleCaseSlots.has(slotName.toLowerCase())) {
    return titleCase(normalized)
  }
  return normalized
}

function correctPluralSuffixes(
  value: string,
  substitutions: Record<string, string>
) {
  return Object.values(substitutions).reduce((result, substitution) => {
    if (!/s$/i.test(substitution)) return result
    return result.replace(
      new RegExp(`\\b${escapeRegExp(substitution)}s\\b`, "g"),
      substitution
    )
  }, value)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function correctIndefiniteArticles(value: string) {
  return value.replace(
    /\b(a|an)\s+([A-Za-z][A-Za-z'-]*)/g,
    (match, article: string, word: string) => {
      const nextArticle = /^[aeiou]/i.test(word) ? "an" : "a"
      if (article.toLowerCase() === nextArticle) {
        return match
      }
      const corrected =
        article[0] === article[0]?.toUpperCase()
          ? `${nextArticle[0].toUpperCase()}${nextArticle.slice(1)}`
          : nextArticle
      return `${corrected} ${word}`
    }
  )
}

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}
