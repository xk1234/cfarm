// Generated from lib/llm-slop.ts. Do not edit by hand.
const lexicon = {
  "$comment": "Canonical LLM-slop lexicon. Single source of truth for AI-tell words/phrases penalized across ALL text automations (slideshow, X/Threads, LinkedIn lab judge). Words match on word boundaries; phrases match as case-insensitive substrings; patterns are regex sources (case-insensitive). Keep entries high-precision: only terms real humans rarely use in social copy.",
  "words": [
    "delve",
    "delves",
    "delving",
    "unlock",
    "unleash",
    "elevate",
    "supercharge",
    "turbocharge",
    "skyrocket",
    "revolutionize",
    "transformative",
    "game-changer",
    "game-changing",
    "cutting-edge",
    "seamless",
    "seamlessly",
    "leverage",
    "leveraging",
    "empower",
    "empowering",
    "synergy",
    "holistic",
    "paradigm",
    "tapestry",
    "testament",
    "beacon",
    "ever-evolving",
    "frictionless",
    "next-level",
    "streamline",
    "streamlining"
  ],
  "phrases": [
    "in today's fast-paced",
    "in today's digital",
    "in today's world",
    "in the ever-evolving",
    "in a world where",
    "let that sink in",
    "read that again",
    "here's the kicker",
    "but here's the thing",
    "the best part?",
    "little-known secret",
    "at the end of the day",
    "look no further",
    "without further ado",
    "buckle up",
    "stay tuned",
    "spoiler alert",
    "newsflash",
    "plot twist",
    "i'm humbled",
    "dive into",
    "let's dive",
    "deep dive",
    "it's important to note",
    "it's worth noting",
    "in conclusion",
    "needless to say",
    "simple as that",
    "boom.",
    "double-edged sword",
    "actionable insights",
    "food for thought",
    "game changer",
    "🚀"
  ],
  "patterns": [
    {
      "label": "isn't-just symmetry",
      "regex": "\\b(?:isn'?t|aren'?t|is not|are not) just\\b"
    },
    {
      "label": "not-X-but-Y contrast cliché",
      "regex": "it'?s not (?:about|just) [^.\\n]{2,60}[,;] it'?s (?:about )?"
    },
    {
      "label": "take-your-X-to-the-next-level",
      "regex": "take your [^.\\n]{2,40} to the next level"
    },
    {
      "label": "whether-you're-A-or-B",
      "regex": "whether you'?re a [^.\\n]{2,50} or (?:a |an )?"
    }
  ]
};
/**
 * Shared guardrail against common LLM-tell words/phrases in generated copy.
 * The lexicon (lib/llm-slop-lexicon.json) is the single source of truth. Matches
 * feed the generation repair loops, so the model is told exactly which term to
 * remove and retries.
 */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordMatchers = lexicon.words.map((word) => new RegExp(`\\b${escapeRegex(word)}\\b`, "iu"));
const patternMatchers = lexicon.patterns.map((pattern) => ({
    label: pattern.label,
    regex: new RegExp(pattern.regex, "iu"),
}));
/** Raw matched terms/snippets found in the text (deduped, original casing from the lexicon/patterns). */
export function llmSlopMatches(text) {
    if (!text.trim())
        return [];
    const lower = text.toLowerCase();
    const matches = [];
    for (const [index, matcher] of wordMatchers.entries()) {
        if (matcher.test(text))
            matches.push(lexicon.words[index]);
    }
    for (const phrase of lexicon.phrases) {
        if (lower.includes(phrase))
            matches.push(phrase);
    }
    for (const { label, regex } of patternMatchers) {
        if (regex.test(text))
            matches.push(label);
    }
    return [...new Set(matches)];
}
/** Validation-error strings ready to feed a structured-output repair loop. */
export function llmSlopViolations(text) {
    return llmSlopMatches(text).map((match) => `banned AI-tell wording: "${match}" — rewrite that line in plain human language`);
}
/** One compact system-prompt line that bans the lexicon up front (prevention beats repair). */
export function llmSlopPromptLine() {
    return `Banned words and phrases (AI tells — never use any of them): ${[
        ...lexicon.words,
        ...lexicon.phrases,
    ].join(", ")}.`;
}
