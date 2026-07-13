# Benchmarks & evaluation criteria for the E2E journeys

The `.spec.ts` files answer **"does the flow work?"** (functional). This doc adds
the **"is the output good?"** layer — evaluation criteria grounded in your own
standards from the Marketing vault and Knowledge Base workflows, so a generation
isn't just "rendered" but "meets the creative bar a real HomeySG-style campaign
would require."

Sources these criteria are derived from:
- `Knowledge Base/Workflows/Script Writing Workflow.md` — hook-decode + format beats + the viral-hook set.
- `Knowledge Base/Workflows/Slideshow Workflow.md` — the slideshow JSON spec.
- `Knowledge Base/Prompt styles.md` — image-prompt quality rules.
- `Knowledge Base/Content Calendar/Project1` — the Homey / curtains / Jade worked example (the **golden case**, captured in `e2e/golden/homey-curtains.json`).
- `Marketing/Copywriting/Research/Choose the Segment and Awareness Level…` + `…/Curtains Market Awareness.md` — awareness → message mapping.
- `Marketing/Copywriting/… Voice Of Customer` — VOC / language grounding.

**How these run:** quality criteria need *real* generations, so run the journeys
in **live mode** (`E2E_MODE=live`), capture the outputs, and grade them. Grading
is a mix of **deterministic checks** (spec compliance — automatable) and
**LLM-as-judge** (hook quality, awareness match — see the grader at the end).

---

## Golden reference case

Every generative journey is benchmarked against `e2e/golden/homey-curtains.json`:
Homey Furnishing blackout curtains, HDB/BTO audience, **Product Aware**, the
"why your blackout curtains are not making your room dark" hook (Niche Call Out),
and the Jade character. Use it as the fixed input and the expected-output yardstick.

---

## Reusable rubrics

Each rubric scores an output; the **threshold** is the pass bar. Deterministic
rubrics (R3) can be asserted in code; the rest are LLM-graded or manual.

### R1 — Hook quality  *(LLM-graded, 0–5; pass ≥ 4 AND fully decodable)*
From the Script Writing Workflow + viral-hook set + VOC. A passing hook:
- **Decodable** — a grader can fill all six fields: Viewer, Pain, False belief,
  Real cause, Desired result, Tension. *(Hard gate: if any field can't be
  inferred, fail regardless of score.)*
- **Hits a real pain in the audience's words** (VOC), not a generic benefit.
- **Uses ≥1 viral mechanism**: contrast, curiosity gap, specificity/numbers,
  identity call-out, false-belief reversal, pain-vs-paradise, loss aversion.
- **Native, not corporate** — reads like a creator, not an ad headline.
- **Fresh** — not a paraphrase of the provided example hooks.

### R2 — Awareness match  *(LLM-graded, pass/fail)*
The hook + body must fit the target awareness stage. For the golden case
(**Product Aware**): lead with **proof, fit, and next step**; do **not**
re-explain what blackout curtains are. Fail if the copy educates a Product-Aware
buyer from zero, or (inversely) assumes knowledge a Problem-Aware buyer lacks.

### R3 — Slideshow spec compliance  *(deterministic, pass/fail — automatable)*
Against the Slideshow Workflow JSON:
- `slide_count` within **1–10**.
- `aspect_ratio` ∈ {1:1, 3:2, 4:5, 9:16, 16:9} (default 9:16).
- every slide's `text` word count is within the chosen bucket
  (1-2 / 3-5 / 6-8 / 9-12 words).
- `text_alignment` is **randomized** across top/center/bottom (not all identical
  when slide_count ≥ 3).
- every slide has both `image_summary` and `text`.

### R4 — Image-prompt quality  *(LLM-graded, 0–5; pass ≥ 4)*
From Prompt styles: prefers **quantified parameters** over adjectives, uses **pro
terminology** (lenses, film stocks, named aesthetics), includes **negative
constraints** (no text, product not distorted, don't obscure the face), and adds
**sensory detail** where relevant.

### R5 — Character / scene consistency  *(LLM-graded on frames, 0–5; pass ≥ 4)*
From the Jade variables + Base Prompt. Across every generated image/slide/video
frame: same **face, hair, outfit + brand logo, location, and 9:16 selfie
framing**; no identity drift; UGC-authentic (handheld, natural daylight, raw).

### R6 — Research grounding  *(LLM-graded, pass/fail)*
From VOC + competitor + awareness research. Claims must **trace to the
knowledge-base sources**; language should **mirror VOC**; **no invented claims**
(e.g. no fabricated specs or guarantees the sources don't support).

---

## Per-journey criteria

| # | Journey | Functional gate (spec) | Quality rubrics | Grade via | Golden expectation |
|---|---------|------------------------|-----------------|-----------|--------------------|
| 1 | Character create + generate | 01 passes | **R4**, **R5** | LLM + manual | A Jade-consistent image whose prompt follows Prompt-styles rules |
| 2 | **Daily automation (flagship)** | 02 passes | **R1, R2, R3, R6** | R3 auto; R1/R2/R6 LLM | Slideshow whose hook decodes to the curtains pain, matches Product-Aware, obeys the slideshow spec, and is grounded in the KB |
| 3 | Swipe → recreate | 03 passes | swipe-analysis usefulness + **R4/R5** | LLM | Transcript is faithful; aesthetic breakdown is actionable; the recreation reflects the swiped concept in Jade's likeness |
| 4 | Character → video | 04 passes | **R5** (continuity) | LLM on frames | Last-frame continuity per the UGC Video Workflow; no identity drift; watermark-free output |
| 5 | Greenscreen meme | 05 passes | meme relevance + readability | LLM + manual | Hook text is legible, on-beat, and shareable; render is clean |
| 6 | Manual slideshow | 06 passes | **R3** (primary) + **R1** for the hook slide | R3 auto; R1 LLM | Spec-compliant slides; strong opening hook |
| 7 | Research-driven content | 07 passes | **R6** + **R1/R2** | LLM | Hooks + body trace to the derm KB; variables produce varied, non-repeating hooks |
| 8 | Library curation | 08 passes | **R5** (product placement) + safe-prune check | auto + LLM | Shared images survive prune; the outfit asset appears in-frame consistently |

---

## Benchmark targets (the numbers to hit)

Run each generative journey **N ≥ 10 times** against the golden case and measure:

| Metric | Target |
|---|---|
| Hook **decodable** (R1 hard gate) | **100%** of runs |
| Hook quality **≥ 4/5** (R1) | ≥ 80% of runs |
| Awareness match pass (R2) | **100%** |
| Slideshow spec compliance (R3) | **100%** (deterministic) |
| Image-prompt quality ≥ 4/5 (R4) | ≥ 80% |
| Character consistency ≥ 4/5 (R5) | ≥ 90% of frames |
| Research grounding pass, no invented claims (R6) | **100%** |
| Duplicate hook/image across 10 runs (dedup) | 0 exact repeats |
| Provider failure surfaces a real message (not generic 500) | 100% |
| Per-run cost / latency | within your budget (record + trend, no hard gate) |

---

## LLM-as-judge grader (for R1, R2, R4, R5, R6)

Capture each run's output, then grade with a fixed prompt so scores are
comparable across runs. Template:

```
You are a strict creative-performance judge for short-form UGC ads.

RUBRIC:
<paste the rubric R1/R2/R4/R5/R6 text>

GOLDEN REFERENCE (brand, audience, awareness, hook-decode, character):
<paste e2e/golden/homey-curtains.json>

CANDIDATE OUTPUT:
<the generated hook / slide texts / image prompt / frames>

Return JSON only:
{
  "score": 0-5,            // omit for pass/fail rubrics
  "pass": true|false,
  "decode": { "viewer": "...", "pain": "...", "false_belief": "...",
              "real_cause": "...", "desired_result": "...", "tension": "..." },
  "mechanisms": ["..."],   // for R1
  "reasons": "1-3 sentences",
  "fixes": "what would raise the score"
}
```

Wire it into a spec by calling your own model (or a cheap judge model) inside a
`test.step("grade")`, asserting `pass === true` and `score >= threshold`, and
attaching the JSON via `testInfo.attach` so failures show the rationale. Keep the
grader model + prompt **pinned** so benchmark numbers stay comparable over time.

---

## What stays manual

- Final **video watchability** (pacing, audio, cut continuity) — human review.
- **Brand-safety / claim accuracy** beyond R6's source-tracing.
- Real **platform performance** (retention, CTR) — that's the true north metric;
  these benchmarks are the pre-flight proxy for it.
