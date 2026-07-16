# LinkedIn Automation Template — Implementation Plan

Goal: a new automation kind (`linkedin`) that generates high-converting, niche-targeted LinkedIn
text posts with AI, structurally mirroring the X/Threads automation (`lib/x-automation*.ts`) —
the closest sibling — while borrowing the benchmark/judge pattern from slideshows
(`lib/slideshow-benchmarks.ts`).

Source playbook: Matt Barker's "30 Days of Proven LinkedIn Templates" (distilled into
`scripts/linkedin-lab/PLAYBOOK.md`) — 30 post templates, 50 proven hooks, and the pro-tip
principles behind them.

---

## 1. Why the X automation is the blueprint

| Concern | Slideshow automation | X/Threads automation | LinkedIn (this plan) |
|---|---|---|---|
| Output | images + text placeholders | plain text post(s) | plain text post (single) |
| Generation | one structured-output call + repair | one structured-output call + repair | same |
| Presets | formats/tones in template records | archetypes/hooks/voices as code data (`lib/x-post-presets.ts`) | same pattern, LinkedIn presets |
| Publishing | PostFast multi-provider | PostFast (threads blocked) | PostFast `linkedin` provider — **already supported** (`lib/postfast-client.ts:34`, `lib/postfast-provider-controls.ts:54`) |
| Benchmarks | LLM judge, image-aware | heuristic only | heuristic pre-filter + **text-only LLM judge** (new) |

LinkedIn is simpler than X in two ways: single posts only (no thread chains, so
`x-automation-publishing.ts`'s thread block is irrelevant) and one platform (no x/threads split).

## 2. Key design decision: persona mode (anti-fabrication)

The playbook templates are heavily first-person ("My 6 biggest struggles as a new copywriter…").
An automation has no lived experience, so first-person claims are fabrication unless backed by
user-supplied facts. Two voice modes, mirroring the X `proofBank` gate:

- **`educator` (default)** — observational authority. Templates are transformed:
  "My X biggest struggles…" → "The X struggles every new [role] faces…". No first-person
  experience claims, no invented numbers. Safe for any niche out of the box.
- **`practitioner`** — first-person, but every experience/number claim must trace to the
  record's `proofBank` (user-entered facts: results, timelines, credentials). Archetypes that
  require personal narrative (journey story, transformation timeline, mistake breakdown) are
  gated `needsProof` and only eligible in this mode with a non-empty proof bank.

Deterministic validation cross-checks numeric claims against the proof bank exactly like
`validateGeneratedPost()` in `lib/x-automation-generation.ts:147-150`.

## 3. Data model (production phase)

`lib/linkedin-automation.ts` — `LinkedInAutomationRecord`, copied shape from `XAutomationRecord`
(`lib/x-automation.ts:52-125`), minus platform split, plus:

```ts
type LinkedInAutomationRecord = {
  id: string
  name: string
  niche: string
  brief?: LinkedInBrief              // audience, promise, pillars[weighted], keywords, painPoints
  excludedTopics: string[]
  proofBank: ProofEntry[]
  persona: { mode: "educator" | "practitioner"; bio?: string; role?: string }
  output: { maxCharacters: number    // default 1900; sweet spot enforced by judge
            hashtagPolicy: "none" | "three_to_five" }
  generation: { model: string; archetypes: string[]; hookStyles: string[]
                voicePreset: string; voiceOverride?: string; language: string }
  benchmarks: { autoRun: boolean }
  publishing: { integrations: PublishingIntegration[] }   // provider: "linkedin"
  schedule: { cadence: ...; postingTimes: ... }
  usage: { recentArchetypes: ...; recentHooks: ...; recentTopics: ... }
}
```

## 4. Generation pipeline (mirrors `lib/x-automation-generation.ts`)

1. `deriveBriefFromNiche(niche)` — one-time strategy call → audience/promise/pillars(30/20/15/10/5)/keywords/painPoints.
2. `selectPostPlan(record)` — weighted archetype pick (recency dedup, `maxPerWeek`, proof gating),
   pillar pick (80/20 with topic override), hook-style pick (non-repeating).
3. `generatePost(plan)` — ONE OpenRouter structured-output call (json_schema strict, per-archetype
   slot schema) + ≤1 repair attempt feeding validator errors back.
4. `composePost()` — slots → final post text with LinkedIn line-break rhythm.
5. `validateLinkedInPost()` — deterministic checks (see §6 gate).
6. `benchmarkLinkedInPost()` — heuristic pre-filter + LLM judge (autoRun).

Default generation model: `anthropic/claude-sonnet-5` (won the 2026-07-14 slideshow shootout,
`lib/realfarm-generation-model-registry.ts:29-34`); experiment harness also trials
`google/gemini-3.1-flash-lite` (X default) for cost.

## 5. Preset library (the experiment surface)

`scripts/linkedin-lab/presets.mjs` during experimentation → ported to
`lib/linkedin-post-presets.ts` for production. Distilled from the playbook's 30 templates into
~12 archetypes (struggles→advice, how-to-become, named-method, less-of-more-of opinion, topic-101,
things-that-destroy, journey/transformation story*, process breakdown, tips-without-obstacle,
harsh truth, good-vs-bad, old-way-new-way*, cheat codes, type-of-person callout, micro-question)
— *proof-gated. Plus ~10 hook styles from the Top-50 hook corpus (steal-this, big-number*,
save-yourself-time, this-is-how-i*, question-micro-commitment, harsh-truth, needs-less-of,
worried-about-problem, timeframe-transformation*, how-to-without-obstacle).

## 6. Testing benchmarks

### Deterministic gate (zero tolerance, checked in code)
- No URLs in body (kills reach; playbook rule).
- Hook fold: first line ≤ 60 chars punchy opener; first 200 chars must stand alone (LinkedIn
  "…see more" truncation) and contain no colon-list spillover.
- Length 500–1,900 chars; ≥ 6 line breaks (scannability); no line > ~220 chars.
- No markdown syntax (LinkedIn renders none).
- Hashtags per policy (0 or 3–5, end of post only).
- ≤ 1 emoji, ≤ 1 em dash; banned AI-slop phrases (game-changer, "in today's fast-paced world",
  "let that sink in", delve, 🚀-spam, "I'm humbled", "Here's the kicker" …).
- Numeric/experience claims must appear in proofBank (practitioner) or be absent (educator).

### LLM judge (frozen: `scripts/linkedin-lab/judge.mjs`, model `openai/gpt-5.4-mini`, temp 0)
Seven anchored 0–10 dimensions, weighted overall:

| Dimension | Weight | What it measures |
|---|---|---|
| hookStopPower | 20% | would the fold stop a scrolling ICP; curiosity + specificity |
| specificity | 20% | concrete numbers/steps/examples vs generic filler (the #1 AI failure) |
| valueDensity | 15% | actionable insight per line; bookmarkable |
| voiceAuthenticity | 15% | reads human/practitioner, not AI-slop or corporate |
| nicheResonance | 10% | ICP language, real pain points from the brief |
| scanFormat | 10% | line rhythm, whitespace, list discipline |
| engagementPull | 10% | comment-triggering closer without engagement-bait cringe |

Anchors written into the judge prompt (10 = indistinguishable from a top-1% creator post;
7 = publishable but unremarkable; 4 = obviously AI). Judge model family ≠ generator family to
reduce self-preference bias. Judge receives niche + brief + the post, never the prompt that
produced it.

### Quality gate (per iteration, 3 niches × 4 archetypes = 12 posts)
- mean overall ≥ **8.0**
- no post < **6.5**
- **0** deterministic violations
- Claude qualitative review sign-off (judge saturation guard — a human-taste read of every post)

Production port: `lib/linkedin-benchmarks.ts` reuses the same rubric, stores results like
`slideshow_benchmarks`, and later imports a corpus of real viral LinkedIn posts
(`benchmark_corpus` pattern) for niche-matched comparison.

## 7. Codex experiment protocol

Codex CLI (0.141.0) runs non-interactive sessions:
`codex exec --cd <repo> --sandbox workspace-write -c sandbox_workspace_write.network_access=true`

Rules of engagement (enforced by prompt + review):
- Codex may edit **`scripts/linkedin-lab/presets.mjs` only** (archetypes, hook styles, voice
  presets, system/user prompt builders) and may run `node scripts/linkedin-lab/run.mjs`.
- Codex must **never** edit `judge.mjs`, the rubric, or `run.mjs` config (gate integrity).
- Each iteration writes `scripts/linkedin-lab/results/<label>.json` + a markdown report.
- After each codex session, Claude reads the actual posts (not just scores), diagnoses failure
  modes, and issues the next improvement direction.

Improvement directions to try, in rough order (first prompts will NOT be adequate):
1. **Baseline** — straight template transcription of playbook archetypes.
2. **Fold-first rewriting** — generate hook separately/first, force ≤60-char opener, ban
   colon-heavy hooks, inject 3 playbook hook exemplars per style into the prompt.
3. **Specificity injection** — require ≥3 concrete artifacts per post (numbers, named tools,
   time amounts, mini-examples); add "write the example, not the category" instruction.
4. **Line-rhythm constraints** — 1 idea per line, sentence length variation pattern
   (short/short/long), blank-line rhythm rules in the system prompt.
5. **Anti-slop negative prompt** — enumerate banned phrases/structures observed in failed runs.
6. **Two-pass self-critique** — draft → model critiques against rubric → rewrite (cost +1 call).
7. **Model swap** — sonnet-5 vs gemini-3.1-flash-lite vs kimi-k2.7 at the winning prompt.
8. **Few-shot golden posts** — embed 2 full exemplar posts (rewritten from playbook "My Version"
   posts into educator voice) in the system prompt.

## 8. Production wiring phases (after prompts pass the gate)

1. **Presets + generation**: `lib/linkedin-post-presets.ts`, `lib/linkedin-automation-generation.ts` (+ tests mirroring `lib/x-automation-generation` patterns).
2. **Record + store**: `lib/linkedin-automation.ts` (normalize/migrate/defaults),
   `lib/linkedin-automation-store.ts`; register table `linkedin_automations` in
   `lib/appwrite-stores.ts:7-28`; add `"linkedin"` to `automationKind` union
   (`lib/realfarm-data.ts:37`) and `PostFastSourceType` (`lib/postfast-posts.ts:10-21`).
3. **API**: `app/api/linkedin-automations/{route.ts,[id]/route.ts,derive-brief/route.ts,generate/route.ts,publish/route.ts}` — copy the x-automations route shapes (`withHandler`, `force-dynamic`).
4. **Benchmarks**: `lib/linkedin-benchmarks.ts` (rubric from the lab, frozen), wire autoRun in generate route.
5. **UI**: `components/linkedin-automation-studio.tsx` (copy `x-automation-studio.tsx` 4-tab
   shape), branch in `components/realfarm/automations-view.tsx` on `automationKind === "linkedin"`.
6. **Publishing**: `publishPost()` via `lib/publishing.ts` with provider `linkedin`,
   `PostFastLinkedInControls` visibility default `PUBLIC`.
7. **Scheduling**: like X, start with manual/API-triggered `/generate`; wire into the Appwrite
   scheduler later (see the X/Threads platform-split scheduler pattern in `lib/x-automation-publishing.ts`).

## 9. Current status

- [x] Playbook distilled → `scripts/linkedin-lab/PLAYBOOK.md`
- [x] Lab harness (`presets.mjs`, `generate.mjs`, `judge.mjs`, `run.mjs`)
- [x] v1 baseline scores (6.44 mean)
- [x] Codex iterations → **v6-outcome-cadence** (mean ~7.65–7.72; judged good enough on content
  read to ship — the 8.0 gate is an elite/publish-unchanged bar, not a publish bar)
- [x] Shared LLM-slop guardrail (`lib/llm-slop*.{ts,json}`) wired into X + slideshow generators
- [x] Production port (§8.1): `lib/linkedin-post-presets.ts`, `lib/linkedin-automation-generation.ts`
- [x] Live generate API route (§8.3, stateless): `app/api/linkedin-automations/generate/route.ts`
      — verified end-to-end with real env + sonnet-5 (brief + posts generate, gate + repair work)
- [ ] Persistence: record/store + `linkedin_automations` Appwrite table (§8.2)
- [ ] Benchmarks lib (§8.4), Studio UI (§8.5), publish wiring (§8.6), scheduler (§8.7)

### Verified generation samples (fractional-CFO niche, untuned cell, educator voice)
Real posts produced through the production lib — see the session transcript. 0 violations on
how-to/struggles/harsh-truth; process_breakdown occasionally trips the ≤105-char first-line gate
(known rough edge — flagged `needsReview`, never auto-published).
