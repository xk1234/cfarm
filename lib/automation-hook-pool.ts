import { clean } from "@/lib/guards"
import {
  automationHookId,
  type AutomationHookItem,
} from "@/lib/realfarm-automation"

export type HookDuplicateGroup = {
  kind: "exact" | "near"
  score: number
  hookIds: string[]
  hooks: string[]
  suggestedKeepId: string
}

const zodiacTerms = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
]

const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "what",
  "when",
  "why",
  "with",
  "your",
])

export function analyzeAutomationHookPool(hooks: AutomationHookItem[]) {
  const groups = duplicateGroups(hooks)
  const duplicateIds = new Set(
    groups.flatMap((group) => group.hookIds.slice(1))
  )
  return {
    total: hooks.length,
    enabled: hooks.filter((hook) => hook.enabled).length,
    disabled: hooks.filter((hook) => !hook.enabled).length,
    uniqueSuggested: hooks.length - duplicateIds.size,
    duplicateSlotCount: duplicateIds.size,
    duplicateGroups: groups,
  }
}

export function replaceAutomationHookPool(input: {
  current: AutomationHookItem[]
  hooks: Array<{ id?: string; text: string; enabled?: boolean }>
  now: string
  deduplicateNearMatches?: boolean
}) {
  const currentById = new Map(input.current.map((hook) => [hook.id, hook]))
  const currentByText = new Map(
    input.current.map((hook) => [exactHookKey(hook.text), hook])
  )
  const next = input.hooks.flatMap((candidate) => {
    const text = clean(candidate.text)
    if (!text) return []
    const requestedId = clean(candidate.id)
    const existing =
      (requestedId ? currentById.get(requestedId) : undefined) ??
      currentByText.get(exactHookKey(text))
    const id = requestedId || existing?.id || automationHookId(text)
    const enabled = candidate.enabled ?? existing?.enabled ?? true
    const changed =
      !existing || existing.text !== text || existing.enabled !== enabled
    return [
      {
        id,
        text,
        enabled,
        createdAt: existing?.createdAt ?? input.now,
        ...(changed
          ? { updatedAt: input.now }
          : existing?.updatedAt
            ? { updatedAt: existing.updatedAt }
            : {}),
      } satisfies AutomationHookItem,
    ]
  })
  const exact = deduplicateExact(next)
  return input.deduplicateNearMatches ? deduplicateNear(exact) : exact
}

function duplicateGroups(hooks: AutomationHookItem[]): HookDuplicateGroup[] {
  const parent = hooks.map((_, index) => index)
  const pairs: Array<{ left: number; right: number; score: number }> = []
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index])
    return parent[index]
  }
  const union = (left: number, right: number) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot
  }

  for (let left = 0; left < hooks.length; left += 1) {
    for (let right = left + 1; right < hooks.length; right += 1) {
      const score = hookSimilarity(hooks[left].text, hooks[right].text)
      if (score < 0.72) continue
      pairs.push({ left, right, score })
      union(left, right)
    }
  }

  const indexesByRoot = new Map<number, number[]>()
  for (let index = 0; index < hooks.length; index += 1) {
    const root = find(index)
    indexesByRoot.set(root, [...(indexesByRoot.get(root) ?? []), index])
  }

  return [...indexesByRoot.values()]
    .filter((indexes) => indexes.length > 1)
    .map((indexes) => {
      const relevantPairs = pairs.filter(
        (pair) => indexes.includes(pair.left) && indexes.includes(pair.right)
      )
      const exact = indexes.every(
        (index) =>
          exactHookKey(hooks[index].text) === exactHookKey(hooks[indexes[0]].text)
      )
      return {
        kind: exact ? ("exact" as const) : ("near" as const),
        score: Math.max(...relevantPairs.map((pair) => pair.score)),
        hookIds: indexes.map((index) => hooks[index].id),
        hooks: indexes.map((index) => hooks[index].text),
        suggestedKeepId: hooks[indexes[0]].id,
      }
    })
    .sort(
      (left, right) =>
        right.hookIds.length - left.hookIds.length || right.score - left.score
    )
}

function deduplicateExact(hooks: AutomationHookItem[]) {
  const seenIds = new Set<string>()
  const seenText = new Set<string>()
  return hooks.filter((hook) => {
    const text = exactHookKey(hook.text)
    if (!text || seenIds.has(hook.id) || seenText.has(text)) return false
    seenIds.add(hook.id)
    seenText.add(text)
    return true
  })
}

function deduplicateNear(hooks: AutomationHookItem[]) {
  const remove = new Set(
    duplicateGroups(hooks).flatMap((group) => group.hookIds.slice(1))
  )
  return hooks.filter((hook) => !remove.has(hook.id))
}

function hookSimilarity(left: string, right: string) {
  const leftExact = exactHookKey(left)
  const rightExact = exactHookKey(right)
  if (leftExact === rightExact) return 1
  const leftTokens = semanticTokens(left)
  const rightTokens = semanticTokens(right)
  if (leftTokens.size < 2 || rightTokens.size < 2) return 0
  const intersection = [...leftTokens].filter((token) =>
    rightTokens.has(token)
  ).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  const jaccard = intersection / union
  const containment =
    intersection / Math.max(1, Math.min(leftTokens.size, rightTokens.size))
  return Math.max(jaccard, containment * 0.92)
}

function exactHookKey(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9{}]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function semanticTokens(value: string) {
  const normalized = exactHookKey(value)
    .replace(/\{\{[^}]+\}\}|\{[^}]+\}/g, " variable ")
    .replace(
      new RegExp(`\\b(?:${zodiacTerms.join("|")})\\b`, "g"),
      " zodiac "
    )
  return new Set(
    normalized
      .split(" ")
      .map(stemToken)
      .filter((token) => token.length > 1 && !stopWords.has(token))
  )
}

function stemToken(value: string) {
  if (value.length > 5 && value.endsWith("ing")) return value.slice(0, -3)
  if (value.length > 4 && value.endsWith("ies"))
    return `${value.slice(0, -3)}y`
  if (value.length > 3 && value.endsWith("s")) return value.slice(0, -1)
  return value
}
