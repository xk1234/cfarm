import { clean } from "@/lib/guards"
import { applyResolvedHookCase, type HookCaseMode } from "@/lib/hook-casing"
import { runtimeHookVariableValue } from "@/lib/hook-variables"
import type { WordCollectionRecord } from "@/lib/word-collections"

export type HookExpansionResult = {
  text: string
  template: string
  substitutions: Record<string, string>
}

type HookExpansionOptions = {
  noDuplicates?: boolean
  caseMode?: HookCaseMode
  now?: Date
  timeZone?: string
  slideCount?: number
}

const slotPattern = /\[\[([a-zA-Z0-9_-]+)\]\]|\{([a-zA-Z0-9_-]+)\}/g
const properTitleCaseSlots = new Set(["zodiac"])

export function expandHook(
  hook: string,
  slots: Record<string, string> | undefined,
  collections: WordCollectionRecord[],
  random: () => number = Math.random,
  options: HookExpansionOptions = {}
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
  const usedWordsByCollection = new Map<string, Set<string>>()
  const occurrenceCounts = new Map<string, number>()
  const expandedText = template.replace(
    slotPattern,
    (match, bracketSlot, braceSlot) => {
      const baseSlotName = clean(bracketSlot || braceSlot)
      if (!baseSlotName) {
        return match
      }
      const count = (occurrenceCounts.get(baseSlotName.toLowerCase()) ?? 0) + 1
      occurrenceCounts.set(baseSlotName.toLowerCase(), count)
      // With noDuplicates each repeat of the variable is a fresh draw from the
      // words that remain, keyed zodiac, zodiac_2, ... so combination usage
      // keys stay stable.
      const slotName =
        options.noDuplicates && count > 1
          ? `${baseSlotName}_${count}`
          : baseSlotName
      if (!substitutions[slotName]) {
        const runtimeValue = runtimeHookVariableValue(baseSlotName, {
          now: options.now,
          timeZone: options.timeZone,
          slideCount: options.slideCount,
        })
        if (runtimeValue !== undefined) {
          substitutions[slotName] = runtimeValue
          return runtimeValue
        }
        const collectionId = resolveSlotCollectionId(baseSlotName, slotMap)
        const collection = collectionId
          ? (collectionsById.get(collectionId) ??
            collectionsById.get(collectionId.toLowerCase()))
          : null
        const allWords = collection?.words.filter(Boolean) ?? []
        if (allWords.length === 0) {
          throw new Error(
            `Hook slot ${slotName} has no words in database collection ${collectionId}`
          )
        }
        // Distinct slots backed by the same collection (e.g. [[zodiac]] vs
        // [[zodiac_2]]) should not repeat the same word within one hook.
        const usedKey = (collection?.id ?? collectionId).toLowerCase()
        const used = usedWordsByCollection.get(usedKey) ?? new Set<string>()
        const freshWords = allWords.filter((word) => !used.has(word))
        const words = freshWords.length > 0 ? freshWords : allWords
        const index = Math.min(
          words.length - 1,
          Math.max(0, Math.floor(random() * words.length))
        )
        used.add(words[index])
        usedWordsByCollection.set(usedKey, used)
        substitutions[slotName] = formatSlotSubstitution(
          slotName,
          words[index],
          collectionId
        )
      }
      return substitutions[slotName] || match
    }
  )
  const correctedText = correctIndefiniteArticles(
    correctPluralSuffixes(expandedText, substitutions)
  )
  const text = applyResolvedHookCase(correctedText, options.caseMode ?? "mixed")
  const casedSubstitutions = caseSubstitutions(substitutions, options.caseMode)

  return { text, template, substitutions: casedSubstitutions }
}

export function expandAllHookCombinations(
  hook: string,
  slots: Record<string, string> | undefined,
  collections: WordCollectionRecord[],
  options: HookExpansionOptions = {}
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
  // Occurrence names: with noDuplicates each repeat of a variable becomes its
  // own draw (zodiac, zodiac_2, ...) so "[[ZODIAC]] VERSUS [[ZODIAC]]" yields
  // two different signs. Without it, repeats share one substitution.
  const occurrenceNames: string[] = []
  const seenCounts = new Map<string, number>()
  for (const match of template.matchAll(slotPattern)) {
    const slotName = clean(match[1] || match[2])
    if (!slotName) continue
    const count = (seenCounts.get(slotName.toLowerCase()) ?? 0) + 1
    seenCounts.set(slotName.toLowerCase(), count)
    occurrenceNames.push(
      options.noDuplicates && count > 1 ? `${slotName}_${count}` : slotName
    )
  }
  const slotNames = occurrenceNames.filter(
    (slotName, index, values) => values.indexOf(slotName) === index
  )

  if (slotNames.length === 0) {
    return [{ text: template, template, substitutions: {} }]
  }

  const valuesBySlot = slotNames.map((slotName) => {
    // A synthetic occurrence name (zodiac_2) resolves against its base
    // variable's collection.
    const baseName = options.noDuplicates
      ? slotName.replace(/_\d+$/, "")
      : slotName
    const runtimeValue = runtimeHookVariableValue(baseName, {
      now: options.now,
      timeZone: options.timeZone,
      slideCount: options.slideCount,
    })
    if (runtimeValue !== undefined) {
      return {
        slotName,
        collectionKey: `runtime:${baseName.toLowerCase()}`,
        enforceDistinct: false,
        hasWords: true,
        values: [runtimeValue],
      }
    }
    const collectionId =
      resolveSlotCollectionId(slotName, slotMap) === slotName
        ? resolveSlotCollectionId(baseName, slotMap)
        : resolveSlotCollectionId(slotName, slotMap)
    const collection =
      collectionsById.get(collectionId) ??
      collectionsById.get(collectionId.toLowerCase())
    const words = collection?.words.filter(Boolean) ?? []
    if (words.length === 0) {
      throw new Error(
        `Hook slot ${slotName} has no words in database collection ${collectionId}`
      )
    }
    return {
      slotName,
      collectionKey: (collection?.id ?? collectionId).toLowerCase(),
      enforceDistinct: true,
      hasWords: true,
      values: words.map((word) =>
        formatSlotSubstitution(slotName, word, collectionId)
      ),
    }
  })
  const expansions: HookExpansionResult[] = []

  function visit(index: number, substitutions: Record<string, string>) {
    if (index >= valuesBySlot.length) {
      let occurrence = -1
      const expandedText = template.replace(slotPattern, (match) => {
        occurrence += 1
        return substitutions[occurrenceNames[occurrence]] || match
      })
      expansions.push({
        text: applyResolvedHookCase(
          correctIndefiniteArticles(
            correctPluralSuffixes(expandedText, substitutions)
          ),
          options.caseMode ?? "mixed"
        ),
        template,
        substitutions: caseSubstitutions(substitutions, options.caseMode),
      })
      return
    }

    const slot = valuesBySlot[index]
    const usedFromSameCollection = new Set(
      valuesBySlot
        .slice(0, index)
        .filter(
          (other) =>
            slot.enforceDistinct &&
            other.enforceDistinct &&
            slot.hasWords &&
            other.collectionKey === slot.collectionKey
        )
        .map((other) => substitutions[other.slotName])
    )
    for (const value of slot.values) {
      if (usedFromSameCollection.has(value)) {
        continue
      }
      visit(index + 1, { ...substitutions, [slot.slotName]: value })
    }
  }

  visit(0, {})
  return expansions
}

function caseSubstitutions(
  substitutions: Record<string, string>,
  mode: HookCaseMode | undefined
) {
  if (!mode || mode === "mixed") return substitutions
  const substitutionMode = mode === "sentence" ? "lowercase" : mode
  return Object.fromEntries(
    Object.entries(substitutions).map(([key, value]) => [
      key,
      applyResolvedHookCase(value, substitutionMode),
    ])
  )
}

function resolveSlotCollectionId(
  slotName: string,
  slotMap: Record<string, string>
) {
  const mapped =
    clean(slotMap[slotName]) ||
    clean(
      Object.entries(slotMap).find(
        ([key]) => key.toLowerCase() === slotName.toLowerCase()
      )?.[1] ?? ""
    )
  return mapped || slotName
}

function formatSlotSubstitution(
  slotName: string,
  value: string,
  collectionId?: string
) {
  const normalized = clean(value)
  if (
    properTitleCaseSlots.has(slotName.toLowerCase()) ||
    (collectionId && properTitleCaseSlots.has(collectionId.toLowerCase()))
  ) {
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
