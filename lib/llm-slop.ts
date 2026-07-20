import lexicon from "@/lib/llm-slop-lexicon.json"

/**
 * Shared guardrail against common LLM-tell words/phrases in generated copy.
 * The lexicon (lib/llm-slop-lexicon.json) is the single source of truth. Matches
 * feed the generation repair loops, so the model is told exactly which term to
 * remove and retries.
 */

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const wordMatchers = lexicon.words.map(
  (word) => new RegExp(`\\b${escapeRegex(word)}\\b`, "iu")
)
const patternMatchers = lexicon.patterns.map((pattern) => ({
  label: pattern.label,
  regex: new RegExp(pattern.regex, "iu"),
}))

/** Raw matched terms/snippets found in the text (deduped, original casing from the lexicon/patterns). */
export function llmSlopMatches(text: string): string[] {
  if (!text.trim()) return []
  const lower = text.toLowerCase()
  const matches: string[] = []
  for (const [index, matcher] of wordMatchers.entries()) {
    if (matcher.test(text)) matches.push(lexicon.words[index])
  }
  for (const phrase of lexicon.phrases) {
    if (lower.includes(phrase)) matches.push(phrase)
  }
  for (const { label, regex } of patternMatchers) {
    if (regex.test(text)) matches.push(label)
  }
  return [...new Set(matches)]
}

/** Validation-error strings ready to feed a structured-output repair loop. */
export function llmSlopViolations(text: string): string[] {
  return llmSlopMatches(text).map(
    (match) => `banned AI-tell wording: "${match}" — rewrite that line in plain human language`
  )
}

/** One compact system-prompt line that bans the lexicon up front (prevention beats repair). */
export function llmSlopPromptLine(): string {
  return `Banned words and phrases (AI tells — never use any of them): ${[
    ...lexicon.words,
    ...lexicon.phrases,
  ].join(", ")}.`
}
