# AI Character Workflows — Audit & Simplification

A serious pass over the 11 generation workflows in the character editor: what each one actually needs, where the UI makes them hard to execute, and how to simplify. Grounded in the code (`realfarm-character-ui-config.ts`, `workflow-helpers.ts`, `characters-view.tsx`) and the interface-design vault.

## The 11 workflows at a glance

Two hidden classes exist in code: **create** (works from the character alone) and **edit** (requires a generated image selected as "source"). The user never sees this split.

| Workflow | Class | Hard requirement (beyond prompt) | Extra controls | Outputs |
|---|---|---|---|---|
| Free Generate | create | — | assets (optional) | 1 |
| Build From Modules | create | — | 9 module dropdowns + count | 1–4 |
| Batch Photo Dump | create | — | count | 1–12 |
| TikTok Slideshow | create | — | slide count | 2–10 |
| Product UGC | create | product asset (implicit) | product / audience / angle + count | 1–5 |
| Recreate Reference | edit | source image **+** reference image | recreate mode + count | 1–4 |
| Animate Image | edit | source image | — | 1 |
| Motion Control | edit | source image **+** motion video | — | 1 |
| Seedream Selfie | edit | source image | preset + size | 1 |
| Outfit Transfer | edit | source image **+** outfit asset | — | 1 |
| Pose Cut Video | edit | source image | — | 1 |

## What makes them hard to execute (findings)

**1. The create/edit split is invisible and fails silently.** Picking "Motion Control" with no image selected doesn't warn you — `currentWorkflow` silently falls back to `free_generate` (`getCharacterWorkflowMode(...) === "edit" && !hasEditSource ? "free_generate" : ...`). You think you're doing one thing and get another. *Separate UX from UI* + *Affordance*.

**2. Required inputs were only enforced at click-time via toasts.** Recreate needs a reference, Motion needs a video, Outfit needs an outfit — but the UI gave no signal until you pressed Generate and got a red toast. *Tune… → States: disabled* ("Why is this unavailable?").

**3. Inputs were scattered, not grouped.** The "source" image rendered as a chip inside the controls row; the character headshot + assets rendered as separate squares in a different row; selected assets *also* appeared as text pills. Three representations of the same concept — "things fed into this generation." *Box Model grouping* ("these things belong together").

**4. Three separate count states with different ranges.** `imageGenerateCount` (1–5), `photoDumpCount` (1–12), `slideshowSlides` (2–10) are distinct states surfaced as different steppers. One "how many" concept wearing three costumes.

**5. Build From Modules can't fully be used.** It has 9 modules (action, pose, expression, hair, top, bottom, device, photography, background) but the composer only renders the **first 4** (`InlineModuleControls` slices `0,4`). The other 5 were only editable in the now-disabled side panel — so today they're uneditable.

**6. Edit workflows silently discard the prompt.** `compileWorkflowUserPrompt` is called with `prompt: isEditWorkflow ? "" : prompt`, yet Recreate/Motion/Seedream/Outfit/Pose all show placeholder text inviting "optional changes." You can type into… nothing, because the textarea is hidden for edit workflows and the prompt is forced empty anyway.

**7. Labels under-promise or mislead.** Several "Optional: …" placeholders describe inputs that are actually required (reference, motion video).

## What I changed now (shipped)

Focused, low-risk fixes that address the loudest problems:

- **Unified input row.** Source, character, reference, and assets now render as one consistent row of labeled thumbnails (`PromptInputRow`) — source badged in the accent color and removable, character always shown, assets removable. This is the direct answer to "why are assets not in a row": they are now. The old split source-chip / attachment-squares / text-pills are gone.
- **Required inputs are now an affordance, not a surprise.** Generate is disabled with a plain-language reason ("Add a reference image", "Select a source image first", "Choose an outfit asset", "Add a motion reference") shown next to the button, instead of failing on click.
- **The Mode dropdown is grouped.** Options now sit under **Create** and **Edit selected image** optgroups, so the hidden create/edit distinction is finally visible, and the edit group only appears once you have a source image.

## Recommended simplification (proposed, needs your call)

These are larger and touch behavior, so I left them for you to decide:

1. **Collapse to ~5 top-level intents, with sub-options.** The 11 workflows are really a few jobs:
   - **Generate** (free / modules / photo dump / slideshow — differ mainly by count + variation)
   - **Recreate** (from a reference)
   - **Product ad** (product UGC)
   - **Restyle** (outfit transfer, seedream selfie)
   - **Animate** (animate / motion control / pose-cut video)

   Pick the intent first, then a secondary control refines it. This shrinks the dropdown from 11 flat items to 5 obvious ones.

2. **One "count" control.** Replace the three count states with a single `count` that each workflow clamps to its own min/max. Less state, one mental model.

3. **Make required inputs first-class slots.** Instead of hunting for the "Reference" / "Outfit" / "Motion" buttons inside the controls row, render an empty, labeled input slot in the unified row ("+ Reference") that opens the right picker. The row then shows exactly what a workflow consumes, filled or empty.

4. **Expose all 9 modules** (or intentionally cut to the 4 that matter) — the current half-shown state is the worst option.

5. **Decide the edit-workflow prompt.** Either show the textarea for edit workflows and pass the text through (honor the "optional changes" placeholders), or drop those placeholders. Right now it's wired to look editable but isn't.

6. **Fix the silent fallback.** If someone selects an edit workflow without a source, don't silently switch to Free Generate — keep the selection and show the disabled reason (now that the disabled-with-reason pattern exists, this is a one-line change).
