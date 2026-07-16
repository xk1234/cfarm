/**
 * FROZEN EVALUATION — deterministic gate + LLM judge.
 *
 * Codex: NEVER edit this file. The gate thresholds and rubric are fixed so
 * iteration scores stay comparable. If you believe a check is wrong, flag it
 * in your report; a human decides.
 */

export const JUDGE_MODEL = "openai/gpt-5.4-mini"

// Gate constants are defined HERE (not presets.mjs) so the experiment surface
// cannot weaken the gate.
const GATE = {
  maxCharacters: 1900,
  minCharacters: 500, // archetype may override down to 60 (micro formats)
  maxEmoji: 1,
  maxEmDash: 1,
  firstLineMaxCharacters: 120,
  foldCharacters: 200,
  minBlocksOver400Chars: 4,
}

const BANNED_PHRASES = [
  "game-changer", "game changer", "in today's fast-paced", "let that sink in",
  "delve", "i'm humbled", "here's the kicker", "but here's the thing",
  "take your", "to the next level", "unlock the", "supercharge", "elevate your",
  "read that again", "simple as that", "newsflash", "spoiler alert", "plot twist",
  "boom.", "the best part?", "little-known secret", "aren't just", "isn't just",
  "double-edged sword", "at the end of the day", "in a world where", "look,",
]

const EMOJI_RE = /\p{Extended_Pictographic}/gu

export function deterministicChecks(post, { proof = [], archetypeMinCharacters } = {}) {
  const errors = []
  const text = post.trim()
  if (!text) return ["post is empty"]
  const lower = text.toLowerCase()

  if (/https?:\/\/|www\./i.test(text)) errors.push("no links allowed in the post body (kills reach)")
  const minChars = Math.max(60, archetypeMinCharacters ?? GATE.minCharacters)
  if (text.length < minChars) errors.push(`post is ${text.length} chars; minimum ${minChars}`)
  if (text.length > GATE.maxCharacters) errors.push(`post is ${text.length} chars; maximum ${GATE.maxCharacters}`)

  const firstLine = text.split("\n", 1)[0]
  if (firstLine.length > GATE.firstLineMaxCharacters)
    errors.push(`first line is ${firstLine.length} chars; hooks must be <= ${GATE.firstLineMaxCharacters} chars on their own line`)

  const blocks = text.split(/\n\s*\n/).filter(Boolean)
  if (text.length > 400 && blocks.length < GATE.minBlocksOver400Chars)
    errors.push(`only ${blocks.length} whitespace-separated blocks; posts need breathing room (>= ${GATE.minBlocksOver400Chars})`)

  if (/\*\*|\[[^\]]+\]\([^)]+\)|^#+\s/m.test(text)) errors.push("markdown syntax detected; LinkedIn renders plain text only")
  if (/#[a-z0-9_]+/i.test(text)) errors.push("hashtags detected; policy for this experiment is zero hashtags")

  const emoji = text.match(EMOJI_RE) ?? []
  if (emoji.length > GATE.maxEmoji) errors.push(`${emoji.length} emoji; maximum ${GATE.maxEmoji}`)
  const emDashes = (text.match(/—/g) ?? []).length
  if (emDashes > GATE.maxEmDash) errors.push(`${emDashes} em dashes; maximum ${GATE.maxEmDash} (AI tell)`)

  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) errors.push(`banned phrase: "${phrase}"`)
  }

  // Unsupported personal-proof claims: money, percentages, and social-proof
  // counts must trace to the proof bank.
  const claims = text.match(/[$£€][\d,.]+k?m?|\d+(?:\.\d+)?%|\b[\d,]+\+?\s+(?:clients|sales|followers|leads|views|customers|students)\b/gi) ?? []
  const evidence = proof.join(" ").toLowerCase()
  for (const claim of claims) {
    if (!evidence.includes(claim.toLowerCase())) errors.push(`unsupported numeric claim: "${claim}"`)
  }

  return [...new Set(errors)]
}

const RUBRIC = `You are a brutally honest LinkedIn ghostwriting lead reviewing a draft for a client.
You have seen thousands of posts; you know that most AI-written posts deserve a 4-6.
Reserve 8+ for posts a top-1% creator in this niche would publish UNCHANGED.
Score each dimension 0-10 (integers):

- hookStopPower: Would the first ~200 characters stop the target reader mid-scroll? 10 = specific,
  curiosity-loaded, impossible to ignore; 7 = decent but seen before; 4 = generic promise or
  throat-clearing; 0-2 = no hook.
- specificity: Concrete steps, numbers, named tools, mini-examples the reader can act on today.
  10 = every claim is concrete ("write the example, not the category"); 6 = mixed; 3 = category
  words and platitudes ("provide value", "be consistent").
- valueDensity: Insight per line. 10 = bookmarkable, no filler line; 6 = one good idea padded;
  3 = restates the obvious.
- voiceAuthenticity: Reads like a sharp human practitioner. 10 = distinct, plain, confident;
  6 = clean but flavorless; 3 = corporate/AI slop (symmetry, buzzwords, fake enthusiasm).
- nicheResonance: Uses the audience's own language and REAL pain points. 10 = the ICP feels
  personally seen; 5 = could apply to any niche; 2 = wrong audience.
- scanFormat: Line rhythm and whitespace. 10 = effortless skim, varied line lengths, lists earn
  their place; 5 = walls or monotonous rhythm; 2 = unreadable.
- engagementPull: Does it end in a natural reason to comment, without engagement-bait cringe?
  10 = the question is one the reader is itching to answer; 5 = generic "thoughts?"; 2 = none
  or cringe bait.

Also return "topFix": the single highest-leverage rewrite instruction (one sentence), and
"weakestDimension": the dimension name that most held the post back.`

export const JUDGE_WEIGHTS = {
  hookStopPower: 0.2,
  specificity: 0.2,
  valueDensity: 0.15,
  voiceAuthenticity: 0.15,
  nicheResonance: 0.1,
  scanFormat: 0.1,
  engagementPull: 0.1,
}

export function overallScore(scores) {
  const total = Object.entries(JUDGE_WEIGHTS).reduce(
    (sum, [key, weight]) => sum + weight * (Number(scores[key]) || 0),
    0
  )
  return Math.round(total * 100) / 100
}

export async function judgePost({ apiKey, niche, brief, post, archetypeLabel, fetchImpl = fetch }) {
  const res = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: RUBRIC },
        {
          role: "user",
          content: `Niche: ${niche}\nTarget audience: ${brief.audience}\nAudience pain points: ${brief.painPoints.join("; ")}\nPost format family: ${archetypeLabel}\n\n=== POST START ===\n${post}\n=== POST END ===`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "linkedin_post_judgment",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: [...Object.keys(JUDGE_WEIGHTS), "topFix", "weakestDimension"],
            properties: {
              ...Object.fromEntries(
                Object.keys(JUDGE_WEIGHTS).map((key) => [key, { type: "integer", minimum: 0, maximum: 10 }])
              ),
              topFix: { type: "string" },
              weakestDimension: { type: "string" },
            },
          },
        },
      },
    }),
    signal: AbortSignal.timeout(90_000),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error?.message || `Judge call failed (${res.status})`)
  const raw = payload.choices?.[0]?.message?.content
  const text = typeof raw === "string" ? raw : ""
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1))
  return { scores: parsed, overall: overallScore(parsed) }
}

export const QUALITY_GATE = {
  meanOverall: 8.0,
  minOverall: 6.5,
  maxViolations: 0,
}

export function evaluateGate(results) {
  const overalls = results.map((r) => r.overall)
  const mean = overalls.reduce((a, b) => a + b, 0) / Math.max(1, overalls.length)
  const min = Math.min(...overalls)
  const violations = results.reduce((sum, r) => sum + r.violations.length, 0)
  return {
    mean: Math.round(mean * 100) / 100,
    min,
    violations,
    passed: mean >= QUALITY_GATE.meanOverall && min >= QUALITY_GATE.minOverall && violations <= QUALITY_GATE.maxViolations,
  }
}
