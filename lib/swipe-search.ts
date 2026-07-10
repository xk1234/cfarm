import type {
  CoreUgcAestheticAnalysis,
  FullScriptTranscription,
  SwipeRecord,
} from "@/lib/swipes"

// B1.2 — Full-text swipe search.
//
// Pure, in-memory, deterministic. Tokenizes a weighted set of fields per swipe,
// then AND-matches every query token (each token must appear in at least one
// field) and ranks results by summed field weight. No external deps; safe to run
// over the whole store at current scale.

export type SwipeSearchField =
  | "advertiser"
  | "title"
  | "caption"
  | "cta"
  | "tags"
  | "boards"
  | "notes"
  | "transcription"
  | "aesthetic"

const FIELD_WEIGHTS: Record<SwipeSearchField, number> = {
  advertiser: 6,
  title: 4,
  tags: 4,
  cta: 3,
  boards: 3,
  caption: 2,
  notes: 2,
  transcription: 2,
  aesthetic: 1,
}

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "is",
  "it",
  "this",
  "that",
  "with",
])

export function tokenize(value: string | undefined | null): string[] {
  if (!value) {
    return []
  }
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
}

export type SwipeSearchIndexEntry = {
  swipe: SwipeRecord
  // token -> total weight contributed across the fields it appears in
  tokenWeights: Map<string, number>
}

export type SwipeSearchIndex = SwipeSearchIndexEntry[]

function collectFieldText(swipe: SwipeRecord): Record<SwipeSearchField, string> {
  return {
    advertiser: swipe.advertiser ?? "",
    title: swipe.title ?? "",
    caption: swipe.caption ?? "",
    cta: swipe.cta ?? "",
    tags: [...(swipe.tags ?? []), ...(swipe.suggested_tags ?? [])].join(" "),
    boards: [...(swipe.boards ?? []), swipe.folder ?? ""].join(" "),
    notes: swipe.notes ?? "",
    transcription: transcriptionText(swipe.full_script_transcription),
    aesthetic: aestheticText(swipe.core_ugc_aesthetic_analysis),
  }
}

function transcriptionText(t: FullScriptTranscription | undefined): string {
  if (!t) {
    return ""
  }
  const speakerText = (t.speakers ?? [])
    .map((s) => (s as { text?: string }).text ?? "")
    .join(" ")
  return [t.full_text ?? "", speakerText].join(" ")
}

function aestheticText(a: CoreUgcAestheticAnalysis | undefined): string {
  if (!a) {
    return ""
  }
  const parts: string[] = []
  const push = (value: unknown) => {
    if (typeof value === "string") {
      parts.push(value)
    } else if (Array.isArray(value)) {
      for (const item of value) push(item)
    } else if (value && typeof value === "object") {
      for (const item of Object.values(value)) push(item)
    }
  }
  push(a.social_context_and_scenario)
  push(a.visual_authenticity_cues)
  push(a.subject_and_performance)
  return parts.join(" ")
}

export function buildSwipeSearchIndex(swipes: SwipeRecord[]): SwipeSearchIndex {
  return swipes.map((swipe) => {
    const fields = collectFieldText(swipe)
    const tokenWeights = new Map<string, number>()
    for (const [field, text] of Object.entries(fields) as [
      SwipeSearchField,
      string,
    ][]) {
      const weight = FIELD_WEIGHTS[field]
      for (const token of new Set(tokenize(text))) {
        tokenWeights.set(token, (tokenWeights.get(token) ?? 0) + weight)
      }
    }
    return { swipe, tokenWeights }
  })
}

export type SwipeSearchResult = {
  swipe: SwipeRecord
  score: number
}

export function searchSwipes(
  swipes: SwipeRecord[],
  query: string,
  options: { limit?: number; index?: SwipeSearchIndex } = {}
): SwipeSearchResult[] {
  const queryTokens = [...new Set(tokenize(query))]
  if (queryTokens.length === 0) {
    return []
  }
  const index = options.index ?? buildSwipeSearchIndex(swipes)

  const results: SwipeSearchResult[] = []
  for (const entry of index) {
    let score = 0
    let matchedAll = true
    for (const token of queryTokens) {
      const weight = entry.tokenWeights.get(token)
      if (!weight) {
        // Allow prefix matches so "curtain" finds "curtains".
        let prefixWeight = 0
        for (const [indexedToken, tokenWeight] of entry.tokenWeights) {
          if (indexedToken.startsWith(token)) {
            prefixWeight = Math.max(prefixWeight, tokenWeight)
          }
        }
        if (prefixWeight === 0) {
          matchedAll = false
          break
        }
        score += prefixWeight * 0.75
      } else {
        score += weight
      }
    }
    if (matchedAll) {
      results.push({ swipe: entry.swipe, score })
    }
  }

  results.sort(
    (a, b) => b.score - a.score || a.swipe.advertiser.localeCompare(b.swipe.advertiser)
  )
  return typeof options.limit === "number"
    ? results.slice(0, Math.max(0, options.limit))
    : results
}
