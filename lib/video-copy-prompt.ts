export type VideoCopyItem = {
  id: string
  segmentLabel: string
  guidance: string
  contentDirection: string
  wordLengthMin: number
  wordLengthMax: number
  count: number
}

export type VideoCopySegmentRole = {
  id: string
  label: string
  guidance: string
}

export type VideoCopySystemPromptConfig = {
  requiresCommentGate: boolean
}

export function buildVideoCopySystemPrompt({
  requiresCommentGate,
}: VideoCopySystemPromptConfig) {
  return [
    "You write scroll-stopping on-screen caption sequences for native TikTok and Instagram reels.",
    "Return only JSON matching the provided schema.",
    "The hook defines the exact topic. Metadata and every on-screen caption must be specific to that hook.",
    "Treat the hook, every item, and every variation as consecutive beats in ONE continuous narrative: each beat must advance what the previous beat established, never restart or paraphrase it.",
    "The opening must be a specific claim, discovery, identity callout, or curiosity gap — never a generic topic label.",
    "When an item asks for N variations, return exactly N distinct consecutive beats in story order.",
    "Every overlay must stay inside its stated word range. Treat those ranges as hard limits.",
    "Use casual, specific native social voice. Put no hashtags in overlays and do not wrap a whole overlay in quotation marks; quotation marks around a CTA trigger word are allowed.",
    "Never refer to an assumed visual with deictic phrases such as 'this graph', 'this photo', 'on this screen', 'what you see here', or 'watch this' unless that exact visual is guaranteed by the segment guidance.",
    "Never invent numbers, revenue, percentages, follower counts, studies, testimonials, or other proof. When proof is not supplied, state only a qualitative observable outcome.",
    ...(requiresCommentGate
      ? [
          "This is a comment-gate format. Choose exactly ONE memorable alphabetic trigger word, write it in UPPERCASE, and use that identical word after 'comment' in both the CTA overlay and the social caption. Offer one clear, topic-specific resource in exchange. Never introduce a second trigger word.",
        ]
      : []),
  ].join(" ")
}

export type VideoCopyUserPromptConfig = {
  automationName: string
  videoFormat: string
  tone: string
  style: string
  hook: string
  segmentRoles: readonly VideoCopySegmentRole[]
  metadataPromptLines: readonly string[]
  requiresCommentGate: boolean
  lowercase: boolean
  items: readonly VideoCopyItem[]
}

export function buildVideoCopyUserPrompt({
  automationName,
  videoFormat,
  tone,
  style,
  hook,
  segmentRoles,
  metadataPromptLines,
  requiresCommentGate,
  lowercase,
  items,
}: VideoCopyUserPromptConfig) {
  return [
    `Automation: ${automationName}`,
    `Video format: ${videoFormat}`,
    `Tone: ${tone}`,
    `Style notes: ${style}`,
    `The video opens with this hook: "${hook}"`,
    "Ordered segment roles (source of truth for the narrative sequence):",
    ...(segmentRoles.length > 0
      ? segmentRoles.map(
          (segment, index) =>
            `${index + 1}. ${segment.label} [${segment.id}]: ${segment.guidance || "advance the same narrative"}`
        )
      : ["1. Hook → supporting beats → payoff/CTA, in the item order below."]),
    "Single-narrative contract: continue the opening hook through these ordered roles. Preserve the same narrator, subject, resource, and causal thread. A later beat must not introduce a new premise or interchangeable list item.",
    "Metadata requirements:",
    ...metadataPromptLines,
    "Generate the social title, caption, and hashtags even when there are no on-screen caption items.",
    ...(requiresCommentGate
      ? [
          "The social caption must re-pitch the value exchange and repeat the exact same 'comment \"WORD\"' trigger used in the CTA overlay.",
        ]
      : []),
    "Native overlay exemplars (copy their specificity and beat-to-beat momentum, not their topic):",
    'Example 1 — story: "I found this free PDF" → "printed it out and actually did it" → "the graph doesn\'t lie" → "comment \'PLAN\' if you want the link too". Caption: "comment \'PLAN\' and I\'ll send you the free PDF."',
    'Example 2 — astrology story: "I checked my moon sign after that breakup" → "wrote down every pattern I kept repeating" → "it explained everything" → "comment \'MOON\' for your moon-sign reading". Caption: "comment \'MOON\' and I\'ll send your moon-sign reading."',
    'Example 3 — faceless claim: "the 3 signs that always come back after a breakup:" + "comment \'MOON\' for your moon-sign reading". Caption: "comment \'MOON\' and I\'ll send your moon-sign reading."',
    "The graph line in Example 1 is valid only when a graph is explicitly guaranteed. For ordinary collection b-roll, use a self-contained qualitative payoff such as 'and it actually worked' instead.",
    "Write one output per item below, in the listed order. Arrays are consecutive beats within that item's place in the larger story.",
    ...(lowercase
      ? requiresCommentGate
        ? [
            "Write every value in lowercase EXCEPT the one CTA trigger word, which must stay UPPERCASE in both overlay and caption.",
          ]
        : [
            "Write EVERY value — title, caption, hashtags, and all on-screen text — in all lowercase.",
          ]
      : []),
    ...items.map((item) =>
      [
        `- id: ${item.id}`,
        `  segment: ${item.segmentLabel}`,
        `  direction: ${item.contentDirection || item.guidance || "supporting caption"}`,
        `  length: ${item.wordLengthMin}-${item.wordLengthMax} words each`,
        item.count > 1
          ? `  variations: ${item.count} (one per clip, in story order)`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    ),
  ].join("\n")
}
