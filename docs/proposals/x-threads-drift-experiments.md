# X & Threads content-quality debug — diagnosis + experiment brief for Codex

**Date:** 2026-07-15
**Author:** research pass (Claude) — Codex executes the experiments below and reports numbers back.
**Symptom being debugged:**
- **X:** 55/100 structural, 7.5/10 AI judge. Drifts into generic productivity content, never mentions the configured niche (astrology).
- **Threads:** 60/100 structural, 8.8/10 AI judge. Strong astrology relevance/scannability/polarity/reply-prompt.

**Reference "gold standard" material (on disk):**
- X: `~/Desktop/Knowledge Base/Assets/X empire - Phantom Profits/01-CONTENT ENGINE - GROWTH WITHOUT A FACE.pdf` + `…/01-CRACKING SOCIAL MEDIA ALGORITHMS.pdf`
- Threads: `~/Desktop/Knowledge Base/Assets/Viral Threads Blueprint- For Growth.pdf`

---

## 0. Architecture reality (important — notes were stale)

X and Threads are the **same code path**. The old 6-stage X pipeline was removed and rebuilt to copy the slideshow **single-call** pattern. Today both platforms run:

1. **Stage 0 (once/automation):** `derivePillarsFromNiche` — niche → `brief{audience,promise,pillars,keywords,painPoints}`. `lib/x-automation-generation.ts:51`
2. **Stage 1 (deterministic, no LLM):** `selectPostPlan` — picks `{archetype,pillar,hookStyle,topic?,recycleBody?}`. `lib/x-automation-generation.ts:97`
3. **Stage 2 (no LLM):** `retrieveViralHookExamples` — RAG top-5 from `data/viral-hooks/hooks.jsonl`. `lib/x-automation-generation.ts:314`
4. **Stage 3 (the one LLM call + 1 repair retry):** `generatePost`. `lib/x-automation-generation.ts:277`
5. **Stage 5a (heuristic scorer):** `benchmarkXRun` → the "structural /100". `lib/x-automation.ts` (weights `:850`)
6. **Stage 5b (AI judge):** `benchmarkXRunWithJudge`/`gradeXPost` → the "x/10". `lib/x-benchmarks.ts:128`

Presets (voices, archetypes, hooks, platform rules): `lib/x-post-presets.ts`.

---

## 1. Root-cause diagnosis (verified against source)

### X drift → generic productivity (ranked by leverage)

| # | Root cause | Location | Why it causes drift |
|---|---|---|---|
| R1 | **Niche label never enters the generation system prompt.** Only niche-aware element is a binary astrology regex. Everything else → `"Deliver immediately useful, concrete niche value."` | `lib/x-automation-generation.ts:287-290` | Model is never told the subject. It infers topic only from a one-word `Pillar:` line, so it defaults to the generic voice's productivity register. |
| R2 | **Topic used only 20% of runs:** `useTopic = Boolean(topic) && random() < 0.2` | `lib/x-automation-generation.ts:123` | Discovered trends / typed topics are discarded 4/5 runs in favor of an abstract pillar label → timely, on-niche angle is thrown away. |
| R3 | **Hook example strings are productivity/money clichés,** injected verbatim as `Hook examples:` | `lib/x-post-presets.ts:67-78` (e.g. `"i made $87k in 90 days using [method]"`, `"you're losing $10k/year by not doing this"`, `"just a reminder: small wins count"`) | The model imitates the example register → business/creator-economy slop. |
| R4 | **Viral-hook RAG corpus ~89% generic** (~2,447 money/productivity rows vs ~293 astrology of 45,310) | `data/viral-hooks/hooks.jsonl` | "Proven hook-shape inspiration" reinforces generic virality; weak niche tokens match off-topic shapes. |
| R5 | **No niche-relevance gate anywhere.** Validation checks length/format/slop; judge rubric grades hook/value/voice/reply-bait. | `validateGeneratedPost` `:182-232`; `benchmarkRubric` `lib/x-benchmarks.ts:263-268` | Drift is never detected or penalized, so nothing pulls generation back on-niche. |

This is the **exact inverse** of the Content Engine reference: 80% on-pillar, niche-first, explicit "what FLOPS = generic advice / vague inspiration." The code fights its own playbook.

### Threads (two distinct issues)

| # | Issue | Location | Note |
|---|---|---|---|
| T1 | **The "60/100 structural" is largely a measurement artifact.** `benchmarkXRun` scores `stageCompleteness` over 6 X-shaped stages (hook/setup/content/proof/curiosityGap/cta) at weight 0.12, plus `cta` at 0.12. A correctly-formatted single-line Threads post legitimately has only hook+body → stageCompleteness ≈ 17–33% and cta ≈ 0. ~24% of the score weight penalizes on-blueprint Threads posts. | `lib/x-automation.ts:821-832,850-859` | The AI judge (8.8/10, Threads-specific rubric) already says the content is good. The heuristic is the thing that's wrong, not the content. |
| T2 | **Only 6 of the spec'd 13 Threads archetypes shipped.** Missing the blueprint's Credibility (#4) and Celebrate-Every-Win formats (credibility_claim, expertise_drop, win_celebration, controversial_humor, poll_post, normalize_flex, aphorism_stack). | shipped `threadsPostArchetypes` `lib/x-post-presets.ts:56-63` vs spec the archetype blueprint (now folded into `lib/x-post-presets.ts`) | Half the blueprint surface is missing → less format diversity, and the credibility/proof pillar the blueprint stresses is absent. |
| T3 | Same "niche label absent from system prompt" as R1, lower impact here (personal_connector voice + pillar carry astrology relevance well). | `:287-290` | Fix jointly with R1. |

---

## 2. Measurement gap (build this FIRST)

There is **no niche-relevance metric** in the codebase — yet "never mentions astrology" is the core complaint. Every experiment below needs an on-topic score to be judged, so Codex must build the harness before running any A/B.

### EXP-0 — Offline eval harness (no product behavior change)
**Goal:** a repeatable script that generates K posts for a fixed set of automations and scores each on: (a) existing structural `benchmarkXRun`, (b) AI judge 4-dim, (c) **NEW niche-relevance** — an LLM call scoring 0–10 "how concretely does this post engage the niche `<label>`" + a binary `mentionsNiche`. Print a per-condition table (mean structural, mean judge, mean relevance, % on-topic).
**Fixtures:** astrology automation + at least 2 non-astrology niches (e.g. `fitness for busy dads`, `personal finance for gen z`) to prove generalization beyond the astrology regex. Fixed RNG seed so plan selection is reproducible (`selectPostPlan` already accepts `random` + `now`).
**Deliverable:** `scripts/eval-xthreads.mjs` (or ts) + a committed baseline table. Everything after is measured as a delta vs this baseline.

---

## 3. Experiments (ordered; each = hypothesis → change → measure)

Run against EXP-0 harness. K ≥ 20 posts per condition per niche. Report mean structural, mean judge, **mean relevance + % on-topic**, and format-diversity where relevant.

### EXP-1 (X, highest leverage) — Inject niche into the system prompt
**Hypothesis:** Making the model explicitly aware of the niche is the single biggest on-topic lift.
**Change:** In `generatePost` system assembly (`lib/x-automation-generation.ts:290`), prepend niche context: `record.niche.label`, `brief.audience`, `brief.promise`, top `brief.keywords`. Generalize `nicheAdaptation` (`:287-289`) so non-astrology niches get a real, niche-derived instruction instead of the generic fallback (drive it off `brief`, not a regex).
**Measure:** relevance + % on-topic vs baseline; watch judge/structural don't regress.

### EXP-2 (X) — Raise topic-usage rate
**Hypothesis:** Discarding the topic 80% of the time is a major drift source for trend-seeded runs.
**Change:** `lib/x-automation-generation.ts:123` — A/B the `0.2` gate at `0.5` and `1.0` **when a topic is present**. (Keep pillar sampling when no topic.)
**Measure:** relevance/timeliness on runs where a `topic`/`sourceCandidate` exists; check archetype-pillar diversity doesn't collapse.

### EXP-3 (X) — De-genericize hook examples + RAG
**Hypothesis:** Productivity example strings + generic RAG corpus pull the register toward money/creator slop.
**Change (two arms):** (a) Replace the money/productivity `examples` in `lib/x-post-presets.ts:67-78` with niche-neutral placeholders or `brief`-derived examples. (b) In `retrieveViralHookExamples` (`:314-334`) require a stronger niche-token match (drop off-topic shapes) — or filter/re-weight the corpus.
**Measure:** productivity-register rate (can reuse the relevance LLM to flag off-niche register) + judge.

### EXP-4 (X + Threads) — Add a niche-relevance guardrail
**Hypothesis:** A relevance gate catches drift the current pipeline ships silently.
**Change:** Add an on-topic dimension: either a lightweight keyword/entity check in `validateGeneratedPost` that sets `needsReview` when the niche is absent, and/or a `nicheRelevance` dimension in the judge rubric (`lib/x-benchmarks.ts:263-268`) surfaced in the run.
**Measure:** drift-catch rate (how many baseline off-topic posts get flagged); false-positive rate on good posts.

### EXP-5 (Threads) — Make the structural scorer platform-aware
**Hypothesis:** Threads' low structural score is an artifact of the X-shaped rubric, not content quality.
**Change:** In `benchmarkXRun` (`lib/x-automation.ts:821-859`), for `platform === "threads"` drop the X-only stages from `stageCompleteness` (score hook + body + reply-prompt instead of the 6 X stages) and stop weighting a hard `cta`. Align with the Threads judge rubric dims (hookLabelPower, scannability, identityPolarity, replyBait).
**Measure:** Threads structural should rise toward the 8.8 judge signal **without changing generation** — confirming T1. If it does, the "60" was a rubric bug.

### EXP-6 (Threads) — Restore the full 13-format blueprint library
**Hypothesis:** Missing credibility/flex/win/humor formats reduce diversity and omit the blueprint's Credibility pillar.
**Change:** Add the missing archetypes per the archetype blueprint (now folded into `lib/x-post-presets.ts`) to `threadsPostArchetypes` (`lib/x-post-presets.ts:56-63`) with structures/templates distilled from the Viral Threads Blueprint (labeled hooks p.15; bonus story templates p.26-28; credibility p.17-20; celebrate wins p.30).
**Measure:** format diversity across K runs + judge/structural per new format.

---

## 4. Suggested run order & reporting

1. EXP-0 (baseline) — commit the table.
2. EXP-5 (Threads scorer) — cheap, confirms the 60 is an artifact; no generation change.
3. EXP-1 (X niche in prompt) — expected biggest X on-topic jump.
4. EXP-2, EXP-3 (X topic rate + hooks) — stack on EXP-1.
5. EXP-4 (guardrail) — lock in gains, prevent regressions.
6. EXP-6 (Threads library) — diversity + credibility pillar.

For each experiment report: condition, K, mean structural, mean judge, **mean relevance, % on-topic**, plus 2–3 sample outputs (best + worst). Keep changes behind small flags where possible so arms are comparable on one seed.
