import { clean } from "@/lib/guards"

export type AutomationHookLintWarning = {
  code: "NUMERIC_TOKEN_MISSING_NOUN"
  severity: "warning"
  hookId?: string
  text: string
  token: string
  followingWord?: string
  message: string
}

const numericTokenPattern =
  /\[\[(SLIDE_COUNT|NUMBER|COUNT|TOTAL|ITEM_COUNT)\]\](?:\s+([^\s,.!?;:]+))?/gi
const nonNounFollowers = new Set([
  "are",
  "can",
  "could",
  "destined",
  "for",
  "from",
  "is",
  "least",
  "less",
  "likely",
  "more",
  "most",
  "of",
  "should",
  "that",
  "to",
  "will",
  "with",
  "who",
])

export function lintAutomationHookText(input: {
  id?: string
  text: string
}): AutomationHookLintWarning[] {
  const text = clean(input.text)
  return [...text.matchAll(numericTokenPattern)].flatMap((match) => {
    const token = `[[${match[1].toUpperCase()}]]`
    const followingWord = clean(match[2]).toLowerCase()
    const looksNonNominal =
      !followingWord ||
      nonNounFollowers.has(followingWord) ||
      /(?:ed|ing|ly)$/.test(followingWord)
    if (!looksNonNominal) return []
    return [
      {
        code: "NUMERIC_TOKEN_MISSING_NOUN" as const,
        severity: "warning" as const,
        hookId: clean(input.id) || undefined,
        text,
        token,
        followingWord: followingWord || undefined,
        message: followingWord
          ? `${token} is followed by “${followingWord}”, which does not look like the noun phrase the number counts. Add a noun such as “signs”, “ways”, or “things”.`
          : `${token} ends the hook without a noun phrase. Add what the number counts, such as “signs”, “ways”, or “things”.`,
      },
    ]
  })
}

export function lintAutomationHooks(
  hooks: Array<{ id?: string; text: string }>
) {
  return hooks.flatMap(lintAutomationHookText)
}
