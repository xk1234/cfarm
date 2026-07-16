/**
 * LinkedIn post presets + prompt builders — THE EXPERIMENT SURFACE.
 *
 * Codex: this is the ONLY file you edit. Iterate archetypes, hook styles, voice
 * presets, and the prompt builders until the quality gate passes. Ground every
 * change in PLAYBOOK.md. Never touch judge.mjs or run.mjs.
 *
 * PRESET_VERSION must be bumped on every substantive change so reports are
 * attributable.
 */

export const PRESET_VERSION = "v6-outcome-cadence"

const slot = (key, description, minWords, maxWords, optional = false) => ({ key, description, minWords, maxWords, optional })

/**
 * Archetypes distilled from the playbook. `personaSafe: true` means the
 * educator voice can run it without proof-bank facts.
 */
export const linkedInArchetypes = [
  {
    id: "struggles_advice",
    label: "Struggles → advice",
    weight: 2,
    personaSafe: true,
    structure: "recognition hook → natural bridge → 3-5 textured struggle/fix pairs → selected reader-owned closer",
    template: "[Hook showing the painful moment]. [Brief bridge]. 1. [specific struggle] → [concrete action/example] ... [selected closer mechanic]",
    slots: [
      slot("hook", "One sharp hook under 105 characters showing an observable moment where the ICP feels stuck; connect it to the niche's core promise. Do not announce a generic list or use a topic-level trope", 7, 18),
      slot("bridge", "A brief, natural pivot into useful fixes. Do not use 'If that sounds familiar' or announce that a list is coming", 5, 14),
      slot("pairs", "Exactly 4 numbered struggle-to-fix pairs, separated by blank lines. Every struggle must receive an answer. Vary item length deliberately: one can be a fragment plus answer, one a two-line mini-scene, and one an exact sentence to say or paste. Rotate labeled connectors with unlabeled imperatives. Each answer needs an artifact, exact action, or mini-example. Express one compact if-then heuristic, but do not label it 'Decision rule'", 80, 165),
      slot("closer", "Exactly one question ending in '?'. Follow the selected closer mechanic from the prompt and make the reader describe their own situation, not evaluate the post", 6, 20),
    ],
    engagementCloser: true,
  },
  {
    id: "how_to_without",
    label: "How-to without obstacle",
    weight: 3,
    personaSafe: true,
    structure: "observable failure hook → varied tips with examples and reasons → selected reader-owned closer",
    template: "[Visible failure, then promised outcome without felt obstacle]. 1. [tip + concrete example] [why] ... [selected closer mechanic]",
    slots: [
      slot("hook", "Under 105 characters: lead with an observable failure, then promise a specific outcome without the felt obstacle. Use an odd count for the list and connect to the niche's core promise", 7, 18),
      slot("tips", "Exactly 4 numbered tips, separated by blank lines, with visibly different lengths and grammatical openings. Use at least two natural textures: a brief fragment or aside, a two-line mini-scene, or an exact sentence to say or paste. Tip 1 should overturn obvious advice. Include one compact if-then heuristic without the label 'Decision rule', plus one thing to stop doing. Avoid repeated sentence molds", 90, 175),
      slot("closer", "Exactly one question ending in '?'. Follow the selected closer mechanic from the prompt and ground it in an artifact or action from this post", 6, 20),
    ],
    engagementCloser: true,
  },
  {
    id: "framework",
    label: "Step framework",
    weight: 2,
    personaSafe: true,
    structure: "framework promise → numbered steps with context → objective → question",
    template: "The [x]-step framework that [positive outcome]: 1. [step] [context] ... The aim: [objective]. What do you think?",
    slots: [
      slot("hook", "Framework promise with a concrete positive outcome", 6, 16),
      slot("steps", "3-6 numbered steps, each with one context line", 60, 160),
      slot("objective", "One-line aim of the framework", 6, 16),
      slot("closer", "Short opinion-inviting question", 3, 10),
    ],
    engagementCloser: true,
  },
  {
    id: "harsh_truth",
    label: "Harsh truth",
    weight: 2,
    personaSafe: true,
    structure: "blunt diagnosis hook → real reason → textured before/after moment → concrete fix → selected self-audit closer",
    template: "[Surprising correction; 'Harsh truth:' is optional]. [Real reason]. [Weak moment → specific replacement]. [Action]. [selected closer mechanic]",
    slots: [
      slot("hook", "Under 105 characters: make a surprising diagnosis of an observable failure and its tempting wrong fix. 'Harsh truth:' is optional and should only appear when the selected hook mechanic calls for it. Connect it to the niche's core promise", 8, 18),
      slot("reason", "One idea explaining the real reason for failure in concrete niche language. Write 1-2 short lines, not an essay paragraph", 18, 42),
      slot("example", "A compact mini-scene showing the weak version and a specific replacement. Vary the cadence: a fragment, an aside, or two unequal lines. Include exact words, a tool, a metric to inspect, or a realistic scenario", 16, 44),
      slot("fix", "One concrete next action with an exact sentence to paste or say, named artifact, tool, or short sequence. Keep one idea per line and avoid universal causal claims", 18, 48),
      slot("closer", "Exactly one question ending in '?'. Follow the selected closer mechanic from the prompt and make it a useful self-audit, not a quiz", 6, 20),
    ],
    engagementCloser: true,
  },
  {
    id: "less_more",
    label: "Needs less / more of",
    weight: 2,
    personaSafe: true,
    structure: "topic needs less of: 3 dislikes → and more of: 3 likes",
    template: "[Topic] needs less of this: - [thing] ×3. And more of: - [thing] ×3.",
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
    template: "Bad [topic]: - thing ×3. Good [topic]: - thing ×3. Anything you'd add?",
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
    slots: [
      slot("question", "One micro-commitment question aimed at the ICP", 8, 20),
    ],
    engagementCloser: true,
  },
  {
    id: "process_breakdown",
    label: "Process breakdown",
    weight: 2,
    personaSafe: true,
    structure: "visible bottleneck hook → reader outcome bridge → concrete start-to-finish process → selected process closer",
    template: "[Visible bottleneck and promised result]. [What this process changes for the reader]. 1..N. [selected closer mechanic]",
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
    template: "[Timeframe] ago I [risk] . [Context] [Obstacle] [Reality] [Turning point] Now: [results]. [Lesson]",
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
    template: "My old [topic]: ×3. My new [topic]: ×3. [Old emotion/result] Now [new result]. Small change, big impact.",
    slots: [
      slot("hook", "My old [topic]:", 3, 8),
      slot("old", "Three old-way lines from proof facts", 12, 40),
      slot("new", "Three new-way lines from proof facts", 12, 40),
      slot("contrast", "Emotional and result contrast, then small change big impact", 12, 35),
    ],
    engagementCloser: false,
  },
]

export const hookStyles = [
  { id: "how_to_parenthetical", label: "How-to + parenthetical", formula: "How to [outcome] in [n] steps ([sweetener])", examples: ["How to steal an audience on LinkedIn in 8 simple steps (this is a secret):"] },
  { id: "without_obstacle", label: "Without obstacle", formula: "[observable failure] → [specific outcome without the felt obstacle]", examples: ["The draft is open again. Fix the inputs before rewriting every line yourself:"] },
  { id: "steal_this", label: "Steal this", formula: "Steal this [asset] ([sweetener])", examples: ["Steal this 3 part structure for LinkedIn posts (and use it 100% of the time):"] },
  { id: "harsh_truth", label: "Harsh truth", formula: "[uncomfortable diagnosis or scapegoat reversal; literal label optional]", examples: ["Your quiet inbox is not a color-palette problem."] },
  { id: "needs_less", label: "Needs less", formula: "[Topic] needs less of this:", examples: ["LinkedIn needs less of this:"] },
  { id: "worried_problem", label: "Worried problem", formula: "[recognizable scene, quote, or contradiction exposing the feared problem]", examples: ["You delete the opening before you even reach line two. The voice setup is the problem."] },
  { id: "micro_commitment", label: "Micro commitment", formula: "In [n] words or less, [question]?", examples: ["In 5 words or less, what advice would you give someone just starting out on LinkedIn?"] },
  { id: "contrarian_identity", label: "Contrarian identity", formula: "[Impressive metric] isn't a skill. [Underlying craft] is.", examples: ["Getting 25,000 LinkedIn followers isn't a skill. Writing is."] },
  { id: "big_number", label: "Big number", formula: "[Specific odd number result] + [method tease]", examples: ["In September I generated 1,990,835 views on LinkedIn. Here are the hooks of the top 5 posts:"], needsProof: true },
  { id: "transformation", label: "Transformation", formula: "[Timeframe] ago I was [specific bad details].", examples: ["3 years ago I was single, 28lbs overweight and lived in a 6 bed house share in London."], needsProof: true },
]

export const voicePresets = [
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

export const formatRules = {
  maxCharacters: 1900,
  minCharacters: 500,
  hashtagPolicy: "none",
  maxEmoji: 1,
  maxEmDash: 1,
  foldCharacters: 200,
  firstLineMaxCharacters: 60,
}

const mechanic = (id, instruction, example) => ({ id, instruction, example })

/**
 * Feed-level rotation pools. Each evaluated archetype owns distinct mechanics,
 * so a selected shape cannot silently become the default across the matrix.
 */
export const hookMechanicPools = {
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

export const closerMechanicPools = {
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

const cellHookExamples = {
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

const cellOutcomeAnchors = {
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

function stableIndex(value, length) {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % length
}

function nicheKeyForPillar(pillar) {
  if (/\bAI\b|content|brand voice|repurpos|tool evaluation/i.test(pillar)) return "ai"
  if (/local|conversion|booking|social proof|web design|DIY/i.test(pillar)) return "web"
  if (/technical|career|senior|promotion|burnout|cross-functional|stakeholder/i.test(pillar)) return "career"
  return null
}

export function selectMechanics(plan) {
  const hooks = hookMechanicPools[plan.archetype.id] ?? []
  const closers = closerMechanicPools[plan.archetype.id] ?? []
  const nicheKey = nicheKeyForPillar(plan.pillar)
  const nicheOffset = { ai: 0, web: 1, career: 2 }[nicheKey]
  const pick = (pool, kind) => {
    if (!pool.length) return null
    const familyIndex = stableIndex(`${plan.archetype.id}|${plan.hookStyle.id}|${kind}`, pool.length)
    const diversityOffset = nicheOffset ?? stableIndex(plan.pillar, pool.length)
    return pool[(familyIndex + diversityOffset) % pool.length]
  }
  return {
    hook: pick(hooks, "hook"),
    closer: pick(closers, "closer"),
  }
}

/** Build the system prompt for one generation call. Codex: iterate freely. */
export function buildSystemPrompt({ voice, niche, brief, excludedTopics, proof }) {
  const proofText = proof?.length ? proof.map((p) => `- ${p}`).join("\n") : "none"
  const unprovedNumberRule = proof?.length
    ? "Every outcome number, percentage, currency figure, or personal timeline must be supported verbatim by PROOF."
    : "There is no proof bank. Do not use percentages, currency figures, performance statistics, guarantees, or narrator anecdotes. Numbers may only be neutral process constraints such as step counts, field counts, or meeting lengths. Do not use the '#' character."
  return [
    voice.systemPrompt,
    `Niche: ${niche}.`,
    `Audience: ${brief.audience}. Core promise: ${brief.promise}.`,
    `Audience pain points: ${brief.painPoints.join("; ")}.`,
    excludedTopics?.length ? `Never write about: ${excludedTopics.join(", ")}.` : "",
    `PROOF (the only permitted source of personal claims/numbers about the author):\n${proofText}`,
    "Formatting rules: plain text only (no markdown, LinkedIn renders none). No links. No hashtags. At most 1 emoji. One idea per line, with a blank line between ideas. Favor a short / short / longer line rhythm instead of essay paragraphs. Total length 500-1900 characters.",
    "The first line is the hook. It must survive LinkedIn's '...see more' fold: the first 200 characters must work standalone and create a reason to click.",
    "Specificity rule: write the example, not the category. Include at least 3 useful concrete artifacts across at least 2 types: a named tool or document, an exact sentence the reader can paste or say, a number/timeframe/process constraint, or a one-line before/after mini-example. Numbers may describe steps or actions, but never invent author results, client results, or social proof.",
    "Relevance rule: the content pillar is raw material, not the final angle. Connect it explicitly to the audience's core promise and cost of inaction in the hook, the body, and the closer. Do not drift into generic productivity, writing, design, or career advice.",
    unprovedNumberRule,
  ].filter(Boolean).join("\n\n")
}

/** Build the user prompt for one generation call. Codex: iterate freely. */
export function buildUserPrompt({ plan }) {
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
