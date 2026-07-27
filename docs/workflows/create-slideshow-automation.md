---
title: "Creating a slideshow automation"
description: "Building a slideshow automation and generating a draft on demand — the agent calls, the editor sections, why a manual run never publishes, and the failures worth checking."
---

# Creating a slideshow automation

Creating the automation and generating one draft immediately, without waiting for a posting
slot. Scheduling is a separate journey.

`Last tested: 2026-07-26, live against cfarm-eight.vercel.app`

## Workflow summary

### 1. User asks

> "Set up a slideshow automation about HDB resale prices and show me a draft."

### 2. Agent calls `lumenclip_automation_templates_list`

**In**

```json
{ "kind": "slideshow", "limit": 20 }
```

`query` filters on name and theme. `includeSchema` defaults to `false`.

**Out** — `{ items, total, hasMore }`. Templates carry no schedule: the persisted template
schema deliberately strips `title`, `status`, `schedule`, and `social_integrations`.

### 3. Agent calls `lumenclip_automation_create`

**In**

```json
{
  "name": "HDB resale prices",
  "templateId": "template-cutout-swap-carousel",
  "kind": "slideshow",
  "status": "paused",
  "requestId": "hdb-automation-001"
}
```

`requestId` is a real idempotency key — reusing it returns
`{ "created": false, "reused": true }` with the original automation rather than a duplicate.

**Out**

```json
{
  "created": true,
  "reused": false,
  "requestId": "hdb-automation-001",
  "templateId": "template-cutout-swap-carousel",
  "automation": { "id": "…", "kind": "slideshow", "status": "paused", "schema": { … } }
}
```

### 4. Agent calls `lumenclip_slideshow_generate`

**In**

```json
{ "automationId": "…", "requestId": "hdb-draft-001" }
```

Only `automationId` is required. This call runs with `force: true`, so automation status and
the posting schedule are both bypassed.

**Out**

```json
{
  "automationId": "…",
  "requestId": "hdb-draft-001",
  "runs": [
    {
      "slideshowId": "…",
      "previewUrl": "https://…/share/slideshows/…?token=…",
      "downloadUrl": "https://…/api/public/slideshows/…/download?token=…"
    }
  ],
  "skipped": []
}
```

`previewUrl` is the public review page and `downloadUrl` is a direct ZIP
download. The same fields are returned in the slideshow output from
`lumenclip_automation_run` and by `lumenclip_output_get`.

To start from an existing automation instead of a catalog template, call
`lumenclip_automation_clone` with `sourceAutomationId`, a new `name`, and a stable
`requestId`. It deep-copies the schema, hook pool, collection bindings, publishing settings,
and schedule into a paused automation. Outputs and run history are deliberately not copied.

Individual hook records may set `bodySlideCount` and `tone`. These override the automation
defaults only when that hook is selected. `[[SLIDE_COUNT]]` resolves to the selected hook's
body-slide count, excluding hook and CTA slides.

### 5. Intermediate steps

The runner claims a slot, creates a run, then builds the plan. Progress strings are literal:

| Stage                                                 | What happens                                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Selecting hook`                                      | Picks from enabled hooks in the pool                                               |
| `Writing slide text`                                  | OpenRouter; needs `OPENROUTER_API_KEY`                                             |
| `Rewriting slide text (too similar to a recent post)` | Only if similarity ≥ 0.85 against the last 45 days / 20 records                    |
| `Choosing images`                                     | Draws from the configured collections; per-slide AI selection also uses OpenRouter |
| `Aligning slide text with selected images`            | One coherence-repair pass                                                          |
| `Rendering slides`                                    | SVG per slide, rasterised to PNG with `sharp`                                      |

Slides land at `/api/local-assets/slideshows/outputs/<slideshowId>/slide-001.png` and are
mirrored to the Appwrite Storage bucket `slideshows`.

### 6. Result

An unpublished draft. **A manual or MCP run never publishes** — the publishing branch is
gated on `generationSource !== "manual"`, and `force: true` always marks the run manual.

## UI workflow

| Step | Action                                                        | What happens                                                                                                                                         |
| ---- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Open `/app?view=automations`                                  | The automations list                                                                                                                                 |
| 2    | Press **New automation**                                      | Opens the template picker, accessible title _Automation templates_                                                                                   |
| 3    | Filter by **Slideshow**, **Video**, or **Other social media** | Search placeholder _Search templates..._                                                                                                             |
| 4    | Hover a card and press **Add**                                | Creates from that template                                                                                                                           |
| 5    | Editor sidebar                                                | **Overview**, **Slideshow Format**, **Hooks (N) & Style**, **Analytics**, **Schedule**, **Social Media Settings**, **Published Posts**, **Settings** |
| 6    | Press **Generate**                                            | Reads **Generating…** while running                                                                                                                  |

## Failures to check

1. **A new automation is already scheduled.** The default schema seeds
   `posting_times: [{ time: "11:00 AM", days: <all> }]` with `posting_mode: "auto"` and a
   30-minute generation lead. "Creating without a schedule" is not the default state — use
   **Generate** / `lumenclip_slideshow_generate` to get a draft without waiting for a slot.
2. **Default status differs by surface.** UI creation hardcodes `status: "live"`; MCP
   `automation_create` defaults to `"paused"`.
3. **`requestId` means different things on the two run tools.**
   `lumenclip_automation_run` is genuinely idempotent — it scans prior runs. On
   `lumenclip_slideshow_generate` it is only a trace key, and the tool is annotated
   `idempotentHint: false`. Its own description calls it an idempotency key; that description
   is wrong, on a billable call.
4. **Blockers force-pause a live automation.** If readiness checks fail, the run is skipped
   _and_ the automation is set to `paused`. Blocker messages include
   `Add at least one enabled hook.`, `Select an image collection.`,
   `Collection “<name>” has no usable images.`
5. **Skip reasons are a fixed union**: `not_live`, `not_due`, `already_ran`, `blocked`,
   `no_images`, `insufficient_unique_images`, `hooks_exhausted`. `no_images` is only reported
   when every blocker is collection-related.
6. **Hook exhaustion is an error, not a skip**:
   `No unused hook combinations remain for this automation.`
7. **Word ranges are enforced during generation.** An over- or under-length text item sends
   the model through the existing repair retry with the exact range violation. If every retry
   still misses the configured range, generation fails instead of shipping the invalid copy.
   QA still reports persisted legacy or externally-created violations as
   `WORD_LENGTH_VIOLATION`. Other QA codes are `COUNT_MISMATCH`, `UNRESOLVED_TOKEN`,
   `DUPLICATE_VARIABLE_DRAW`, `NEAR_DUPLICATE_OUTPUT` (the only warning), and
   `EMPTY_SLIDE_TEXT`.
8. **Interrupted runs self-heal after 10 minutes** to
   `Run was interrupted before it completed.`
9. **Video automations have no runner.** `lumenclip_automation_run` on one throws
   `Saved video automations do not yet have a server-side generation runner. They can be listed, inspected, scheduled, paused, and resumed through MCP.`
10. **Manual generation through the REST route needs both flags.**
    `POST /api/automations/run` returns `400 Interactive generation requires automationId and force=true`
    otherwise.

## Additional workflow notes

Sidebar labels and panel headings differ. The sidebar says **Schedule** but the panel heading
is **Posting times**; the sidebar says **Hooks (N) & Style** while the panel heading is
**Hooks & Style**.

Rendering is SVG → PNG via `sharp`, not a headless browser. MP4 export is optional and runs
through Rendi, needing `RENDI_API_KEY` — `lib/kie-image.ts` is not part of the slideshow path.

Data lands in `automations` and `automation_runs`; results in `outputs` under
`source_key: "result"`. Templates live in `permanent_assets` under `automation_template`.

Several tools named in `mcp/` do not exist — `lumenclip_slideshow_create`,
`lumenclip_automation_create_from_template`, `lumenclip_template_get`, and
`lumenclip_automation_preview` are proposals. The callable names are the ones above.

Previous: [Creating a collection](/docs/workflows/create-collection) ·
Next: [Analysing a slideshow's tone](/docs/workflows/analyze-slideshow-tone)
