/**
 * LinkedIn post presets + prompt builders.
 *
 * Ported from the linkedin-lab experiment (scripts/linkedin-lab/presets.mjs,
 * frozen at PRESET_VERSION v6-outcome-cadence) after it cleared the content
 * quality bar. Distilled from Matt Barker's "30 Days of Proven LinkedIn
 * Templates" (see scripts/linkedin-lab/PLAYBOOK.md).
 *
 * The lab's per-cell hook exemplars/outcome anchors were tuned to three test
 * niches; here they act as optional accelerants and fall back cleanly for any
 * niche via nicheKeyForPillar() returning null.
 */

export const LINKEDIN_PRESET_VERSION = "v6-outcome-cadence"

export type LinkedInSlot = {
  key: string
  description: string
  minWords: number
  maxWords: number
  optional?: boolean
}

export type LinkedInArchetype = {
  id: string
  label: string
  weight: number
  personaSafe: boolean
  needsProof?: boolean
  minCharacters?: number
  structure: string
  template: string
  slots: LinkedInSlot[]
  engagementCloser: boolean
}

export type LinkedInHookStyle = {
  id: string
  label: string
  formula: string
  examples: string[]
  needsProof?: boolean
}

export type LinkedInVoicePreset = {
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
): LinkedInSlot => ({ key, description, minWords, maxWords, optional })

export const linkedInArchetypes: LinkedInArchetype[] = [
  {
    id: "struggles_advice",
    label: "Struggles → advice",
    weight: 2,
    personaSafe: true,
    structure:
      "felt-fear hook → bridge → 4 interleaved struggle/fix pairs → content-specific micro-question",
    template:
      "[Hook naming the ICP's visible symptom]. If that sounds familiar, here's what actually works: 1. [specific struggle] → Fix: [concrete action/example] ... [easy either/or question tied to the pairs]",
    slots: [
      slot("hook", "One sharp opener naming the ICP's felt fear, its visible symptom, or the outcome being blocked; do not announce a generic list", 8, 20),
      slot("bridge", "A natural bridge into the fixes, such as 'If that sounds familiar, here's what actually works:'; do not number it", 7, 16),
      slot("pairs", "Exactly 4 numbered struggle-to-fix pairs. Put the struggle on one line and its fix on the next. Each fix must include an artifact, exact action, pasteable sentence, or mini-example. Vary each struggle opener and each fix's grammatical shape", 70, 170),
      slot("closer", "One low-effort question tied to the specific struggles above; offer 2-3 recognizable choices or ask for a very short answer", 6, 20),
    ],
    engagementCloser: true,
  },
  {
    id: "how_to_without",
    label: "How-to without obstacle",
    weight: 3,
    personaSafe: true,
    structure:
      "specific payoff hook without the real obstacle → varied tips with examples and reasons → content-specific micro-question",
    template:
      "[Odd N] ways to [specific outcome] (without [felt obstacle]): 1. [tip + concrete example] [why] ... [easy question about one item]",
    slots: [
      slot("hook", "Front-loaded, specific outcome-without-obstacle promise. Use an odd step count or a parenthetical sweetener when natural; the obstacle must name the ICP's felt fear", 7, 20),
      slot("tips", "Exactly 4 numbered tips. Give each tip a different grammatical opening and a second line with a reason, exact phrase, named tool, or mini-example. Tip 1 should be surprising. Avoid repeated sentence molds", 80, 180),
      slot("closer", "One low-effort question that names a specific tip, choice, or bottleneck from this post; make it answerable in a few words", 6, 20),
    ],
    engagementCloser: true,
  },
  {
    id: "framework",
    label: "Step framework",
    weight: 2,
    personaSafe: true,
    structure: "framework promise → numbered steps with context → objective → question",
    template:
      "The [x]-step framework that [positive outcome]: 1. [step] [context] ... The aim: [objective]. What do you think?",
    slots: [
      slot("hook", "Framework promise with a concrete positive outcome", 6, 16),
      slot("steps", "3-6 numbered steps, each with one context line", 60, 160),
      slot("objective", "One-line aim of the framework", 6, 16),
      slot("closer", "Short opinion-inviting question tied to the framework's specifics", 4, 14),
    ],
    engagementCloser: true,
  },
  {
    id: "harsh_truth",
    label: "Harsh truth",
    weight: 2,
    personaSafe: true,
    structure:
      "harsh truth hook → real reason → one-line before/after example → concrete fix → content-specific micro-question",
    template:
      "Harsh truth: [ICP fear] is not caused by [scapegoat]. [Real reason]. Before: [specific example]. After: [specific replacement]. [Action]. [easy diagnostic question]",
    slots: [
      slot("hook", "An uncomfortable claim naming the ICP's desired outcome or felt fear and reversing the wrong scapegoat; the literal 'Harsh truth:' label is optional", 10, 24),
      slot("reason", "One idea explaining the real reason for failure in concrete niche language. Write 1-2 short lines, not an essay paragraph", 18, 42),
      slot("example", "A one-line before/after mini-example showing the weak version and a specific replacement; include exact words, a tool, a metric to inspect, or a realistic scenario", 16, 40),
      slot("fix", "One concrete next action with a pasteable sentence, named artifact, tool, or short sequence. Keep one idea per line", 18, 45),
      slot("closer", "One low-effort diagnostic or either/or question tied directly to the example or fix", 6, 20),
    ],
    engagementCloser: true,
  },
  {
    id: "less_more",
    label: "Needs less / more of",
    weight: 2,
    personaSafe: true,
    structure: "topic needs less of: 3 dislikes → and more of: 3 likes",
    template: "[Topic] needs less of this: - [thing] x3. And more of: - [thing] x3.",
    slots: [
      slot("hook", "Topic needs less of this", 4, 10),
      slot("less", "Three specific things there is too much of, one line each", 12, 40),
      slot("more", "Three specific things there should be more of, one line each", 12, 40),
    ],
    engagementCloser: false,
  },
  {
    id: "good_vs_bad",
    label: "Good vs bad",
    weight: 2,
    personaSafe: true,
    structure: "bad [topic]: 3 things → good [topic]: 3 things → anything you'd add?",
    template: "Bad [topic]: - thing x3. Good [topic]: - thing x3. Anything you'd add?",
    slots: [
      slot("hook", "Bad [topic]:", 2, 6),
      slot("bad", "Three concrete markers of bad, one line each", 12, 40),
      slot("good", "Three concrete markers of good, one line each", 12, 40),
      slot("closer", "Anything you'd add? style question", 3, 8),
    ],
    engagementCloser: true,
  },
  {
    id: "things_that_destroy",
    label: "Things that destroy",
    weight: 2,
    personaSafe: true,
    structure: "N things that destroy [thing ICP cares about] → avoid at all costs → open question",
    template: "[X] things that destroy a [topic thing]: 1..N (inverted best practices). Avoid at all costs. Anything you'd add?",
    slots: [
      slot("hook", "Number of destroyers and the thing they destroy", 5, 14),
      slot("items", "5-7 numbered destroyers, each an inverted best practice, one line each", 30, 90),
      slot("closer", "Avoid-at-all-costs line plus open question", 5, 14),
    ],
    engagementCloser: true,
  },
  {
    id: "topic_101",
    label: "Topic 101",
    weight: 1,
    personaSafe: true,
    structure: "topic 101 → nobody cares about X → they care about Y → short expansion",
    template: "[Topic] 101: Nobody cares about [common obsession]. They care about [what actually matters]. [2-4 lines of expansion]",
    slots: [
      slot("hook", "[Topic] 101:", 2, 6),
      slot("contrast", "Nobody cares about X / they care about Y", 10, 28),
      slot("expansion", "Short expansion driving the point home", 15, 50),
    ],
    engagementCloser: false,
  },
  {
    id: "micro_question",
    label: "Micro-commitment question",
    weight: 1,
    personaSafe: true,
    minCharacters: 60,
    structure: "one question with a built-in micro commitment",
    template: "In 5 words or less, what advice would you give [type of person]?",
    slots: [slot("question", "One micro-commitment question aimed at the ICP", 8, 20)],
    engagementCloser: true,
  },
  {
    id: "process_breakdown",
    label: "Process breakdown",
    weight: 2,
    personaSafe: true,
    structure:
      "visible bottleneck hook → reader outcome bridge → concrete start-to-finish process → selected process closer",
    template:
      "[Visible bottleneck and promised result]. [What this process changes for the reader]. 1..N. [selected closer mechanic]",
    slots: [
      slot("bridge", "One short line stating the concrete deliverable this sequence creates for the reader and the rework, delay, or ambiguity it removes. Do not announce 'here is the process'", 8, 34),
      slot("steps", "Exactly 6 numbered, operational steps, separated by blank lines. Every step must visibly advance the niche-specific outcome anchor from the prompt, not generic productivity. Vary item length deliberately and use at least two natural textures: a brief fragment or aside, a two-line mini-scene, or an exact sentence to say or paste. Include named artifacts, process constraints, one deliberate omission, and one surprising ordering choice. Express any if-then heuristic naturally without the label 'Decision rule'", 95, 175),
      slot("closer", "Exactly one question ending in '?'. Follow the selected closer mechanic from the prompt; do not use the repeated 'Where does it stall: A, B, or C?' shape", 6, 20),
    ],
    engagementCloser: true,
  },
  {
    id: "journey_story",
    label: "Journey story",
    weight: 1,
    personaSafe: false,
    needsProof: true,
    structure: "timeframe + risk taken → context → obstacle → turning point → now → lesson",
    template: "[Timeframe] ago I [risk]. [Context] [Obstacle] [Reality] [Turning point] Now: [results]. [Lesson]",
    slots: [
      slot("hook", "Timeframe-ago opener with a specific risk, from proof facts only", 8, 20),
      slot("story", "Raw story: context, obstacle, turning point, built ONLY from supplied proof facts", 60, 160),
      slot("lesson", "One transferable lesson", 8, 24),
    ],
    engagementCloser: false,
  },
  {
    id: "old_way_new_way",
    label: "Old way vs new way",
    weight: 1,
    personaSafe: false,
    needsProof: true,
    structure: "my old [topic]: 3 things → my new [topic]: 3 things → emotional contrast → small change big impact",
    template: "My old [topic]: x3. My new [topic]: x3. [Old emotion/result] Now [new result]. Small change, big impact.",
    slots: [
      slot("hook", "My old [topic]:", 3, 8),
      slot("old", "Three old-way lines from proof facts", 12, 40),
      slot("new", "Three new-way lines from proof facts", 12, 40),
      slot("contrast", "Emotional and result contrast, then small change big impact", 12, 35),
    ],
    engagementCloser: false,
  },
]

export const linkedInHookStyles: LinkedInHookStyle[] = [
  { id: "how_to_parenthetical", label: "How-to + parenthetical", formula: "How to [outcome] in [n] steps ([sweetener])", examples: ["How to steal an audience on LinkedIn in 8 simple steps (this is a secret):"] },
  { id: "without_obstacle", label: "Without obstacle", formula: "[observable failure] -> [specific outcome without the felt obstacle]", examples: ["The draft is open again. Fix the inputs before rewriting every line yourself:"] },
  { id: "steal_this", label: "Steal this", formula: "Steal this [asset] ([sweetener])", examples: ["Steal this 3 part structure for LinkedIn posts (and use it 100% of the time):"] },
  { id: "harsh_truth", label: "Harsh truth", formula: "[uncomfortable diagnosis or scapegoat reversal; literal label optional]", examples: ["Your quiet inbox is not a color-palette problem."] },
  { id: "needs_less", label: "Needs less", formula: "[Topic] needs less of this:", examples: ["LinkedIn needs less of this:"] },
  { id: "worried_problem", label: "Worried problem", formula: "[recognizable scene, quote, or contradiction exposing the feared problem]", examples: ["You delete the opening before you even reach line two. The voice setup is the problem."] },
  { id: "micro_commitment", label: "Micro commitment", formula: "In [n] words or less, [question]?", examples: ["In 5 words or less, what advice would you give someone just starting out on LinkedIn?"] },
  { id: "contrarian_identity", label: "Contrarian identity", formula: "[Impressive metric] isn't a skill. [Underlying craft] is.", examples: ["Getting 25,000 LinkedIn followers isn't a skill. Writing is."] },
  { id: "big_number", label: "Big number", formula: "[Specific odd number result] + [method tease]", examples: ["In September I generated 1,990,835 views on LinkedIn. Here are the hooks of the top 5 posts:"], needsProof: true },
  { id: "transformation", label: "Transformation", formula: "[Timeframe] ago I was [specific bad details].", examples: ["3 years ago I was single, 28lbs overweight and lived in a 6 bed house share in London."], needsProof: true },
]

export const linkedInVoicePresets: LinkedInVoicePreset[] = [
  {
    id: "educator",
    label: "Educator (default)",
    systemPrompt:
      "You write LinkedIn posts as a sharp practitioner-educator in the given niche. Observational authority: describe what works and fails without claiming personal experiences, client results, or outcome numbers you were not given. Never frame an example as something you personally saw, studied, tested, or did. Sound like a perceptive peer: concrete, opinionated, and conversational. Short lines. One idea per line. Vary line length and syntax. No corporate jargon, motivational fluff, symmetrical list rhythm, or hashtag spam.",
  },
  {
    id: "practitioner",
    label: "Practitioner (proof-backed)",
    systemPrompt:
      "You write LinkedIn posts in the first person as a practitioner in the given niche. Every personal experience, result, number, or timeline you mention MUST come verbatim from the PROOF section. If proof is thin, write around it — never invent. Plain conversational English. Short lines. One idea per line.",
  },
]

export const linkedInFormatRules = {
  maxCharacters: 1900,
  minCharacters: 500,
  hashtagPolicy: "none" as const,
  maxEmoji: 1,
  maxEmDash: 1,
  foldCharacters: 200,
  firstLineMaxCharacters: 105,
}

type Mechanic = { id: string; instruction: string; example: string }
const mechanic = (id: string, instruction: string, example: string): Mechanic => ({ id, instruction, example })

export const hookMechanicPools: Record<string, Mechanic[]> = {
  how_to_without: [
    mechanic("pain_receipt", "Open with a concrete object and its disappointing result in two clipped clauses, then tease the repair", "The form is live. The inbox is quiet. Fix the path before rebuilding the site."),
    mechanic("failed_attempt", "Open on the specific fix the reader tried this week and show what stubbornly did not change", "Rewrote the prompt again? The draft still sounds borrowed. Fix the inputs first."),
    mechanic("ignored_artifact", "Put an ignored or stuck artifact in the first six words, then promise the useful outcome", "Your RFC has approvals but no owner. Turn agreement into an architecture decision."),
    mechanic("deadline_scene", "Place the reader at a recognizable workday or weekly deadline, with the unfinished outcome visible", "Friday review starts soon. Your impact log is still a list of tickets."),
    mechanic("surface_result_contradiction", "Contrast a polished or busy surface with the result the reader still is not getting", "The homepage looks finished. Homeowners still cannot find the quote button."),
  ],
  struggles_advice: [
    mechanic("feedback_quote", "Lead with the exact vague or painful sentence the reader keeps hearing", "'Be more strategic' lands in another review with no example attached."),
    mechanic("weekly_recognition", "Open inside a recurring moment from the reader's week, just as the frustration becomes obvious", "Sunday night: five AI drafts open, and every first line still needs rewriting."),
    mechanic("effort_result_gap", "Pair visible effort with the missing result in two unequal clauses", "You published all week. None of the posts sound like the person customers know."),
    mechanic("micro_action", "Name the tiny action the reader automatically takes when the problem appears", "You delete the AI opener before reading line two. That reflex is useful evidence."),
    mechanic("artifact_receipt", "Make a familiar document, screen, or notification expose the deeper struggle", "Your self-review is open, but every bullet reads like Jira history."),
  ],
  harsh_truth: [
    mechanic("scapegoat_reversal", "Reverse the tempting scapegoat in one blunt line; the literal 'Harsh truth:' label is optional", "Another AI model will not rescue a repurposing map with no point of view."),
    mechanic("artifact_indictment", "Let the reader's own artifact reveal the real problem without using a stock label", "Your self-review says what shipped, not what changed. That is the promotion bottleneck."),
    mechanic("wrong_fix", "Name the attractive fix the reader is reaching for, then reject it with the real diagnosis", "New homepage colors will not fix a booking form that asks for trust too early."),
    mechanic("blunt_correction", "Correct one common belief in plain language, using the niche's native objects", "More tickets do not make a senior case. Decisions other teams reuse do."),
    mechanic("scene_then_diagnosis", "Show a one-beat failure scene, then deliver the uncomfortable diagnosis", "The blog became five identical captions. Summarizing was the wrong job."),
  ],
  process_breakdown: [
    mechanic("open_workspace", "Open on the reader's messy workspace and the missing finished result", "Three AI tabs are open. The post is still a blank document."),
    mechanic("broken_handoff", "Name one concrete handoff where useful work turns into rework or delay", "The voice note reaches the draft, then dies in another editing loop."),
    mechanic("end_of_session", "Start at the end of a recognizable work session and show what remains undone", "Six meetings end. The design work begins after dinner."),
    mechanic("subtraction", "Lead with the step or tool to remove before promising the leaner sequence", "Close the extra tools first. A smaller workflow can still ship the post."),
    mechanic("sequence_preview", "Tease a non-obvious order by naming the first and last useful artifacts", "Start with the booking button. Measure the page only after the path works."),
  ],
}

export const closerMechanicPools: Record<string, Mechanic[]> = {
  how_to_without: [
    mechanic("paste_current_line", "Invite the reader to paste one short line from the artifact so the flaw is visible", "What does your current button or opening line say, word for word?"),
    mechanic("before_next_event", "Ask for the one action they will take before a concrete upcoming event", "What will you change before your next draft, review, or customer visit?"),
    mechanic("artifact_binary", "Compare two exact versions from the post, without adding a third option", "Does the button promise the outcome, or merely say Submit?"),
    mechanic("finish_the_sentence", "Give a short first-person sentence stem the reader can complete", "Finish this sentence: my current workflow wastes time when ___?"),
    mechanic("red_pen_audit", "Ask what one visible element they would circle during a quick audit", "What gets the red pen first on your current page or document?"),
  ],
  struggles_advice: [
    mechanic("five_word_confession", "Ask for a five-words-or-fewer confession tied to the most emotional struggle", "In five words, what keeps getting rewritten?"),
    mechanic("finish_feedback", "Turn the reader's recurring feedback into a sentence stem they can complete", "Complete the feedback you keep hearing: 'You need to ___.'?"),
    mechanic("name_the_receipt", "Ask which artifact currently proves the struggle is happening", "Which document gives the problem away right now?"),
    mechanic("recognition_moment", "Ask for the moment or cue when the reader first realizes the struggle is happening", "At what line do you stop trusting the draft's voice?"),
    mechanic("specific_addition", "Invite one concrete addition to the remedies, anchored to the same niche moment", "What would you add for the next Sunday rewrite or performance review?"),
  ],
  harsh_truth: [
    mechanic("rewrite_challenge", "Ask the reader to rewrite one weak line from their own artifact", "How would you rewrite the weakest bullet in your current draft?"),
    mechanic("last_line_audit", "Ask what the last line of a named artifact actually says", "What does the last bullet in your self-review prove?"),
    mechanic("count_check", "Ask for one simple count the reader can inspect immediately; do not offer categories", "How many fields stand between a mobile visitor and a booked call?"),
    mechanic("counterexample", "Invite a concrete exception that would test the diagnosis", "What evidence would make this diagnosis wrong for your case?"),
    mechanic("before_after_choice", "Ask which of the post's two exact phrasings appears in their artifact", "Does your draft describe the task, or the change it created?"),
  ],
  process_breakdown: [
    mechanic("next_run_breakpoint", "Ask the reader to name the single moment their next run is most likely to break", "At what exact moment will your next run start creating rework?"),
    mechanic("step_to_delete", "Ask which existing step they would remove after seeing the leaner sequence", "Which step in your current workflow can disappear?"),
    mechanic("missing_handoff", "Ask for the handoff that lacks an owner, artifact, or definition of done", "Which handoff has no clear owner or finished artifact?"),
    mechanic("first_screen", "Ask what the reader sees on the first screen where the process goes wrong", "What is open on screen when the workflow starts drifting?"),
    mechanic("sequence_swap", "Ask which two steps they currently perform in the opposite order", "Which two steps are you doing in the wrong order today?"),
  ],
}

const cellHookExamples: Record<string, Record<string, string>> = {
  ai: {
    how_to_without: "Third AI draft open, cursor back at line one? Fix the inputs before rewriting again.",
    struggles_advice: "You delete the AI opening before reading line two. Your voice setup left it no better option.",
    harsh_truth: "You paste in a blog. Five posts come back wearing the same opening. The model is not the problem.",
    process_breakdown: "Three AI tabs are open. The post is still a blank document. Shrink the workflow first.",
  },
  web: {
    how_to_without: "The site is live. The owner still checks a silent inbox. Fix the path before redesigning.",
    struggles_advice: "A homeowner scrolls once, then calls the competitor. The trust proof arrived too late.",
    harsh_truth: "Your booking form asks for a budget before it earns a phone number. New colors will not fix that.",
    process_breakdown: "The DIY site looks finished. On mobile, the quote button takes three scrolls to reach.",
  },
  career: {
    how_to_without: "Your RFC gets approvals, then the same decision happens in Slack without you.",
    struggles_advice: "Review week arrives and your brag doc reads like Jira history. That is not a promotion case.",
    harsh_truth: "Five tickets closed. Your manager still calls you reliable, never senior. That is the real gap.",
    process_breakdown: "Planning starts tomorrow. Your architecture proposal still lives in six Slack threads.",
  },
}

const cellOutcomeAnchors: Record<string, Record<string, string>> = {
  ai: {
    how_to_without: "a usable AI draft that preserves the solo creator's recognizable voice without another rewrite loop",
    struggles_advice: "a repeatable voice input that stops generic drafts before the solo creator has to rescue them",
    harsh_truth: "standalone repurposed posts built around distinct claims rather than summaries of one source",
    process_breakdown: "a voice-consistent batch moved from raw material into the scheduler in one focused session",
  },
  web: {
    how_to_without: "a mobile visitor reaching a clear call or quote action without a full redesign",
    struggles_advice: "a homeowner seeing verifiable local trust before deciding to call a competitor",
    harsh_truth: "a booking form that asks only for what is needed to begin the service conversation",
    process_breakdown: "a homeowner moving from the landing page to a working mobile booking path before visual polish",
  },
  career: {
    how_to_without: "an architecture decision that records the engineer's judgment and earns visible ownership",
    struggles_advice: "promotion evidence that turns vague manager feedback into named senior-level behaviors",
    harsh_truth: "a self-review bullet that connects engineering judgment to a business or cross-team change",
    process_breakdown: "one promotion-ready design artifact that demonstrates cross-team judgment before planning begins",
  },
}

function stableIndex(value: string, length: number) {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % length
}

function nicheKeyForPillar(pillar: string): "ai" | "web" | "career" | null {
  if (/\bAI\b|content|brand voice|repurpos|tool evaluation/i.test(pillar)) return "ai"
  if (/local|conversion|booking|social proof|web design|DIY/i.test(pillar)) return "web"
  if (/technical|career|senior|promotion|burnout|cross-functional|stakeholder/i.test(pillar)) return "career"
  return null
}

export type LinkedInPostPlan = {
  archetype: LinkedInArchetype
  hookStyle: LinkedInHookStyle
  pillar: string
  topic?: string
}

export function selectMechanics(plan: LinkedInPostPlan) {
  const hooks = hookMechanicPools[plan.archetype.id] ?? []
  const closers = closerMechanicPools[plan.archetype.id] ?? []
  const nicheKey = nicheKeyForPillar(plan.pillar)
  const nicheOffset = nicheKey ? { ai: 0, web: 1, career: 2 }[nicheKey] : undefined
  const pick = (pool: Mechanic[], kind: string) => {
    if (!pool.length) return null
    const familyIndex = stableIndex(`${plan.archetype.id}|${plan.hookStyle.id}|${kind}`, pool.length)
    const diversityOffset = nicheOffset ?? stableIndex(plan.pillar, pool.length)
    return pool[(familyIndex + diversityOffset) % pool.length]
  }
  return { hook: pick(hooks, "hook"), closer: pick(closers, "closer") }
}

export function archetypeById(id: string) {
  return linkedInArchetypes.find((item) => item.id === id)
}

export function hookStyleById(id: string) {
  return linkedInHookStyles.find((item) => item.id === id)
}

export function voicePresetById(id: string) {
  return linkedInVoicePresets.find((item) => item.id === id) ?? linkedInVoicePresets[0]
}

export function buildLinkedInSystemPrompt(input: {
  voice: LinkedInVoicePreset
  niche: string
  brief: { audience: string; promise: string; painPoints: string[] }
  excludedTopics?: string[]
  proof?: string[]
}) {
  const proofText = input.proof?.length ? input.proof.map((p) => `- ${p}`).join("\n") : "none"
  const unprovedNumberRule = input.proof?.length
    ? "Every outcome number, percentage, currency figure, or personal timeline must be supported verbatim by PROOF."
    : "There is no proof bank. Do not use percentages, currency figures, performance statistics, guarantees, or narrator anecdotes. Numbers may only be neutral process constraints such as step counts, field counts, or meeting lengths. Do not use the '#' character."
  return [
    input.voice.systemPrompt,
    `Niche: ${input.niche}.`,
    `Audience: ${input.brief.audience}. Core promise: ${input.brief.promise}.`,
    `Audience pain points: ${input.brief.painPoints.join("; ")}.`,
    input.excludedTopics?.length ? `Never write about: ${input.excludedTopics.join(", ")}.` : "",
    `PROOF (the only permitted source of personal claims/numbers about the author):\n${proofText}`,
    "Formatting rules: plain text only (no markdown, LinkedIn renders none). No links. No hashtags. At most 1 emoji. One idea per line, with a blank line between ideas. Favor a short / short / longer line rhythm instead of essay paragraphs. Total length 500-1900 characters.",
    "The first line is the hook. It must survive LinkedIn's '...see more' fold: the first 200 characters must work standalone and create a reason to click.",
    "Specificity rule: write the example, not the category. Include at least 3 useful concrete artifacts across at least 2 types: a named tool or document, an exact sentence the reader can paste or say, a number/timeframe/process constraint, or a one-line before/after mini-example. Numbers may describe steps or actions, but never invent author results, client results, or social proof.",
    "Relevance rule: the content pillar is raw material, not the final angle. Connect it explicitly to the audience's core promise and cost of inaction in the hook, the body, and the closer. Do not drift into generic productivity, writing, design, or career advice.",
    unprovedNumberRule,
  ].filter(Boolean).join("\n\n")
}

export function buildLinkedInUserPrompt(input: { plan: LinkedInPostPlan }) {
  const { plan } = input
  const selected = selectMechanics(plan)
  const nicheKey = nicheKeyForPillar(plan.pillar)
  const cellExample = nicheKey ? cellHookExamples[nicheKey]?.[plan.archetype.id] : null
  const outcomeAnchor = nicheKey ? cellOutcomeAnchors[nicheKey]?.[plan.archetype.id] : null
  const fallbackExample = plan.hookStyle.examples[0]
  return [
    `Archetype: ${plan.archetype.label}`,
    `Structure: ${plan.archetype.structure}`,
    `Template: ${plan.archetype.template}`,
    `Content pillar: ${plan.pillar}`,
    `Hook style: ${plan.hookStyle.formula}`,
    selected.hook ? `Selected hook mechanic — ${selected.hook.id}: ${selected.hook.instruction}. Shape example (do not copy): ${selected.hook.example}` : "",
    `Niche/archetype hook exemplar (learn its specificity and moment of recognition; do not copy): ${cellExample ?? fallbackExample}`,
    outcomeAnchor ? `Outcome anchor: every body item must move the reader toward ${outcomeAnchor}.` : "",
    "Hook requirement: the hook must stay on one line and be 105 characters or fewer. It may be one sentence or two clipped sentences. Follow only the selected hook mechanic. Show a symptom the reader could have seen this week in a draft, screen, form, document, meeting, or message. Create curiosity about the useful correction. Do not default to 'Worried your...', and do not bolt on a generic subtitle.",
    "Voice requirement: break the clean AI-list cadence. Deliberately vary item length, syntax, and line count. Across the body, weave in at least two of these without labels: one brief fragment or aside, one two-line mini-scene, one exact sentence the reader can paste or say. Do not place them in the same item position by habit. Include one useful tradeoff or compact if-then heuristic, but never label it 'Decision rule'. Do not invent a narrator anecdote.",
    "Tool rule: name at most 2 software tools in the entire post. A tool only counts as useful detail when you show its input, output, or decision point; otherwise use a document, script, or mini-example instead.",
    "Count rule: how-to and struggles posts use exactly 4 numbered items; process posts use exactly 6. If the hook promises N tips, fixes, or steps, N must match that required body count.",
    selected.closer ? `Selected closer mechanic — ${selected.closer.id}: ${selected.closer.instruction}. Shape example (do not copy): ${selected.closer.example}` : "",
    "Closer requirement: follow only the selected closer mechanic and end with exactly one interrogative sentence ending in '?'. Reuse a concrete artifact, phrase, or moment from this post. It should feel useful to answer, not like a multiple-choice comprehension check. Avoid 'Where does it stall: A, B, or C?', 'Which one is missing?', 'What's your process?', 'Thoughts?', 'Agree?', and 'What do you think?'.",
    "Formatting reliability: put a blank line between every numbered item. Use at most one em dash in the entire post.",
    "Before returning, silently verify: hook <=105 characters; selected hook and closer shapes are visible; required item count matches body; every item advances the outcome anchor; at least 3 concrete artifacts across 2 types; no unsupported statistics or universal outcome claims; varied line rhythm; final slot is one specific question.",
    "Fill every slot. Slots are joined with blank lines in order to form the final post.",
  ].filter(Boolean).join("\n")
}
