export type XPlatform = "x" | "threads"

export type PostSlot = {
  key: string
  description: string
  minWords: number
  maxWords: number
  optional?: boolean
}

export type PostArchetype = {
  id: string
  label: string
  platform: XPlatform
  kind: "single" | "thread"
  weight: number
  maxPerWeek?: number
  structure: string
  template: string
  slots: PostSlot[]
  needsProof?: boolean
  engagementCloser: boolean
}

export type HookStyle = {
  id: string
  label: string
  platform: XPlatform | "both"
  formula: string
  examples: string[]
  weight?: number
  needsProof?: boolean
}

export type VoicePreset = {
  id: string
  label: string
  systemPrompt: string
}

const slot = (
  key: string,
  description: string,
  minWords: number,
  maxWords: number,
  optional = false
): PostSlot => ({ key, description, minWords, maxWords, optional })

export const xPostArchetypes: PostArchetype[] = [
  {
    id: "educational_thread",
    label: "Educational thread",
    platform: "x",
    kind: "thread",
    weight: 2,
    maxPerWeek: 3,
    structure: "hook → problem → solution steps → proof → CTA, 8–15 tweets",
    template:
      'T1 "[how to achieve X] - a complete breakdown:" / T2–3 why most fail / T4–10 step-by-step framework / T11–12 proof / T13 CTA.',
    slots: [
      slot("hook", "How-to promise and complete-breakdown opener", 6, 18),
      slot("problem", "Why most people fail", 20, 50),
      slot("steps", "8–10 standalone step-by-step framework tweets", 80, 240),
      slot(
        "proof",
        "Only supplied proof; omit unsupported claims",
        0,
        35,
        true
      ),
      slot("closer", "CTA or next-step tease", 4, 16),
    ],
    engagementCloser: true,
  },
  {
    id: "data_drop",
    label: "Data drop",
    platform: "x",
    kind: "single",
    weight: 2,
    maxPerWeek: 2,
    structure:
      "study → 3 statistics with implications → source name → takeaway",
    template:
      '"study of [sample size] [topic] revealed:" → three compact sourced findings → "source: [supplied source name]" → "takeaway: [what to do]". Never include a link in the body.',
    slots: [
      slot("hook", "Study and sample-size opener using supplied proof", 4, 9),
      slot("findings", "Three compact sourced findings", 15, 24),
      slot("source", "Supplied source name without a link", 1, 4),
      slot(
        "proof",
        "Optional supplied proof detail; never invent it",
        0,
        6,
        true
      ),
      slot("takeaway", "Actionable takeaway", 4, 8),
    ],
    needsProof: true,
    engagementCloser: false,
  },
  {
    id: "pattern_drop",
    label: "Pattern drop",
    platform: "x",
    kind: "single",
    weight: 2,
    maxPerWeek: 2,
    structure:
      "specific observed pattern → 3–5 sign-level implications → identity takeaway → reply question",
    template:
      '"the 3 signs that always text back first:" → three emotionally specific observations → "which one are you?". Never frame observations as a study or statistic.',
    slots: [
      slot("hook", "Specific astrology pattern opener", 4, 10),
      slot("patterns", "Three concise sign-level behavioral patterns", 16, 30),
      slot("takeaway", "Identity insight and genuine reply question", 4, 9),
    ],
    engagementCloser: true,
  },
  {
    id: "contrarian_take",
    label: "Contrarian take",
    platform: "x",
    kind: "single",
    weight: 1,
    maxPerWeek: 1,
    structure:
      "unpopular opinion → common belief → 3–5 rebuttals → alternative",
    template:
      '"unpopular opinion: [contrarian statement]" / "most people think [common belief]" / "here\'s why that\'s wrong: [3-5 reasons]" / "what actually works: [your alternative]".',
    slots: [
      slot("hook", "Unpopular-opinion statement", 4, 9),
      slot("belief", "Common belief", 4, 8),
      slot("reasons", "Three ultra-concise reasons", 12, 22),
      slot("alternative", "What actually works plus a reply question", 5, 10),
    ],
    engagementCloser: true,
  },
  {
    id: "numbered_list",
    label: "Numbered list",
    platform: "x",
    kind: "single",
    weight: 3,
    maxPerWeek: 3,
    structure: "5–10 numbered items → why each matters → optional question",
    template:
      '"[number] [things] that [outcome]:" then N. [item] - [why it matters]; optional "which one do you use?".',
    slots: [
      slot("hook", "Numbered outcome opener", 4, 9),
      slot("items", "Five ultra-compact numbered items", 20, 34),
      slot("closer", "Optional which-one question", 0, 7, true),
    ],
    engagementCloser: true,
  },
  {
    id: "comparison",
    label: "Comparison",
    platform: "x",
    kind: "single",
    weight: 2,
    structure: "A vs B → three characteristics each → conclusion",
    template:
      '"[A] vs [B]:" → 3 arrow-bulleted characteristics per side → "[conclusion]".',
    slots: [
      slot("hook", "A versus B opener", 3, 7),
      slot("sideA", "Three terse characteristics for A", 8, 15),
      slot("sideB", "Three terse characteristics for B", 8, 15),
      slot("conclusion", "Clear reply-driving conclusion", 4, 8),
    ],
    engagementCloser: true,
  },
  {
    id: "mistake_breakdown",
    label: "Mistake breakdown",
    platform: "x",
    kind: "single",
    weight: 1,
    maxPerWeek: 1,
    structure:
      "costly mistakes → lessons → corrected approach → supported result",
    template:
      '"[supplied proof] exposed [number] mistakes in [area]" / terse mistakes / corrected approach / optional supplied result. Never invent first-person experience.',
    slots: [
      slot("hook", "Mistake opener grounded in supplied proof", 5, 10),
      slot("mistakes", "Three terse mistakes and why they failed", 16, 26),
      slot("correction", "What to do now", 5, 10),
      slot("proof", "Supported result only", 0, 6, true),
    ],
    needsProof: true,
    engagementCloser: false,
  },
  {
    id: "opinion_framework",
    label: "Opinion framework",
    platform: "x",
    kind: "single",
    weight: 3,
    structure: "my take → 3–5 points → bottom line",
    template:
      '"my take on [topic]:" → → [point] ×3–5 → "bottom line: [conclusion]".',
    slots: [
      slot("hook", "My-take opener", 3, 7),
      slot("points", "Three concise arrow-prefixed points", 14, 28),
      slot("conclusion", "Bottom-line reply trigger", 4, 9),
    ],
    engagementCloser: true,
  },
]

const threads = (
  id: string,
  label: string,
  template: string,
  slots: PostSlot[],
  options: Partial<PostArchetype> = {}
): PostArchetype => ({
  id,
  label,
  platform: "threads",
  kind: "single",
  weight: 1,
  structure: template,
  template,
  slots,
  engagementCloser: false,
  ...options,
})

export const threadsPostArchetypes: PostArchetype[] = [
  threads(
    "label_take",
    "Label take",
    "One approved label followed by a punchy one- or two-line take.",
    [
      slot("label", "One approved hook label", 1, 2),
      slot("take", "Specific polarizing identity take", 7, 28),
    ],
    { weight: 3, engagementCloser: true }
  ),
  threads(
    "provocative_polemic",
    "Provocative polemic",
    "A love-it-or-hate-it statement that makes the target reader choose a side.",
    [slot("post", "Specific polarizing statement", 8, 28)],
    { weight: 2, engagementCloser: true }
  ),
  threads(
    "audience_callout",
    "Audience callout",
    "Name the target identity directly, then give a sharp reminder or warning.",
    [
      slot("callout", "Direct identity callout", 3, 10),
      slot("take", "Emotionally specific reminder", 6, 24),
    ],
    { weight: 2, engagementCloser: true }
  ),
  threads(
    "question_bait",
    "Question bait",
    "One identity or pain question the ideal reader has to answer.",
    [slot("question", "Direct identity question", 6, 22)],
    { weight: 2, engagementCloser: true }
  ),
  threads(
    "analogy_reframe",
    "Analogy reframe",
    "One original analogy that changes how the reader sees the topic.",
    [slot("post", "Concise analogy and reframe", 10, 30)],
    { weight: 1 }
  ),
  threads(
    "micro_story",
    "Micro story",
    "A two- to four-line personal-tone moment: hard lesson, doubt, fear, risk, win, or unexpected challenge. Never invent first-person proof.",
    [
      slot(
        "opener",
        "Personal-tone story opener without false experience",
        4,
        12
      ),
      slot("story", "Compact emotional story or hypothetical", 10, 36),
    ],
    { weight: 1 }
  ),
  threads(
    "credibility_claim",
    "Credibility claim",
    "lead with one supplied result or proof point, then close with grounded excitement.",
    [
      slot("proof", "Supplied result or credibility proof only", 4, 18),
      slot("close", "Grounded excitement close", 2, 8),
    ],
    { weight: 1, needsProof: true }
  ),
  threads(
    "win_celebration",
    "Win celebration",
    "name one supplied win, however small, then celebrate what it means.",
    [
      slot("proof", "Supplied win only", 4, 18),
      slot("celebration", "Warm concise celebration", 3, 10),
    ],
    { weight: 1, needsProof: true }
  ),
  threads(
    "controversial_humor",
    "Controversial humor",
    "make one bold, funny community-code statement about a niche behavior.",
    [slot("post", "Bold niche-specific community-code statement", 8, 24)],
    { weight: 1, engagementCloser: true }
  ),
]

export const postArchetypes = [...xPostArchetypes, ...threadsPostArchetypes]

export const hookStyles: HookStyle[] = [
  {
    id: "big_number",
    label: "Big number",
    platform: "x",
    formula: "lead with specific figure",
    examples: ["[specific figure] changed [niche outcome] in [timeframe]"],
    needsProof: true,
  },
  {
    id: "contrarian",
    label: "Contrarian",
    platform: "x",
    formula: '"unpopular opinion: [statement]"',
    examples: ["[common belief in your niche] is wrong—here's why"],
  },
  {
    id: "time_based",
    label: "Time based",
    platform: "x",
    formula: "then/now or deadline",
    examples: ["[timeframe] ago: [starting state]. today: [specific outcome]."],
  },
  {
    id: "curiosity_gap",
    label: "Curiosity gap",
    platform: "x",
    formula: "withhold the mechanism",
    examples: ["the [niche mechanism] nobody talks about (but should)"],
  },
  {
    id: "direct_address",
    label: "Direct address",
    platform: "x",
    formula: '"if you\'re struggling with [problem], read this"',
    examples: ["if you're struggling with [niche problem], read this"],
  },
  ...[
    "REAL TALK",
    "STRAIGHT UP",
    "WORD",
    "SIMPLE TRUTH",
    "HOT TAKE",
    "UNPOPULAR OPINION",
    "JUST A REMINDER",
    "POPULAR OPINION",
    "FACT",
    "REALITY CHECK",
    "TRUTH",
    "PRO TIP",
    "FYI",
    "INSIDER TIP",
    "JUST SAYING",
    "POINT BLANK",
    "QUICK TIP",
  ].map((label) => ({
    id: `threads_${label.toLowerCase().replaceAll(" ", "_")}`,
    label,
    platform: "threads" as const,
    formula: `${label}: [claim]`,
    examples: [`${label}: [specific claim]`],
    weight: label === "UNPOPULAR OPINION" ? 3 : 1,
  })),
  {
    id: "unpopular_opinion",
    label: "Unpopular opinion",
    platform: "threads",
    formula: "unpopular opinion: [claim]",
    examples: ["unpopular opinion: [common belief in your niche] is backwards"],
    weight: 3,
  },
  {
    id: "popular_opinion",
    label: "Popular opinion",
    platform: "threads",
    formula: "popular opinion: [claim]",
    examples: ["popular opinion: [niche-specific belief]"],
  },
  {
    id: "just_a_reminder",
    label: "Just a reminder",
    platform: "threads",
    formula: "just a reminder: [claim]",
    examples: ["just a reminder: [niche-specific reassurance]"],
  },
  {
    id: "bare",
    label: "Bare",
    platform: "threads",
    formula: "no label; begin with the claim",
    examples: ["[specific niche observation]"],
  },
]

export const voicePresets: VoicePreset[] = [
  {
    id: "faceless_tactical",
    label: "Faceless tactical",
    systemPrompt:
      "Write lowercase, blunt, specific copy with short sentences and zero fluff. Every line must deliver an immediately applicable insight or emotionally precise identity observation. The reader should want to bookmark or screenshot it. Ban personal updates, vague inspiration, generic advice, engagement-farming clichés, selling without proof, links, and invented statistics or results.",
  },
  {
    id: "personal_connector",
    label: "Personal connector",
    systemPrompt:
      "Write like a real person talking to one specific reader: warm, candid, emotionally precise, and unpolished in a deliberate way. Celebrate small wins and use recognisable identity tension. Keep it to 1–3 short lines with blank-line rhythm. Use 0–2 emoji, no hashtags, no links, and never invent personal experience.",
  },
]

export const platformRules = {
  x: {
    maxCharacters: 280,
    linkPlacement: "first_reply",
    frontLoadValue: true,
    endWithEngagementTrigger: true,
  },
  threads: {
    maxLinesTypical: 3,
    maxSentencesPerLine: 2,
    blankLineBetweenLines: true,
    maxEmoji: 2,
    allCapsEmphasisMaxWords: 1,
  },
} as const

export function archetypesForPlatform(platform: XPlatform) {
  return postArchetypes.filter((item) => item.platform === platform)
}
export function hookStylesForPlatform(platform: XPlatform) {
  return hookStyles.filter(
    (item) => item.platform === platform || item.platform === "both"
  )
}
export function voicePreset(id: string) {
  return voicePresets.find((item) => item.id === id) ?? voicePresets[0]
}
