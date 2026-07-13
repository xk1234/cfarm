import { clean } from "@/lib/guards"

export function normalizedTextSignature(parts: string[]) {
  return parts
    .map(clean)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => SMALL_NUMBER_WORDS[word] ?? word)
    .join(" ")
}

const SMALL_NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
}

export function trigramJaccardSimilarity(left: string, right: string) {
  const leftTrigrams = trigrams(normalizedTextSignature([left]))
  const rightTrigrams = trigrams(normalizedTextSignature([right]))
  if (leftTrigrams.size === 0 && rightTrigrams.size === 0) {
    return 1
  }
  if (leftTrigrams.size === 0 || rightTrigrams.size === 0) {
    return 0
  }

  let intersection = 0
  for (const value of leftTrigrams) {
    if (rightTrigrams.has(value)) {
      intersection += 1
    }
  }
  const union = leftTrigrams.size + rightTrigrams.size - intersection
  return union > 0 ? intersection / union : 0
}

export function hasNearDuplicateText(
  candidate: string,
  previous: string[],
  options: { threshold?: number } = {}
) {
  const threshold = options.threshold ?? 0.85
  return previous.some(
    (value) => trigramJaccardSimilarity(candidate, value) >= threshold
  )
}

function trigrams(value: string) {
  if (!value) {
    return new Set<string>()
  }
  const padded = `  ${value}  `
  const grams = new Set<string>()
  for (let index = 0; index <= padded.length - 3; index += 1) {
    grams.add(padded.slice(index, index + 3))
  }
  return grams
}
