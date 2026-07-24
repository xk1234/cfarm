import {
  hookVariableNameFromLabel,
  runtimeHookVariables,
  wordCollectionVariableName,
} from "@/lib/hook-variables"
import type { WordCollectionRecord } from "@/lib/word-collections"

export type AutomationHookTokenIssue = {
  hookId?: string
  hookText: string
  token: string
  code: "unknown_token" | "legacy_single_bracket"
  suggestion?: string
  message: string
}

export type AutomationHookTokenWarning = {
  hookId?: string
  token: string
  code: "free_count_variable"
  message: string
}

const knownAliases: Record<string, string> = {
  sign: "zodiac",
  signs: "zodiac",
  zodiac_sign: "zodiac",
  zodiac_signs: "zodiac",
  nth: "number",
  count: "number",
  flaw: "trait",
  damning_trait: "trait",
  flattering_trait: "trait",
  flattering_self_image: "trait",
}

export function validateAutomationHookTokens(input: {
  hooks: Array<{ id?: string; text: string }>
  collections: WordCollectionRecord[]
}) {
  const canonicalByName = new Map<string, string>()
  for (const variable of runtimeHookVariables) {
    canonicalByName.set(
      variable.name.toLowerCase(),
      variable.name.toUpperCase()
    )
  }
  for (const collection of input.collections) {
    const name = wordCollectionVariableName(collection)
    canonicalByName.set(name.toLowerCase(), name.toUpperCase())
  }

  const issues: AutomationHookTokenIssue[] = []
  const warnings: AutomationHookTokenWarning[] = []
  for (const hook of input.hooks) {
    const seen = new Set<string>()
    for (const match of hook.text.matchAll(/\[\[([^\[\]]+)\]\]/g)) {
      const rawName = String(match[1] ?? "").trim()
      const normalized = hookVariableNameFromLabel(rawName)
      const token = `[[${rawName}]]`
      const canonical = canonicalByName.get(normalized)
      if (!canonical) {
        const suggestion = closestCanonicalToken(normalized, canonicalByName)
        issues.push({
          hookId: hook.id,
          hookText: hook.text,
          token,
          code: "unknown_token",
          suggestion,
          message: suggestion
            ? `Unknown hook variable ${token}; did you mean ${suggestion}?`
            : `Unknown hook variable ${token}.`,
        })
        continue
      }
      if (canonical === "NUMBER" && !seen.has("NUMBER")) {
        warnings.push({
          hookId: hook.id,
          token: "[[NUMBER]]",
          code: "free_count_variable",
          message:
            "[[NUMBER]] is a free collection draw. Use [[SLIDE_COUNT]] when the promised count must equal the generated body-slide count.",
        })
      }
      seen.add(canonical)
    }

    for (const match of hook.text.matchAll(
      /(^|[^\[])\[([A-Za-z][A-Za-z0-9 _-]{0,63})\](?!\])/g
    )) {
      const rawName = String(match[2] ?? "").trim()
      const normalized = hookVariableNameFromLabel(rawName)
      const suggestion = closestCanonicalToken(normalized, canonicalByName)
      const token = `[${rawName}]`
      issues.push({
        hookId: hook.id,
        hookText: hook.text,
        token,
        code: "legacy_single_bracket",
        suggestion,
        message: suggestion
          ? `Legacy placeholder ${token} is not supported; use ${suggestion}.`
          : `Legacy placeholder ${token} is not supported; use a canonical [[VARIABLE]] token.`,
      })
    }
  }

  return { issues, warnings }
}

export function assertValidAutomationHookTokens(input: {
  hooks: Array<{ id?: string; text: string }>
  collections: WordCollectionRecord[]
}) {
  const validation = validateAutomationHookTokens(input)
  if (validation.issues.length === 0) return validation
  throw new Error(
    `Hook token validation failed: ${validation.issues
      .map((issue) =>
        issue.hookId ? `${issue.hookId}: ${issue.message}` : issue.message
      )
      .join(" ")}`
  )
}

function closestCanonicalToken(
  name: string,
  canonicalByName: Map<string, string>
) {
  const aliased = knownAliases[name]
  if (aliased && canonicalByName.has(aliased)) {
    return `[[${canonicalByName.get(aliased)}]]`
  }
  let best: { name: string; distance: number } | null = null
  for (const candidate of canonicalByName.keys()) {
    const distance = editDistance(name, candidate)
    if (!best || distance < best.distance) best = { name: candidate, distance }
  }
  if (!best) return undefined
  const threshold = Math.max(
    1,
    Math.floor(Math.max(name.length, best.name.length) / 3)
  )
  return best.distance <= threshold
    ? `[[${canonicalByName.get(best.name)}]]`
    : undefined
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      )
    }
    previous.splice(0, previous.length, ...current)
  }
  return previous[right.length]
}
