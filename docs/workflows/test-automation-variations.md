---
title: "Testing automation variations"
description: "Proposed: hold an automation constant, vary one input at a time, and compare the outputs — what exists today, what is missing, and the failures worth checking."
---

# Testing automation variations

Change one input — the hook, a variable draw, the tone, the model — and see how the output
moves while everything else stays fixed.

> **Proposed workflow.** No tool or screen does this today. The building blocks below are all
> real and callable; the comparison layer is not. This page describes what the workflow would
> be and names the specific gaps, so it can be built or dropped on evidence rather than
> guesswork.

`Last tested: not implemented — building blocks verified 2026-07-25`

## Why it does not work today

An automation's inputs live in its saved schema. The two run tools take almost nothing:

| Tool | Inputs |
| --- | --- |
| `lumenclip_slideshow_generate` | `automationId`, optional `requestId` |
| `lumenclip_automation_run` | `automationId`, optional `topic`, `requestId` |

Neither accepts a per-run override. So varying one input means mutating the automation with
`lumenclip_automation_schema_update`, running, then mutating it back. That is destructive,
racy against the scheduler, and leaves no record of which run used which configuration.

`topic` on `lumenclip_automation_run` is the single exception — the one input you can vary
per run without touching saved state.

## Proposed workflow summary

### 1. User asks

> "Try this automation with each of the five hooks and show me which reads best."

### 2. Agent calls `lumenclip_automation_experiment_run` *(proposed)*

**In**

```json
{
  "automationId": "…",
  "hold": "all",
  "vary": {
    "dimension": "hook",
    "values": ["hook_a", "hook_b", "hook_c"]
  },
  "repeats": 2,
  "bypassRecentSimilarity": true,
  "requestId": "hook-sweep-001"
}
```

The dimensions worth supporting, each mapping to something that already exists in the schema:

| Dimension | What varies | Exists today as |
| --- | --- | --- |
| `hook` | Which hook seeds the generation | The enabled hook pool |
| `variable` | Which value a `[[TOKEN]]` draws | Word collections + variable bindings |
| `tone` / `style` | Voice instructions | Format panel fields |
| `model` | The OpenRouter text model | Already comparable in the Slide Testing Center |
| `collection` | Which image pool slides draw from | `image_collection_ids` |

**Out**

```json
{
  "experimentId": "…",
  "runs": [
    { "runId": "…", "variant": { "hook": "hook_a" }, "outputId": "…" },
    { "runId": "…", "variant": { "hook": "hook_b" }, "outputId": "…" }
  ]
}
```

### 3. Intermediate steps

Each variant runs the normal generation path, so every existing guarantee holds: the plan is
persisted, QA findings are recorded, and slides are rendered. Nothing new is invented at
generation time — the experiment is a loop plus bookkeeping.

### 4. Agent compares with tools that already exist

No new comparison engine is required for a first version:

- **`lumenclip_run_plan_get`** returns the persisted plan including `hookSubstitutions`, so you
  can see exactly which token resolved to which value in each run.
- **`lumenclip_output_get`** returns per-slide text and image identity.
- **`lumenclip_output_validate`** runs deterministic, model-free QA and returns the finding
  codes `COUNT_MISMATCH`, `UNRESOLVED_TOKEN`, `DUPLICATE_VARIABLE_DRAW`, `NEAR_DUPLICATE_OUTPUT`,
  `EMPTY_SLIDE_TEXT`, `TRUNCATED_SLIDE_TEXT`.

That is enough to answer "did this variant produce valid, distinct copy" without a model in the
loop.

### 5. Result

A set of runs sharing one automation and one experiment id, each tagged with the variant that
produced it, comparable side by side.

## What exists today that this would build on

**The Slide Testing Center** (`/debug`, gated by `internalToolsEnabled()`) already does a
narrow version of this: pick an automation, pick **multiple OpenRouter models**, edit the
prompt, and step through generated slides and hooks. Its labels include **Choose automation**,
**Choose models**, **Generation prompt**, **Next hook**, **Next generated slide**. It varies the
*model* while holding the automation fixed — exactly the shape of this workflow, for one
dimension, in an internal-only surface.

**Variable substitution is already recorded.** `[[TOKEN]]` values are bound to word collections,
and the run plan persists `hookSubstitutions`, so a variant's draw is already durable and
inspectable.

**Near-duplicate detection already exists.** `lib/text-similarity.ts` backs the
`NEAR_DUPLICATE_OUTPUT` QA finding, so "did these two variants say the same thing" is
answerable without new infrastructure.

## The gaps that make this a proposal

1. **No per-run input override.** The blocker. Varying anything except `topic` requires
   mutating saved state.
2. **No determinism control.** There is no seed. Repeating a variant re-rolls the model *and*
   the variable draws, so a difference between two runs cannot be attributed to the changed
   input alone. Without this, "everything else remains the same" is not actually true — only
   `repeats` and honest reporting of variance make the comparison meaningful.
3. **Recent-output dedup fights repetition.** Generation compares against recent outputs and
   rewrites when similarity is at or above **0.85**, over a **45-day** window and the last
   **20** records, emitting the progress line `Rewriting slide text (too similar to a recent post)`.
   A sweep of similar variants will trip this and silently alter the copy being compared. An
   experiment mode must bypass it — hence `bypassRecentSimilarity` above.
4. **Hook pools are consumed.** Repeated runs can exhaust unused hook combinations and throw
   `No unused hook combinations remain for this automation.`
5. **No experiment grouping.** Runs carry `requestId` but nothing ties a set of runs together
   as one comparison.
6. **Cost is real and unmetered here.** Every variant is a full generation: OpenRouter for text,
   OpenRouter again per slide when AI image selection is on, plus rendering. A 5-hook × 3-repeat
   sweep is 15 generations. Slideshows have no cost estimator — only the UGC path does, via
   `lumenclip_ugc_estimate`.

## Failures to check

1. **Manual runs never publish**, which is what makes this safe. `force: true` marks a run
   `generationSource: "manual"`, and the publishing branch is gated against that. A sweep cannot
   accidentally post.
2. **Blockers force-pause a live automation.** If a variant leaves the automation in an
   unrunnable state, the runner sets `status: "paused"` and `schedule.paused: true`. A sweep that
   mutates schema to vary inputs can therefore pause a live automation as a side effect — a
   second reason not to implement variation by mutation.
3. **`already_ran` will skip a repeat** within the same slot unless each run is forced.
4. **Word-range misses are warnings, not failures.** A variant can look successful while its copy
   sits outside the configured bounds; only `lumenclip_output_validate` surfaces it.
5. **Image selection is a second source of variance.** With `aiImageSelection` on, the image
   choice is itself a model call. Comparing text variants without pinning images means two
   things moved at once.
6. **Video automations cannot be swept at all** — they have no server-side runner.

## If this is built

The smallest useful version is a loop over `topic` plus `lumenclip_output_validate`, since
`topic` is the one input that already varies per run and validation needs no model. That would
prove the comparison surface is worth having before any of the harder work — per-run overrides
and seeding — is attempted.

Previous: [Creating a slideshow automation](/docs/workflows/create-slideshow-automation) ·
Next: [Scheduling posts](/docs/workflows/schedule-posts)
