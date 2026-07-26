---
title: "The testing facility"
description: "Proposed: hold an automation constant, vary one input at a time, sweep every hook, and compare the outputs — what the Slide Testing Center already does, the blockers underneath, and the failures worth checking."
---

# The testing facility

Pick an automation. Pick which variables move. Pick the variations. Run every hook and read the
results side by side.

Change one input — the hook, a variable draw, the tone, the model — and see how the output moves
while everything else stays fixed.

> **Proposed workflow.** A narrow version ships today at `/debug` as the **Slide Testing Center**,
> and it is internal-only. The screen described here is not built, and the mechanism it needs —
> per-run input overrides — does not exist. Every other primitive does: non-persisting previews,
> hook enumeration, variable binding resolution, deterministic QA. They are named below so this can
> be built or dropped on evidence rather than guesswork.

`Last tested: not implemented — Slide Testing Center and building blocks verified 2026-07-26`

## Why it does not work today

An automation's inputs live in its saved schema. The two run tools take almost nothing:

| Tool | Inputs |
| --- | --- |
| `lumenclip_slideshow_generate` | `automationId`, optional `requestId` |
| `lumenclip_automation_run` | `automationId`, optional `topic`, `requestId` |

Neither accepts a per-run override. So varying one input means mutating the automation with
`lumenclip_automation_schema_update`, running, then mutating it back. That is destructive, racy
against the scheduler, and leaves no record of which run used which configuration.

`topic` on `lumenclip_automation_run` is the single exception — the one input you can vary per run
without touching saved state.

## What exists today

`/debug` renders `SlideTestingCenter`, gated by `internalToolsEnabled()` — which returns true
whenever `NODE_ENV !== "production"`, or in production only when `ENABLE_INTERNAL_TOOLS === "true"`.
Otherwise the route calls `notFound()`.

Its real labels:

| Control | Label |
| --- | --- |
| Automation picker | **Choose automation** |
| Model picker | **Choose models**, **Search OpenRouter models**, **Custom OpenRouter model ID** |
| Schema inspector | **Automation details** — sections **Tone**, **Style**, **Hooks**, **Template slides** |
| Per-slide inspector | **Grid**, **Overlay**, **Collection**, and **No text** for empty text items |
| Result stepper | **Previous hook** / **Next hook**, **Previous generated slide** / **Next generated slide** |
| Empty state | **No test runs yet** |

Each run posts:

```
POST /api/temp/testing-center/generate
{ "automationId": "…", "model": "…", "systemPrompt": "…", "promptInstructions": "…" }
→ { "selectedHook": "…", "result": { … } }
```

Selecting several models and pressing generate fans out one request per model, each tracked as its
own run with its own status. That is the entire comparison capability today: **the model is the
only dimension the UI can vary.** It varies the model while holding the automation fixed — exactly
the shape of this workflow, for one dimension, in an internal-only surface.

Under it sits `previewAutomationRunPlan(schema, input)`, which is the same planner persisted runs
use — deliberately so, with a comment in `lib/automation-runner.ts` warning against growing a
second generation implementation. It accepts `textModel`, `systemPrompt`, `promptInstructions`,
`includeTextGenerationResult`, `now`, and `random`, and it writes nothing.

**That `random` parameter matters.** The planner already takes an injectable RNG. The determinism
this workflow needs is not missing from the engine — it is missing from every caller above it.

Two more things are already in place:

- **Variable substitution is recorded.** `[[TOKEN]]` values bind to word collections, and the run
  plan persists `hookSubstitutions`, so a variant's draw is durable and inspectable.
- **Near-duplicate detection exists.** `lib/text-similarity.ts` backs the `NEAR_DUPLICATE_OUTPUT`
  QA finding, so "did these two variants say the same thing" needs no new infrastructure.

## Proposed workflow summary

### 1. User asks

> "Run this automation across all its hooks with the zodiac variable set to each sign, and show
> me the grid."

### 2. Person opens **Testing facility** and fills four fields

| Step | Control | What it does |
| --- | --- | --- |
| 1 | **Choose automation** | One saved automation. Loads its hook pool, variable bindings, tone, and slides. |
| 2 | **Choose variables** | Multi-select over the `[[TOKEN]]`s the automation actually uses. |
| 3 | **Choose variations** | Per selected variable, the values to sweep — drawn from its bound word collection, or typed. |
| 4 | **Test all hooks** | Enumerates the enabled hook pool instead of drawing one hook. |

Steps 2 and 3 need no invention. `deriveAutomationVariableBindings({ schema, collections })`
already returns, for each token, a `source` of `"runtime" | "derived" | "override" | "missing"`
plus the bound `collectionId` and `collectionName`. That is exactly the option list step 2 needs,
and `"missing"` is exactly the row that should be disabled with a reason.

Runtime variables cannot be swept and should be shown as fixed: `slide_count`, `current_year`,
`current_month`, `current_month_number`, `current_day`, `current_weekday`, `current_date`,
`current_iso_date`, `current_time`.

### 3. The dimensions worth supporting

Each maps to something that already exists in the schema:

| Dimension | What varies | Exists today as |
| --- | --- | --- |
| `hook` | Which hook seeds the generation | The enabled hook pool |
| `variable` | Which value a `[[TOKEN]]` draws | Word collections + variable bindings |
| `tone` / `style` | Voice instructions | Format panel fields |
| `model` | The OpenRouter text model | Already comparable in the Slide Testing Center |
| `collection` | Which image pool slides draw from | `image_collection_ids` |

Behind the screen this is one call — `lumenclip_automation_experiment_run` *(proposed)*:

```json
{
  "automationId": "…",
  "hold": "all",
  "vary": { "dimension": "hook", "values": ["hook_a", "hook_b", "hook_c"] },
  "repeats": 2,
  "bypassRecentSimilarity": true,
  "requestId": "hook-sweep-001"
}
```

returning an `experimentId` and a `runs[]` of `{ runId, variant, outputId }`.

### 4. Intermediate steps

Step 4 of the form is already a function. `expandAllHookCombinations(hook, slots, collections,
options)` returns every `{ text, template, substitutions }` for one hook template across its
variable slots. With `noDuplicates: true`, a repeated token becomes its own draw —
`[[ZODIAC]] VERSUS [[ZODIAC]]` yields two different signs, tracked internally as `zodiac` and
`zodiac_2`.

The sweep is that expansion, filtered to the chosen variations, run through
`previewAutomationRunPlan` with a fixed `random` per cell so the only thing moving is the cell's
own variable. Each variant otherwise runs the normal generation path, so every existing guarantee
holds: the plan is persisted, QA findings are recorded, slides are rendered. Nothing new is
invented at generation time — the experiment is a loop plus bookkeeping.

### 5. Results grid, using tools that already exist

Rows are hooks, columns are variations, each cell one preview. No new comparison engine is required
for a first version:

- **`lumenclip_run_plan_get`** returns the persisted plan including `hookSubstitutions`, so you can
  see exactly which token resolved to which value in each run.
- **`lumenclip_output_get`** returns per-slide text and image identity.
- **`lumenclip_output_validate`** is deterministic and model-free, returning `COUNT_MISMATCH`,
  `UNRESOLVED_TOKEN`, `DUPLICATE_VARIABLE_DRAW`, `NEAR_DUPLICATE_OUTPUT`, `EMPTY_SLIDE_TEXT`,
  `TRUNCATED_SLIDE_TEXT`.
- **`lumenclip_automation_hooks_get`** returns the canonical pool with `total`, `enabled`,
  `disabled`, `uniqueSuggested`, `duplicateSlotCount`, and `duplicateGroups` whose `kind` is
  `"exact"` or `"near"` — so the grid can grey out hooks that duplicate one already shown.
- **`lumenclip_hook_performance`** (`days` 1–3650, default 90) joins hook ids to confirmed
  publications and their metrics, so a hook already tested in the wild carries its real publish
  count, views, shares, saves, share rate, and mean slide-1-to-2 retention next to its fresh
  preview.

That is enough to answer "did this variant produce valid, distinct copy" without a model in the
loop.

### 6. Result

One automation, one screen, N hooks × M variations of previewed copy — none of it persisted, none
of it publishable, each cell tagged with the variant that produced it and annotated with its own QA
findings and, where it exists, its historical performance.

## The gaps that make this a proposal

1. **No per-run input override.** The blocker. Varying anything except `topic` requires mutating
   saved state.
2. **The Slide Testing Center reads templates, not automations.** `/debug` calls
   `listAutomationTemplateRecords()` and its 404 is **`Automation template was not found`**. A
   facility for testing *your* automations has to read saved automation records instead. This is
   the single largest difference between the shipped screen and the asked-for one.
3. **It is internal-only.** Both the page and the route call `internalToolsEnabled()`; the route
   returns `{ "error": "Not found" }` with status 404 when it is off. Nothing about the screen is
   reachable by a normal user in production today.
4. **Only the model varies.** `systemPrompt` and `promptInstructions` are editable, but there is no
   variable or hook axis in the request body.
5. **Determinism is available but unplumbed.** `random` reaches `createAutomationRunPlan` and stops
   there. No route, tool, or UI passes it. Until one does, repeating a variant re-rolls the model
   *and* the variable draws, so a difference between two runs cannot be attributed to the changed
   input alone — only `repeats` and honest reporting of variance make the comparison meaningful.
6. **Recent-output dedup fights repetition.** Generation compares against recent outputs and
   rewrites when similarity is at or above **0.85**, over a **45-day** window and the last **20**
   records, emitting the progress line `Rewriting slide text (too similar to a recent post)`. A
   sweep of similar variants will trip this and silently alter the copy being compared. An
   experiment mode must bypass it — hence `bypassRecentSimilarity` above.
7. **Hook pools are consumed.** Repeated runs can exhaust unused hook combinations and throw
   `No unused hook combinations remain for this automation.`
8. **No experiment grouping.** Runs carry `requestId` but nothing ties a set of runs together as
   one comparison.
9. **There is no "project".** The codebase has no project entity. The unit an automation belongs to
   is the workspace (`WorkspaceMember`), and hooks belong to an automation. "Test all hooks for a
   project" resolves to "test all hooks for an automation" — or, if a cross-automation sweep is
   genuinely wanted, that is a new grouping concept and should be named as one.
10. **Cost is real and unmetered here.** Every cell is a full generation: OpenRouter for text,
    OpenRouter again per slide when AI image selection is on, plus rendering. A 5-hook × 3-repeat
    sweep is 15 generations; a 10-hook × 12-sign grid is 120. Slideshows have no cost estimator —
    only the UGC path does, via `lumenclip_ugc_estimate`.

## Failures to check

1. **Manual runs never publish**, which is what makes this safe. `force: true` marks a run
   `generationSource: "manual"`, and the publishing branch is gated against that. A sweep cannot
   accidentally post.
2. **Previews do not consume the hook pool, but real runs do.** Building the facility on
   `previewAutomationRunPlan` avoids the exhaustion error above; building it on
   `lumenclip_automation_run` does not.
3. **Blockers force-pause a live automation.** If a variant leaves the automation in an unrunnable
   state, the runner sets `status: "paused"` and `schedule.paused: true`. A sweep that mutates
   schema to vary inputs can therefore pause a live automation as a side effect — a second reason
   not to implement variation by mutation.
4. **`already_ran` will skip a repeat** within the same slot unless each run is forced.
5. **A `"missing"` binding is not an error until run time.** `deriveAutomationVariableBindings`
   reports `source: "missing"` when a token matches zero or more than one collection — note that
   *ambiguous* and *absent* collapse into the same status, so "two collections claim this variable"
   looks identical to "no collection does".
6. **`hook_slots` overrides win over name matching.** A token bound explicitly through the
   automation's `hook_slots` resolves to that collection regardless of collection naming. A
   variations picker that reads collections by name will disagree with what the run actually draws.
7. **Word-range misses are warnings, not failures.** A variant can look successful while its copy
   sits outside the configured bounds; only `lumenclip_output_validate` surfaces it.
8. **Image selection is a second source of variance.** With `aiImageSelection` on, the image choice
   is itself a model call. Comparing text variants without pinning images means two things moved at
   once.
9. **Model generation fails with 503, not 200.** The route returns
   `{ "error": <textGenerationError> }` at status 503 when the model call fails but the plan is
   otherwise fine. A grid runner that only checks for a missing `result` will mislabel these as
   empty cells.
10. **Missing inputs are 400s with fixed strings**: `Automation is required` and
    `OpenRouter model is required`.
11. **Featured model ids are a curated list, not the full catalogue.** The registry pins a
    `featuredModelIds` set alongside an `excludedModelIds` set for the testing centre. A model
    absent from the picker is not necessarily absent from OpenRouter — hence
    **Custom OpenRouter model ID**.
12. **Video automations cannot be swept at all** — they have no server-side runner.

## If this is built

Ship it in this order, because each step is independently useful:

1. Point the existing Slide Testing Center at saved automations instead of templates. That alone
   turns an internal demo into a usable tool and requires no new UI.
2. Add **Test all hooks** — it is `expandAllHookCombinations` plus a results list, and it needs no
   per-run override work at all.
3. Add a loop over `topic` plus `lumenclip_output_validate`, since `topic` is the one input that
   already varies per run and validation needs no model. That proves the comparison surface is
   worth having before the harder work is attempted.
4. Add the variable and variation axes, which is where the per-run override problem actually has to
   be solved.
5. Plumb `random` through the preview route last. Without it the grid is still readable; with it
   the comparison is honest.

Previous: [Analysing a slideshow's tone](/docs/workflows/analyze-slideshow-tone) ·
Next: [Scheduling posts](/docs/workflows/schedule-posts)
